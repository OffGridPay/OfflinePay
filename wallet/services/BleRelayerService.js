/**
 * BLE Relayer Service - Core BLE mesh functionality for OfflinePay
 * Handles advertising, scanning, handshakes, and payload transfer
 */

import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

let BlePlx;
try {
  BlePlx = require('react-native-ble-plx');
} catch (error) {
  BlePlx = null;
}

// Phase 0 draft UUIDs - will be finalized in T0.6
export const OFFLINEPAY_SERVICE_UUID = '0000AF10-0000-1000-8000-00805F9B34FB';
export const CONTROL_CHARACTERISTIC_UUID = '0000AF11-0000-1000-8000-00805F9B34FB';
export const PAYLOAD_CHARACTERISTIC_UUID = '0000AF12-0000-1000-8000-00805F9B34FB';
export const TELEMETRY_CHARACTERISTIC_UUID = '0000AF13-0000-1000-8000-00805F9B34FB';

// Device role flags for advertisement payload
export const DEVICE_ROLES = {
  OFFLINE: 0x01,
  ONLINE: 0x02,
  RELAY_CAPABLE: 0x04,
};

const DEFAULT_PEER_STALE_MS = 15000;
const PEER_MAINTENANCE_INTERVAL_MS = 5000;

export class BleRelayerService {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.walletAddress = options.walletAddress || null;
    this.peerStaleMs = options.peerStaleMs || DEFAULT_PEER_STALE_MS;
    this.manager = null;
    this.isAdvertising = false;
    this.isScanning = false;
    this.deviceRole = DEVICE_ROLES.OFFLINE;
    this.nearbyPeers = new Map(); // deviceId -> peerInfo
    this.sessions = new Map(); // sessionId -> sessionInfo
    this.peerMaintenanceTimer = null;
    this.selectedRelayerId = null;
    
    this.subscribers = {
      peerDiscovered: [],
      peerLost: [],
      roleChanged: [],
      sessionEstablished: [],
      relayerSelected: [],
    };
  }

  async initialize() {
    if (!BlePlx?.BleManager) {
      throw new Error('BLE not supported - react-native-ble-plx unavailable');
    }

    // Request BLE permissions on Android
    if (Platform.OS === 'android') {
      const hasPermissions = await this.requestBlePermissions();
      if (!hasPermissions) {
        throw new Error('BLE permissions not granted');
      }
    }

    try {
      this.manager = new BlePlx.BleManager({
        restoreStateIdentifier: 'OfflinePayRelayer',
        restoreStateFunction: null,
      });

      // Monitor BLE adapter state changes
      this.manager.onStateChange((state) => {
        this.logger.info('[ble-relay] adapter state changed:', state);
      }, true);

      this.logger.info('[ble-relay] service initialized');
      return true;
    } catch (error) {
      this.logger.error('[ble-relay] initialization failed:', error);
      throw error;
    }
  }

  async requestBlePermissions() {
    try {
      // For Android 12+ (API 31+)
      if (Platform.Version >= 31) {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        const results = await PermissionsAndroid.requestMultiple(permissions);
        
        const allGranted = permissions.every(permission => 
          results[permission] === PermissionsAndroid.RESULTS.GRANTED
        );

        this.logger.info('[ble-relay] permission results:', results);
        return allGranted;
      } else {
        // For older Android versions
        const locationResult = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs location permission to scan for nearby devices via Bluetooth.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        return locationResult === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (error) {
      this.logger.error('[ble-relay] permission request failed:', error);
      return false;
    }
  }

  async updateRole(isOnline = false, canRelay = false) {
    const newRole = (isOnline ? DEVICE_ROLES.ONLINE : DEVICE_ROLES.OFFLINE) |
                   (canRelay ? DEVICE_ROLES.RELAY_CAPABLE : 0);
    
    if (newRole !== this.deviceRole) {
      this.logger.info('[ble-relay] role changed:', { 
        from: this.deviceRole, 
        to: newRole, 
        isOnline, 
        canRelay 
      });
      
      this.deviceRole = newRole;
      this._notifySubscribers('roleChanged', { role: newRole, isOnline, canRelay });

      // Restart advertising with new role
      if (this.isAdvertising) {
        await this.stopAdvertising();
        await this.startAdvertising();
      }
    }
  }

  async startAdvertising() {
    if (!this.manager) {
      throw new Error('Service not initialized');
    }

    if (this.isAdvertising) {
      this.logger.warn('[ble-relay] already advertising');
      return;
    }

    try {
      // Build advertisement data - Phase 0 basic implementation
      const advertisementData = this._buildAdvertisementData();
      
      await this.manager.startDeviceAdvertising(
        OFFLINEPAY_SERVICE_UUID,
        advertisementData,
        {}
      );
      
      this.isAdvertising = true;
      this.logger.info('[ble-relay] started advertising', { role: this.deviceRole });
    } catch (error) {
      this.logger.error('[ble-relay] advertising failed:', error);
      throw error;
    }
  }

  async stopAdvertising() {
    if (!this.manager || !this.isAdvertising) {
      return;
    }

    try {
      await this.manager.stopDeviceAdvertising();
      this.isAdvertising = false;
      this.logger.info('[ble-relay] stopped advertising');
    } catch (error) {
      this.logger.error('[ble-relay] stop advertising failed:', error);
    }
  }

  async startScanning() {
    if (!this.manager) {
      throw new Error('Service not initialized');
    }

    if (this.isScanning) {
      this.logger.warn('[ble-relay] already scanning');
      return;
    }

    try {
      this.manager.startDeviceScan(
        [OFFLINEPAY_SERVICE_UUID], 
        null,
        (error, device) => {
          if (error) {
            this.logger.error('[ble-relay] scan error:', error);
            return;
          }

          this._handlePeerDiscovered(device);
        }
      );
      
      this.isScanning = true;
      this.logger.info('[ble-relay] started scanning for peers');

      if (!this.peerMaintenanceTimer) {
        this.peerMaintenanceTimer = setInterval(() => {
          try {
            this._cleanupStalePeers();
          } catch (maintenanceError) {
            this.logger.error('[ble-relay] peer maintenance failed:', maintenanceError);
          }
        }, PEER_MAINTENANCE_INTERVAL_MS);
      }
    } catch (error) {
      this.logger.error('[ble-relay] scanning failed:', error);
      throw error;
    }
  }

  async stopScanning() {
    if (!this.manager || !this.isScanning) {
      return;
    }

    try {
      this.manager.stopDeviceScan();
      this.isScanning = false;
      this.logger.info('[ble-relay] stopped scanning');
    } catch (error) {
      this.logger.error('[ble-relay] stop scanning failed:', error);
    }

    if (this.peerMaintenanceTimer) {
      clearInterval(this.peerMaintenanceTimer);
      this.peerMaintenanceTimer = null;
    }
  }

  subscribe(event, callback) {
    if (this.subscribers[event]) {
      this.subscribers[event].push(callback);
    }
  }

  unsubscribe(event, callback) {
    if (this.subscribers[event]) {
      const index = this.subscribers[event].indexOf(callback);
      if (index > -1) {
        this.subscribers[event].splice(index, 1);
      }
    }
  }

  async destroy() {
    await this.stopAdvertising();
    await this.stopScanning();
    
    if (this.manager) {
      this.manager.destroy();
      this.manager = null;
    }
    
    if (this.peerMaintenanceTimer) {
      clearInterval(this.peerMaintenanceTimer);
      this.peerMaintenanceTimer = null;
    }

    this.nearbyPeers.clear();
    this.sessions.clear();
    this.logger.info('[ble-relay] service destroyed');
  }

  // Private methods

  _buildAdvertisementData() {
    // Phase 0: Simple role + truncated wallet address
    const roleBytes = new Uint8Array([this.deviceRole]);
    const addressBytes = this.walletAddress ? 
      new Uint8Array(Buffer.from(this.walletAddress.slice(2, 10), 'hex')) : 
      new Uint8Array(4);

    return {
      localName: 'OfflinePay',
      manufacturerData: Buffer.concat([Buffer.from(roleBytes), Buffer.from(addressBytes)]),
    };
  }

  _handlePeerDiscovered(device) {
    const now = Date.now();
    const parsedManufacturer = this._parseManufacturerData(device.manufacturerData);
    const rssi = typeof device.rssi === 'number' ? device.rssi : null;
    const existing = this.nearbyPeers.get(device.id);

    const peerInfo = {
      id: device.id,
      name: device.name || device.localName || existing?.name || 'Unknown',
      rssi,
      firstSeen: existing?.firstSeen || now,
      lastSeen: now,
      manufacturerData: device.manufacturerData,
      role: parsedManufacturer.role,
      truncatedAddress: parsedManufacturer.truncatedAddress,
    };

    this.nearbyPeers.set(device.id, peerInfo);
    this._notifySubscribers('peerDiscovered', peerInfo);
    
    this.logger.info('[ble-relay] peer discovered:', {
      id: device.id.slice(0, 8),
      role: peerInfo.role,
      rssi,
    });

    this._evaluateRelayerSelection();
  }

  _parseManufacturerData(manufacturerData) {
    if (!manufacturerData) {
      return {
        role: DEVICE_ROLES.OFFLINE,
        truncatedAddress: null,
      };
    }

    try {
      const data = Buffer.from(manufacturerData, 'base64');
      const role = data.length > 0 ? data[0] : DEVICE_ROLES.OFFLINE;
      const truncatedAddress = data.length > 1 ? `0x${Buffer.from(data.slice(1)).toString('hex')}` : null;
      return { role, truncatedAddress };
    } catch (error) {
      this.logger.warn('[ble-relay] failed to parse manufacturer data', error?.message);
      return {
        role: DEVICE_ROLES.OFFLINE,
        truncatedAddress: null,
      };
    }
  }

  _cleanupStalePeers() {
    const cutoff = Date.now() - this.peerStaleMs;
    let removedSelectedRelayer = false;

    for (const [id, peerInfo] of this.nearbyPeers.entries()) {
      if (peerInfo.lastSeen < cutoff) {
        this.nearbyPeers.delete(id);
        this._notifySubscribers('peerLost', peerInfo);
        this.logger.info('[ble-relay] peer lost:', {
          id: peerInfo.id.slice(0, 8),
          lastSeen: peerInfo.lastSeen,
        });

        if (this.selectedRelayerId === id) {
          removedSelectedRelayer = true;
        }
      }
    }

    if (removedSelectedRelayer) {
      this.selectedRelayerId = null;
    }

    this._evaluateRelayerSelection();
  }

  _evaluateRelayerSelection() {
    const candidates = Array.from(this.nearbyPeers.values()).filter(
      (peer) => (peer.role & DEVICE_ROLES.RELAY_CAPABLE) === DEVICE_ROLES.RELAY_CAPABLE
    );

    if (!candidates.length) {
      if (this.selectedRelayerId) {
        this.selectedRelayerId = null;
        this._notifySubscribers('relayerSelected', null);
      }
      return;
    }

    const bestPeer = candidates.reduce((best, current) => {
      if (!best) return current;

      const bestRssi = typeof best.rssi === 'number' ? best.rssi : -Infinity;
      const currentRssi = typeof current.rssi === 'number' ? current.rssi : -Infinity;

      if (currentRssi > bestRssi) {
        return current;
      }

      if (currentRssi === bestRssi) {
        return current.lastSeen > best.lastSeen ? current : best;
      }

      return best;
    }, null);

    if (!bestPeer) {
      if (this.selectedRelayerId) {
        this.selectedRelayerId = null;
        this._notifySubscribers('relayerSelected', null);
      }
      return;
    }

    if (this.selectedRelayerId !== bestPeer.id) {
      this.selectedRelayerId = bestPeer.id;
      this._notifySubscribers('relayerSelected', bestPeer);
      this.logger.info('[ble-relay] relayer selected:', {
        id: bestPeer.id.slice(0, 8),
        rssi: bestPeer.rssi,
      });
    }
  }

  _notifySubscribers(event, data) {
    this.subscribers[event]?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        this.logger.error(`[ble-relay] subscriber error for ${event}:`, error);
      }
    });
  }
}

export default BleRelayerService;
