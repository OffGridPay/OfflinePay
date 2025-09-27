/**
 * BLE Relayer Service - Core BLE mesh functionality for OfflinePay
 * Handles advertising, scanning, handshakes, and payload transfer
 */

import { Platform } from 'react-native';

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

export class BleRelayerService {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.walletAddress = options.walletAddress || null;
    this.manager = null;
    this.isAdvertising = false;
    this.isScanning = false;
    this.deviceRole = DEVICE_ROLES.OFFLINE;
    this.nearbyPeers = new Map(); // deviceId -> peerInfo
    this.sessions = new Map(); // sessionId -> sessionInfo
    
    this.subscribers = {
      peerDiscovered: [],
      peerLost: [],
      roleChanged: [],
      sessionEstablished: [],
    };
  }

  async initialize() {
    if (!BlePlx?.BleManager) {
      throw new Error('BLE not supported - react-native-ble-plx unavailable');
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
    const peerInfo = {
      id: device.id,
      name: device.name || device.localName || 'Unknown',
      rssi: device.rssi,
      lastSeen: Date.now(),
      manufacturerData: device.manufacturerData,
      role: this._parseDeviceRole(device),
    };

    this.nearbyPeers.set(device.id, peerInfo);
    this._notifySubscribers('peerDiscovered', peerInfo);
    
    this.logger.info('[ble-relay] peer discovered:', {
      id: device.id.slice(0, 8),
      role: peerInfo.role,
      rssi: device.rssi,
    });
  }

  _parseDeviceRole(device) {
    if (!device.manufacturerData) return DEVICE_ROLES.OFFLINE;
    
    try {
      const data = Buffer.from(device.manufacturerData, 'base64');
      return data.length > 0 ? data[0] : DEVICE_ROLES.OFFLINE;
    } catch {
      return DEVICE_ROLES.OFFLINE;
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
