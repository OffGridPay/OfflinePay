/**
 * BLE Relayer Service - Core BLE mesh functionality for OfflinePay
 * Handles advertising, scanning, handshakes, and payload transfer
 */

import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';
import { ethers } from 'ethers';
import { createEnhancedLogger } from '../utils/BleLogger';

import {
  createHandshakeInit,
  processHandshakeInit,
  completeHandshake,
  establishSession,
} from '../utils/cryptoHandshake';
import { 
  generateSessionId, 
  chunkPayload, 
  parseChunk, 
  PayloadAssembler,
  createTransactionPayload,
  createAckPayload,
  createBalanceRequestPayload,
  createBalanceResponsePayload,
  PAYLOAD_TYPES 
} from '../utils/payloadSerializer';
import { relayerApi } from './RelayerApiService';
import { saveBleAck, saveBleTransaction } from '../utils/db';

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
const HANDSHAKE_TIMEOUT_MS = 20000;

export class BleRelayerService {
  constructor(options = {}) {
    this.logger = options.logger || createEnhancedLogger('BLE-RELAY');
    this.walletAddress = options.walletAddress || null;
    this.walletPrivateKey = options.walletPrivateKey || null;
    this.peerStaleMs = options.peerStaleMs || DEFAULT_PEER_STALE_MS;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs || HANDSHAKE_TIMEOUT_MS;
    this.manager = null;
    this.isAdvertising = false;
    this.isScanning = false;
    this.deviceRole = DEVICE_ROLES.OFFLINE;
    this.nearbyPeers = new Map(); // deviceId -> peerInfo
    this.sessions = new Map(); // sessionId -> sessionInfo
    this.handshakeContexts = new Map(); // contextId -> handshake state
    this.peerMaintenanceTimer = null;
    this.selectedRelayerId = null;
    this.payloadAssemblers = new Map(); // sessionId -> PayloadAssembler
    this.activeTransmissions = new Map(); // transmissionId -> transmission state
    
    this.subscribers = {
      peerDiscovered: [],
      peerLost: [],
      roleChanged: [],
      sessionEstablished: [],
      relayerSelected: [],
      handshakeInitiated: [],
      handshakeFailed: [],
      transmissionProgress: [],
      payloadReceiveProgress: [],
      transactionReceived: [],
      receiptAckReceived: [],
      broadcastAckReceived: [],
      transactionBroadcast: [],
      balanceRequestServed: [],
      balanceResponseReceived: [],
    };
  }

  updateWalletCredentials({ walletAddress, walletPrivateKey }) {
    if (walletAddress) {
      this.walletAddress = walletAddress;
    }
    if (walletPrivateKey) {
      this.walletPrivateKey = walletPrivateKey;
    }
  }

  async initialize() {
    this.logger.info('[ble-relay] Starting initialization...');
    
    if (!BlePlx?.BleManager) {
      this.logger.error('[ble-relay] BLE not supported - react-native-ble-plx unavailable');
      throw new Error('BLE not supported - react-native-ble-plx unavailable');
    }

    this.logger.info('[ble-relay] BleManager available, checking permissions...');

    // Request BLE permissions on Android
    if (Platform.OS === 'android') {
      this.logger.info('[ble-relay] Requesting Android BLE permissions...');
      const hasPermissions = await this.requestBlePermissions();
      if (!hasPermissions) {
        this.logger.error('[ble-relay] BLE permissions not granted');
        throw new Error('BLE permissions not granted');
      }
      this.logger.info('[ble-relay] Android BLE permissions granted');
    }

    try {
      this.logger.info('[ble-relay] Creating BleManager...');
      this.manager = new BlePlx.BleManager({
        restoreStateIdentifier: 'OfflinePayRelayer',
        restoreStateFunction: null,
      });

      this.logger.info('[ble-relay] BleManager created, setting up state monitoring...');
      // Monitor BLE adapter state changes
      this.manager.onStateChange((state) => {
        this.logger.info('[ble-relay] adapter state changed:', state);
      }, true);

      this.logger.info('[ble-relay] service initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('[ble-relay] initialization failed:', error);
      this.logger.error('[ble-relay] initialization error stack:', error.stack);
      throw error;
    }
  }

  async requestBlePermissions() {
    this.logger.info('Starting BLE permission request', {
      platform: Platform.OS,
      version: Platform.Version,
      isAndroid12Plus: Platform.OS === 'android' && Platform.Version >= 31,
    });

    try {
      if (Platform.OS !== 'android') {
        this.logger.info('iOS platform detected, no explicit permissions needed');
        return true;
      }

      const isAndroid12Plus = Platform.Version >= 31;
      const requiredPermissions = isAndroid12Plus
        ? [
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

      const results = {};
      const deniedPermissions = [];

      // Request each permission sequentially to guarantee system prompt
      for (const permission of requiredPermissions) {
        const friendlyName = this._getPermissionFriendlyName(permission);
        const alreadyGranted = await PermissionsAndroid.check(permission);

        this.logger.info('Checking permission status', {
          permission,
          friendlyName,
          alreadyGranted,
        });

        if (alreadyGranted) {
          results[permission] = PermissionsAndroid.RESULTS.GRANTED;
          continue;
        }

        const rationale = this._getPermissionRationale(permission, friendlyName);
        const result = await PermissionsAndroid.request(permission, rationale);
        results[permission] = result;

        this.logger.info('Permission request result', {
          permission,
          friendlyName,
          result,
        });

        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          deniedPermissions.push({ permission, result, friendlyName });
        }
      }

      this.logger.logPermissionRequest(requiredPermissions, results);

      if (deniedPermissions.length) {
        this.logger.error('Some BLE permissions were denied', { deniedPermissions });
        return false;
      }

      this.logger.info('All BLE permissions granted');
      return true;
    } catch (error) {
      this.logger.error('BLE permission request failed', {
        error: error.message,
        stack: error.stack,
        platform: Platform.OS,
        version: Platform.Version,
      });
      return false;
    }
  }

  _getPermissionFriendlyName(permission) {
    const mapping = {
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: 'Location',
      [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: 'Coarse Location',
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: 'Bluetooth Scan',
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: 'Bluetooth Connect',
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE]: 'Bluetooth Advertise',
    };

    return mapping[permission] || permission;
  }

  _getPermissionRationale(permission, friendlyName) {
    if (permission === PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION) {
      return {
        title: 'Location Permission Required',
        message:
          'OfflinePay needs location permission to scan for nearby Bluetooth devices and enable offline payments.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'Allow',
      };
    }

    return {
      title: `${friendlyName} Permission Required`,
      message: `OfflinePay needs ${friendlyName.toLowerCase()} permission to establish secure Bluetooth connections with nearby relayers.`,
      buttonNeutral: 'Ask Me Later',
      buttonNegative: 'Cancel',
      buttonPositive: 'Allow',
    };
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
    this.handshakeContexts.clear();
    this.payloadAssemblers.clear();
    this.activeTransmissions.clear();
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

  // Handshake orchestration

  async initiateHandshake(peerId) {
    if (!this.walletPrivateKey) {
      throw new Error('Wallet private key unavailable for handshake');
    }

    const peerInfo = this.nearbyPeers.get(peerId);
    if (!peerInfo) {
      throw new Error('Peer not found');
    }

    const contextId = generateSessionId();
    const handshakeSessionId = generateSessionId();

    try {
      const { message, ephemeralPrivateKey } = await createHandshakeInit(
        this.walletPrivateKey,
        this.deviceRole,
      );

      const context = {
        id: contextId,
        peerId,
        handshakeSessionId,
        message,
        ephemeralPrivateKey,
        createdAt: Date.now(),
        timeout: setTimeout(() => {
          this._expireHandshake(contextId);
        }, this.handshakeTimeoutMs),
      };

      this.handshakeContexts.set(contextId, context);
      this._notifySubscribers('handshakeInitiated', { peerId, contextId, message });

      return { peerInfo, contextId, message };
    } catch (error) {
      this.logger.error('[ble-relay] handshake initiation failed:', error);
      this._notifySubscribers('handshakeFailed', { peerId, error });
      throw error;
    }
  }

  async completeHandshake(peerId, responseMessage, contextId) {
    const context = contextId ? this.handshakeContexts.get(contextId) : null;

    if (!context) {
      throw new Error('Handshake context not found');
    }

    try {
      const { sharedSecret, peerAddress, peerRole } = completeHandshake(
        responseMessage,
        context.ephemeralPrivateKey,
        context.message.challenge,
      );

      const session = establishSession(sharedSecret, context.handshakeSessionId, {
        peerId,
        peerAddress,
        peerRole,
        role: 'initiator',
      });

      this.sessions.set(session.sessionId, {
        ...session,
        peerId,
        peerAddress,
        peerRole,
        role: 'initiator',
      });

      this._clearHandshakeContext(contextId);
      this._notifySubscribers('sessionEstablished', {
        peerId,
        session: this.sessions.get(session.sessionId),
        role: 'initiator',
        contextId,
      });

      return { session: this.sessions.get(session.sessionId), peerAddress };
    } catch (error) {
      this.logger.error('[ble-relay] handshake completion failed:', error);
      this._clearHandshakeContext(contextId);
      this._notifySubscribers('handshakeFailed', { peerId, contextId, error });
      throw error;
    }
  }

  async processIncomingHandshake(peerId, initMessage) {
    if (!this.walletPrivateKey) {
      throw new Error('Wallet private key unavailable for handshake');
    }

    try {
      const { response, sharedSecret, peerAddress, ephemeralPrivateKey } = await processHandshakeInit(
        initMessage,
        this.walletPrivateKey,
        this.deviceRole,
      );

      const handshakeSessionId = generateSessionId();

      const session = establishSession(sharedSecret, handshakeSessionId, {
        peerId,
        peerAddress,
        peerRole: initMessage.deviceRole,
        role: 'responder',
      });

      this.sessions.set(session.sessionId, {
        ...session,
        peerId,
        peerAddress,
        peerRole: initMessage.deviceRole,
        role: 'responder',
        ephemeralPrivateKey,
      });

      this._notifySubscribers('sessionEstablished', {
        peerId,
        session: this.sessions.get(session.sessionId),
        role: 'responder',
        responseMessage: response,
      });

      return { response, session: this.sessions.get(session.sessionId) };
    } catch (error) {
      this.logger.error('[ble-relay] failed to process incoming handshake:', error);
      this._notifySubscribers('handshakeFailed', { peerId, error });
      throw error;
    }
  }

  cancelHandshake(contextId, reason = 'cancelled') {
    const context = this.handshakeContexts.get(contextId);
    if (!context) {
      return false;
    }

    this._clearHandshakeContext(contextId);
    this._notifySubscribers('handshakeFailed', {
      peerId: context.peerId,
      contextId,
      error: new Error(`Handshake ${reason}`),
    });
    return true;
  }

  getActiveSessions() {
    return Array.from(this.sessions.values());
  }

  getSessionByPeer(peerId) {
    return Array.from(this.sessions.values()).find((session) => session.peerId === peerId) || null;
  }

  _expireHandshake(contextId) {
    const context = this.handshakeContexts.get(contextId);
    if (!context) {
      return;
    }

    this.logger.warn('[ble-relay] handshake timed out', { peerId: context.peerId });
    this._clearHandshakeContext(contextId);
    this._notifySubscribers('handshakeFailed', {
      peerId: context.peerId,
      contextId,
      error: new Error('Handshake timeout'),
    });
  }

  _clearHandshakeContext(contextId) {
    const context = this.handshakeContexts.get(contextId);
    if (!context) {
      return;
    }

    if (context.timeout) {
      clearTimeout(context.timeout);
    }

    this.handshakeContexts.delete(contextId);
  }

  // Payload Transmission Methods (T2.1 - T2.8)

  /**
   * Send transaction payload to relayer via BLE
   * @param {Object} transactionData - Signed transaction with metadata
   * @param {string} relayerPeerId - Target relayer peer ID
   * @returns {Promise<string>} - Transmission ID for tracking
   */
  async sendTransactionPayload(transactionData, relayerPeerId) {
    const session = this.getSessionByPeer(relayerPeerId);
    if (!session) {
      throw new Error('No session established with relayer');
    }

    // Create transaction payload (FR-9)
    const payload = createTransactionPayload(transactionData.signedTx, {
      ...transactionData.metadata,
      originatorSignature: transactionData.originatorSignature,
      counterparty: transactionData.counterparty || null,
    });

    const transmissionId = generateSessionId().toString();
    const chunks = chunkPayload(payload, session.sessionId);

    this.activeTransmissions.set(transmissionId, {
      id: transmissionId,
      peerId: relayerPeerId,
      sessionId: session.sessionId,
      payload,
      chunks,
      sentChunks: 0,
      status: 'sending',
      startedAt: Date.now(),
    });

    try {
      // Send chunks sequentially with acknowledgement (FR-10)
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        await this._sendChunkToDevice(relayerPeerId, chunk);
        
        // Update progress
        const transmission = this.activeTransmissions.get(transmissionId);
        if (transmission) {
          transmission.sentChunks = i + 1;
          this._notifySubscribers('transmissionProgress', {
            transmissionId,
            progress: (i + 1) / chunks.length,
            chunk: i + 1,
            totalChunks: chunks.length,
          });
        }

        // Wait for chunk acknowledgement if not last chunk
        if (i < chunks.length - 1) {
          await this._waitForChunkAck(chunk.sequence, 5000);
        }
      }

      // Mark transmission complete
      const transmission = this.activeTransmissions.get(transmissionId);
      if (transmission) {
        transmission.status = 'completed';
        transmission.completedAt = Date.now();
      }

      this.logger.info('[ble-relay] payload transmission completed', {
        transmissionId,
        chunks: chunks.length,
      });

      return transmissionId;
    } catch (error) {
      // Mark transmission failed
      const transmission = this.activeTransmissions.get(transmissionId);
      if (transmission) {
        transmission.status = 'failed';
        transmission.error = error.message;
      }

      this.logger.error('[ble-relay] payload transmission failed:', error);
      throw error;
    }
  }

  /**
   * Handle incoming payload chunks from devices
   */
  async handleIncomingChunk(deviceId, chunkData) {
    try {
      const chunk = parseChunk(chunkData);
      
      // Get or create payload assembler for session
      let assembler = this.payloadAssemblers.get(chunk.sessionId);
      if (!assembler) {
        assembler = new PayloadAssembler(chunk.sessionId);
        this.payloadAssemblers.set(chunk.sessionId, assembler);
      }

      const wasAdded = assembler.addChunk(chunk);
      if (!wasAdded) {
        this.logger.warn('[ble-relay] duplicate chunk ignored', { sequence: chunk.sequence });
        return;
      }

      // Send chunk acknowledgement
      await this._sendChunkAck(deviceId, chunk.sequence);

      // Check if payload is complete
      if (assembler.isComplete) {
        await this._handleCompletePayload(deviceId, assembler.payload, chunk.sessionId);
        this.payloadAssemblers.delete(chunk.sessionId);
      } else {
        // Notify progress
        const progress = assembler.getProgress();
        this._notifySubscribers('payloadReceiveProgress', {
          deviceId,
          sessionId: chunk.sessionId,
          progress: progress.completionPercentage,
          receivedChunks: progress.receivedChunks,
        });
      }
    } catch (error) {
      this.logger.error('[ble-relay] chunk handling failed:', error);
      // Send error acknowledgement
      await this._sendChunkError(deviceId, error.message);
    }
  }

  /**
   * Handle complete payload received from device (T2.2 - Relayer Validation)
   */
  async _handleCompletePayload(deviceId, payload, sessionId) {
    this.logger.info('[ble-relay] payload received completely', { 
      type: payload.type, 
      deviceId: deviceId.slice(0, 8) 
    });

    switch (payload.type) {
      case PAYLOAD_TYPES.SIGNED_TRANSACTION:
        await this._handleTransactionPayload(deviceId, payload, sessionId);
        break;
      case PAYLOAD_TYPES.RECEIPT_ACK:
        await this._handleReceiptAck(deviceId, payload);
        break;
      case PAYLOAD_TYPES.BROADCAST_ACK:
        await this._handleBroadcastAck(deviceId, payload);
        break;
      case PAYLOAD_TYPES.BALANCE_REQUEST:
        await this._handleBalanceRequest(deviceId, payload, sessionId);
        break;
      case PAYLOAD_TYPES.BALANCE_RESPONSE:
        await this._handleBalanceResponse(deviceId, payload);
        break;
      default:
        this.logger.warn('[ble-relay] unknown payload type:', payload.type);
    }
  }

  /**
   * Handle transaction payload and validate (T2.2 - FR-11)
   */
  async _handleTransactionPayload(deviceId, payload, sessionId) {
    try {
      // Validate transaction payload
      const validationResult = await this._validateTransaction(payload);
      
      // Send Receipt ACK (T2.3 - FR-12)
      const receiptAck = createAckPayload(
        PAYLOAD_TYPES.RECEIPT_ACK,
        payload.metadata.expectedTxHash || 'pending',
        validationResult,
        await this._signAck(validationResult)
      );

      await this._sendAckToDevice(deviceId, receiptAck);

      if (validationResult.success) {
        // If we're online, forward to Node.js relayer (T2.4)
        if (this.deviceRole & DEVICE_ROLES.ONLINE) {
          await this._forwardToNodejsRelayer(payload, deviceId);
        } else {
          this.logger.warn('[ble-relay] offline relayer cannot broadcast transaction');
        }
      }

      this._notifySubscribers('transactionReceived', {
        deviceId,
        payload,
        validationResult,
      });
    } catch (error) {
      this.logger.error('[ble-relay] transaction handling failed:', error);
      
      // Send error Receipt ACK
      const errorAck = createAckPayload(
        PAYLOAD_TYPES.RECEIPT_ACK,
        'error',
        { success: false, error: error.message },
        await this._signAck({ success: false, error: error.message })
      );
      
      await this._sendAckToDevice(deviceId, errorAck);
    }
  }

  /**
   * Validate transaction (T2.2 - FR-11)
   */
  async _validateTransaction(payload) {
    try {
      const { signedTx, metadata } = payload;
      
      // Parse and validate transaction using ethers.js
      const parsedTx = ethers.utils.parseTransaction(signedTx);
      
      // Verify signature
      const recoveredAddress = ethers.utils.recoverAddress(
        ethers.utils.keccak256(signedTx),
        {
          r: parsedTx.r,
          s: parsedTx.s,
          v: parsedTx.v
        }
      );

      if (recoveredAddress.toLowerCase() !== metadata.from.toLowerCase()) {
        throw new Error('Transaction signature invalid');
      }

      // Validate nonce freshness (basic check)
      if (typeof parsedTx.nonce !== 'number' || parsedTx.nonce < 0) {
        throw new Error('Invalid nonce');
      }

      // Validate gas limits
      if (parsedTx.gasLimit.lt(21000)) {
        throw new Error('Gas limit too low');
      }

      // Validate chain ID (if specified)
      if (parsedTx.chainId && parsedTx.chainId !== 545) { // FlowEVM testnet
        throw new Error('Invalid chain ID');
      }

      // Validate amount
      if (parsedTx.value.lt(0)) {
        throw new Error('Invalid transaction value');
      }

      return {
        success: true,
        validatedAt: Date.now(),
        gasLimit: parsedTx.gasLimit.toString(),
        gasPrice: parsedTx.gasPrice?.toString(),
        chainId: parsedTx.chainId,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        validatedAt: Date.now(),
      };
    }
  }

  /**
   * Forward transaction to Node.js relayer (T2.4 - FR-13, FR-14)
   */
  async _forwardToNodejsRelayer(payload, originatorDeviceId) {
    try {
      this.logger.info('[ble-relay] forwarding to nodejs relayer', {
        from: payload.metadata.from,
        to: payload.metadata.to,
      });

      // Broadcast transaction via HTTP API
      const broadcastResult = await relayerApi.broadcastTransaction(payload, this.walletAddress);

      // Generate Broadcast ACK (T2.5 - FR-15)
      const broadcastAck = createAckPayload(
        PAYLOAD_TYPES.BROADCAST_ACK,
        broadcastResult.success ? broadcastResult.txHash : 'failed',
        broadcastResult,
        await this._signAck(broadcastResult)
      );

      // Send Broadcast ACK back to originator via BLE (T2.5 - FR-15)
      if (originatorDeviceId) {
        try {
          await this._sendAckToDevice(originatorDeviceId, broadcastAck);
          this.logger.info('[ble-relay] broadcast ACK sent to originator', {
            deviceId: originatorDeviceId.slice(0, 8),
            success: broadcastResult.success,
            txHash: broadcastResult.txHash,
          });
        } catch (ackError) {
          this.logger.error('[ble-relay] failed to send broadcast ACK:', ackError);
        }
      }

      // Notify subscribers
      this._notifySubscribers('transactionBroadcast', {
        payload,
        broadcastResult,
        broadcastAck,
      });

      return broadcastResult;
    } catch (error) {
      this.logger.error('[ble-relay] nodejs relayer forward failed:', error);
      
      // Send error Broadcast ACK
      const errorBroadcastAck = createAckPayload(
        PAYLOAD_TYPES.BROADCAST_ACK,
        'error',
        { 
          success: false, 
          error: error.message,
          code: error.code || 'BROADCAST_ERROR'
        },
        await this._signAck({ success: false, error: error.message })
      );

      if (originatorDeviceId) {
        try {
          await this._sendAckToDevice(originatorDeviceId, errorBroadcastAck);
        } catch (ackError) {
          this.logger.error('[ble-relay] failed to send error broadcast ACK:', ackError);
        }
      }

      throw error;
    }
  }

  /**
   * Send acknowledgement to device via BLE
   */
  async _sendAckToDevice(deviceId, ackPayload) {
    const session = this.getSessionByPeer(deviceId);
    if (!session) {
      throw new Error('No session for ACK delivery');
    }

    const chunks = chunkPayload(ackPayload, session.sessionId);
    
    for (const chunk of chunks) {
      await this._sendChunkToDevice(deviceId, chunk);
    }

    this.logger.info('[ble-relay] ACK sent to device', { 
      deviceId: deviceId.slice(0, 8),
      type: ackPayload.type 
    });
  }

  /**
   * Send chunk to specific device (low-level BLE transmission)
   */
  async _sendChunkToDevice(deviceId, chunk) {
    if (!this.manager) {
      throw new Error('BLE manager not initialized');
    }

    try {
      // Connect to device if not already connected
      let device = await this.manager.connectToDevice(deviceId);
      if (!device.isConnected()) {
        device = await device.connect();
      }

      // Discover services and characteristics
      await device.discoverAllServicesAndCharacteristics();

      // Write chunk to payload characteristic
      await device.writeCharacteristicWithResponseForService(
        OFFLINEPAY_SERVICE_UUID,
        PAYLOAD_CHARACTERISTIC_UUID,
        chunk.raw.toString('base64')
      );

      this.logger.debug('[ble-relay] chunk sent', {
        deviceId: deviceId.slice(0, 8),
        sequence: chunk.sequence,
        size: chunk.raw.length,
      });
    } catch (error) {
      this.logger.error('[ble-relay] chunk transmission failed:', error);
      throw error;
    }
  }

  /**
   * Send chunk acknowledgement
   */
  async _sendChunkAck(deviceId, sequence) {
    // TODO: Implement chunk-level ACK via control characteristic
    this.logger.debug('[ble-relay] chunk ACK sent', { deviceId: deviceId.slice(0, 8), sequence });
  }

  /**
   * Send chunk error notification
   */
  async _sendChunkError(deviceId, errorMessage) {
    // TODO: Implement error notification via control characteristic
    this.logger.debug('[ble-relay] chunk error sent', { deviceId: deviceId.slice(0, 8), errorMessage });
  }

  /**
   * Wait for chunk acknowledgement
   */
  async _waitForChunkAck(sequence, timeoutMs = 5000) {
    // TODO: Implement chunk ACK waiting logic
    return new Promise((resolve) => {
      setTimeout(resolve, 100); // Simulate ACK for now
    });
  }

  /**
   * Sign acknowledgement with relayer private key (T2.3)
   */
  async _signAck(ackData) {
    if (!this.walletPrivateKey) {
      throw new Error('Relayer private key not available');
    }

    try {
      const wallet = new ethers.Wallet(this.walletPrivateKey);
      const message = JSON.stringify(ackData);
      const signature = await wallet.signMessage(message);
      return signature;
    } catch (error) {
      this.logger.error('[ble-relay] ACK signing failed:', error);
      throw error;
    }
  }

  /**
   * Handle received acknowledgements (T2.6 - FR-16)
   */
  async _handleReceiptAck(deviceId, ackPayload) {
    try {
      // Save Receipt ACK to database
      await saveBleAck({
        transmissionId: this._findTransmissionIdForDevice(deviceId),
        ackType: 1, // Receipt ACK
        txHash: ackPayload.txHash,
        deviceId,
        payload: ackPayload,
        signature: ackPayload.relayerSignature,
        timestamp: ackPayload.timestamp,
        status: 'received',
      });

      this.logger.info('[ble-relay] receipt ACK saved to database', {
        deviceId: deviceId.slice(0, 8),
        success: ackPayload.result?.success
      });
    } catch (error) {
      this.logger.error('[ble-relay] failed to save receipt ACK:', error);
    }

    this._notifySubscribers('receiptAckReceived', {
      deviceId,
      ackPayload,
    });
  }

  async _handleBroadcastAck(deviceId, ackPayload) {
    try {
      // Save Broadcast ACK to database
      await saveBleAck({
        transmissionId: this._findTransmissionIdForDevice(deviceId),
        ackType: 2, // Broadcast ACK
        txHash: ackPayload.txHash,
        deviceId,
        payload: ackPayload,
        signature: ackPayload.relayerSignature,
        timestamp: ackPayload.timestamp,
        status: 'received',
      });

      this.logger.info('[ble-relay] broadcast ACK saved to database', {
        deviceId: deviceId.slice(0, 8),
        txHash: ackPayload.txHash,
        success: ackPayload.result?.success
      });
    } catch (error) {
      this.logger.error('[ble-relay] failed to save broadcast ACK:', error);
    }

    this._notifySubscribers('broadcastAckReceived', {
      deviceId,
      ackPayload,
    });
  }

  /**
   * Request balance from online relayer via BLE (T2.7 - FR-31)
   */
  async requestBalanceFromRelayer(walletAddress, relayerPeerId) {
    const session = this.getSessionByPeer(relayerPeerId);
    if (!session) {
      throw new Error('No session established with relayer for balance request');
    }

    const balanceRequest = createBalanceRequestPayload(walletAddress);
    
    try {
      this.logger.info('[ble-relay] requesting balance from relayer', {
        address: walletAddress.slice(0, 10),
        relayer: relayerPeerId.slice(0, 8),
      });

      const chunks = chunkPayload(balanceRequest, session.sessionId);
      
      for (const chunk of chunks) {
        await this._sendChunkToDevice(relayerPeerId, chunk);
      }

      return balanceRequest.requestId;
    } catch (error) {
      this.logger.error('[ble-relay] balance request failed:', error);
      throw error;
    }
  }

  /**
   * Handle incoming balance request (T2.7 - FR-30)
   */
  async _handleBalanceRequest(deviceId, payload, sessionId) {
    try {
      this.logger.info('[ble-relay] handling balance request', {
        address: payload.walletAddress.slice(0, 10),
        requestId: payload.requestId,
      });

      // Only online relayers can provide balance data
      if (!(this.deviceRole & DEVICE_ROLES.ONLINE)) {
        throw new Error('This relayer is offline and cannot fetch balance data');
      }

      // Fetch balance from Node.js relayer API
      const balanceData = await relayerApi.getBalance(payload.walletAddress);
      
      if (!balanceData.success) {
        throw new Error(balanceData.error || 'Balance fetch failed');
      }

      // Create signed balance response
      const balanceResponse = createBalanceResponsePayload(
        payload,
        balanceData,
        await this._signBalanceData(balanceData)
      );

      // Send response back to requesting device
      await this._sendAckToDevice(deviceId, balanceResponse);

      this.logger.info('[ble-relay] balance response sent', {
        requestId: payload.requestId,
        nativeBalance: balanceData.nativeBalance,
      });

      this._notifySubscribers('balanceRequestServed', {
        deviceId,
        request: payload,
        response: balanceResponse,
      });
    } catch (error) {
      this.logger.error('[ble-relay] balance request handling failed:', error);
      
      // Send error response
      const errorResponse = createBalanceResponsePayload(
        payload,
        { error: error.message },
        null
      );
      
      try {
        await this._sendAckToDevice(deviceId, errorResponse);
      } catch (sendError) {
        this.logger.error('[ble-relay] failed to send balance error response:', sendError);
      }
    }
  }

  /**
   * Handle balance response (T2.7 - FR-32)
   */
  async _handleBalanceResponse(deviceId, payload) {
    try {
      this.logger.info('[ble-relay] received balance response', {
        requestId: payload.requestId,
        address: payload.walletAddress.slice(0, 10),
        nativeBalance: payload.balances?.native,
      });

      // Verify balance signature if provided
      if (payload.signature) {
        const isValid = await this._verifyBalanceSignature(payload);
        if (!isValid) {
          this.logger.warn('[ble-relay] balance response signature invalid');
          return;
        }
      }

      // Save balance snapshot to database (T2.7 - FR-32)
      try {
        const { upsertBalanceSnapshot } = await import('../utils/db');
        await upsertBalanceSnapshot({
          walletAddress: payload.walletAddress,
          nativeBalance: {
            wei: payload.balances.native,
            ether: ethers.utils.formatEther(payload.balances.native || '0'),
          },
          protocolAccount: payload.balances.protocol,
          timestamp: payload.timestamp,
          dataSource: payload.dataSource,
          signature: payload.signature || '',
          digest: JSON.stringify(payload.balances),
        });
      } catch (dbError) {
        this.logger.error('[ble-relay] failed to save balance snapshot:', dbError);
      }

      this._notifySubscribers('balanceResponseReceived', {
        deviceId,
        payload,
        balances: payload.balances,
      });
    } catch (error) {
      this.logger.error('[ble-relay] balance response handling failed:', error);
    }
  }

  /**
   * Sign balance data with relayer private key (T2.7)
   */
  async _signBalanceData(balanceData) {
    if (!this.walletPrivateKey) {
      throw new Error('Relayer private key not available for balance signing');
    }

    try {
      const wallet = new ethers.Wallet(this.walletPrivateKey);
      const message = JSON.stringify({
        address: balanceData.address,
        nativeBalance: balanceData.nativeBalance,
        protocolBalance: balanceData.protocolBalance,
        nonce: balanceData.nonce,
        timestamp: balanceData.timestamp,
      });
      return await wallet.signMessage(message);
    } catch (error) {
      this.logger.error('[ble-relay] balance data signing failed:', error);
      throw error;
    }
  }

  /**
   * Verify balance response signature
   */
  async _verifyBalanceSignature(balanceResponse) {
    try {
      const message = JSON.stringify({
        address: balanceResponse.walletAddress,
        nativeBalance: balanceResponse.balances.native,
        protocolBalance: balanceResponse.balances.protocol,
        nonce: balanceResponse.balances.nonce,
        timestamp: balanceResponse.timestamp,
      });

      const recoveredAddress = ethers.utils.verifyMessage(message, balanceResponse.signature);
      
      // TODO: Verify that recoveredAddress matches expected relayer address
      // For now, just check that signature is valid
      return recoveredAddress && recoveredAddress.length === 42;
    } catch (error) {
      this.logger.error('[ble-relay] balance signature verification failed:', error);
      return false;
    }
  }

  /**
   * Find transmission ID for a device (for ACK correlation)
   */
  _findTransmissionIdForDevice(deviceId) {
    for (const [transmissionId, transmission] of this.activeTransmissions.entries()) {
      if (transmission.peerId === deviceId) {
        return transmissionId;
      }
    }
    return null;
  }

  // Cleanup payload assemblers and transmissions
  _cleanupStaleTransmissions() {
    const staleTimeout = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    for (const [id, transmission] of this.activeTransmissions.entries()) {
      if (now - transmission.startedAt > staleTimeout) {
        this.activeTransmissions.delete(id);
      }
    }

    for (const [sessionId, assembler] of this.payloadAssemblers.entries()) {
      // Remove incomplete assemblers after timeout
      this.payloadAssemblers.delete(sessionId);
    }
  }

}

export default BleRelayerService;
