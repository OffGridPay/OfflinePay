/**
 * Wallet BLE Service - Simplified BLE scanning for device discovery
 * Scans for BLE devices and filters for potential wallet devices
 * Note: Advertising functionality removed due to library compatibility issues
 */

import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager } from 'react-native-ble-plx';

// Custom service UUID for our wallet app (devices with this service are wallet apps)
export const WALLET_APP_SERVICE_UUID = '12345678-9ABC-DEF0-1234-56789ABCDEF0';
export const WALLET_DATA_CHARACTERISTIC_UUID = '87654321-4321-4321-4321-CBA987654321';

export const DEVICE_STATES = {
  BLUETOOTH_OFF: 'bluetooth_off',
  READY: 'ready',
  SCANNING: 'scanning',
  ERROR: 'error'
};

export class WalletBleService {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.walletAddress = options.walletAddress || null;
    
    // BLE Manager for scanning (central mode)
    this.bleManager = new BleManager();
    
    // State management
    this.state = DEVICE_STATES.BLUETOOTH_OFF;
    this.isScanning = false;
    this.discoveredWalletDevices = new Map();
    this.connectedDevices = new Map();
    this.error = null;
    
    // Event subscribers
    this.subscribers = new Map();
    
    // Initialize BLE state monitoring
    this._initializeStateMonitoring();
  }

  // Initialize BLE state monitoring
  _initializeStateMonitoring() {
    this.bleManager.onStateChange((state) => {
      this.logger.info('[WalletBLE] BLE Manager state changed:', state);
      this._updateState();
      this._notifySubscribers('stateChange', { state, managerState: state });
    }, true);
  }

  // Update overall service state
  _updateState() {
    const managerState = this.bleManager.state();
    
    if (managerState !== 'PoweredOn') {
      this.state = DEVICE_STATES.BLUETOOTH_OFF;
    } else if (this.isScanning) {
      this.state = DEVICE_STATES.SCANNING;
    } else {
      this.state = DEVICE_STATES.READY;
    }
    
    this._notifySubscribers('stateChange', { state: this.state });
  }

  // Request necessary permissions for scanning
  async requestPermissions() {
    if (Platform.OS === 'android') {
      try {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ];

        const granted = await PermissionsAndroid.requestMultiple(permissions);
        
        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          this.logger.error('[WalletBLE] Not all permissions granted:', granted);
          return false;
        }

        this.logger.info('[WalletBLE] BLE scanning permissions granted');
        return true;
      } catch (error) {
        this.logger.error('[WalletBLE] Permission request failed:', error);
        return false;
      }
    }
    return true; // iOS handles permissions automatically
  }

  // Initialize the service
  async initialize() {
    try {
      this.logger.info('[WalletBLE] Initializing wallet BLE service...');

      // Request permissions
      const hasPermissions = await this.requestPermissions();
      if (!hasPermissions) {
        throw new Error('BLE permissions not granted');
      }

      // Wait for BLE to be ready
      const state = await this.bleManager.state();
      if (state !== 'PoweredOn') {
        throw new Error(`Bluetooth not ready. State: ${state}`);
      }

      this._updateState();
      this.logger.info('[WalletBLE] Wallet BLE service initialized successfully');
      
      return true;
    } catch (error) {
      this.logger.error('[WalletBLE] Failed to initialize:', error);
      this.state = DEVICE_STATES.ERROR;
      this.error = error.message;
      throw error;
    }
  }

  // Note: Advertising functionality removed due to library compatibility issues
  // Only scanning is supported in this simplified version

  // Start scanning for BLE devices (simplified version)
  async startScanning() {
    try {
      if (this.isScanning) {
        this.logger.warn('[WalletBLE] Already scanning');
        return;
      }

      this.logger.info('[WalletBLE] Starting BLE device scan...');
      this.discoveredWalletDevices.clear();
      this.error = null;

      // Scan for all BLE devices since we can't filter by service UUID without advertising
      this.bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          this.logger.error('[WalletBLE] BLE scan error:', error);
          this.error = error.message;
          this._notifySubscribers('scanningError', { error });
          return;
        }

        if (device && device.name) {
          this._handleBleManagerDeviceFound(device);
        }
      });

      this.isScanning = true;
      this._updateState();
      
      this.logger.info('[WalletBLE] Scanning started successfully');
      this._notifySubscribers('scanningStarted', {});

      // Auto-stop scanning after 30 seconds to save battery
      setTimeout(() => {
        if (this.isScanning) {
          this.stopScanning();
        }
      }, 30000);

    } catch (error) {
      this.logger.error('[WalletBLE] Failed to start scanning:', error);
      this.error = error.message;
      this._notifySubscribers('scanningError', { error });
      throw error;
    }
  }

  // Stop scanning
  async stopScanning() {
    try {
      if (!this.isScanning) {
        return;
      }

      this.bleManager.stopDeviceScan();
      
      this.isScanning = false;
      this._updateState();
      
      this.logger.info('[WalletBLE] Scanning stopped');
      this._notifySubscribers('scanningStopped', {});

    } catch (error) {
      this.logger.error('[WalletBLE] Failed to stop scanning:', error);
      throw error;
    }
  }

  // Handle device found via BLE Manager
  _handleBleManagerDeviceFound(device) {
    if (!device.id || !device.name) {
      return; // Skip devices without name or ID
    }

    // Filter for potential wallet devices (you can customize this logic)
    const isLikelyWalletDevice = this._isLikelyWalletDevice(device);
    
    const walletDevice = {
      id: device.id,
      name: device.name,
      rssi: device.rssi,
      isConnectable: device.isConnectable,
      lastSeen: Date.now(),
      source: 'ble_scan',
      serviceUUIDs: device.serviceUUIDs || [],
      isLikelyWallet: isLikelyWalletDevice,
      rawDevice: device
    };

    this._addWalletDevice(walletDevice);
  }

  // Simple heuristic to identify potential wallet devices
  _isLikelyWalletDevice(device) {
    // Check if device has our wallet service UUID
    if (device.serviceUUIDs && device.serviceUUIDs.includes(WALLET_APP_SERVICE_UUID)) {
      return true;
    }
    
    // Check device name for wallet-related keywords
    const walletKeywords = ['wallet', 'pay', 'crypto', 'bitcoin', 'ethereum'];
    const deviceName = device.name.toLowerCase();
    
    return walletKeywords.some(keyword => deviceName.includes(keyword));
  }

  // Add or update wallet device
  _addWalletDevice(walletDevice) {
    const existingDevice = this.discoveredWalletDevices.get(walletDevice.id);
    
    if (existingDevice) {
      // Update existing device
      const updatedDevice = { ...existingDevice, ...walletDevice };
      this.discoveredWalletDevices.set(walletDevice.id, updatedDevice);
      this._notifySubscribers('walletDeviceUpdated', { device: updatedDevice });
    } else {
      // Add new device
      this.discoveredWalletDevices.set(walletDevice.id, walletDevice);
      this._notifySubscribers('walletDeviceDiscovered', { device: walletDevice });
    }

    this.logger.info('[WalletBLE] Wallet device discovered/updated:', {
      name: walletDevice.name,
      id: walletDevice.id.slice(0, 8) + '...',
      rssi: walletDevice.rssi,
      source: walletDevice.source
    });
  }

  // Connect to a wallet device
  async connectToWalletDevice(deviceId) {
    try {
      const walletDevice = this.discoveredWalletDevices.get(deviceId);
      if (!walletDevice) {
        throw new Error('Wallet device not found');
      }

      if (this.connectedDevices.has(deviceId)) {
        this.logger.warn('[WalletBLE] Already connected to device:', deviceId);
        return this.connectedDevices.get(deviceId);
      }

      this.logger.info('[WalletBLE] Connecting to wallet device:', walletDevice.name);

      // Connect using BLE Manager
      const device = await this.bleManager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();

      const connectionInfo = {
        device,
        walletDevice,
        connectedAt: Date.now(),
        services: []
      };

      // Get services
      const services = await device.services();
      connectionInfo.services = services.map(service => ({
        uuid: service.uuid,
        isPrimary: service.isPrimary
      }));

      this.connectedDevices.set(deviceId, connectionInfo);
      
      this.logger.info('[WalletBLE] Connected to wallet device:', {
        name: walletDevice.name,
        services: connectionInfo.services.length
      });

      this._notifySubscribers('walletDeviceConnected', { 
        deviceId, 
        walletDevice, 
        connectionInfo 
      });

      return connectionInfo;

    } catch (error) {
      this.logger.error('[WalletBLE] Connection failed:', error);
      this._notifySubscribers('connectionError', { deviceId, error });
      throw error;
    }
  }

  // Send data to connected wallet device
  async sendDataToWalletDevice(deviceId, data) {
    try {
      const connectionInfo = this.connectedDevices.get(deviceId);
      if (!connectionInfo) {
        throw new Error('Wallet device not connected');
      }

      // Convert data to base64
      const base64Data = typeof data === 'string' ? 
        Buffer.from(data).toString('base64') : 
        data;

      // Find writable characteristic
      const services = await connectionInfo.device.services();
      let targetCharacteristic = null;

      for (const service of services) {
        const characteristics = await service.characteristics();
        targetCharacteristic = characteristics.find(char => 
          char.isWritableWithResponse || char.isWritableWithoutResponse
        );
        if (targetCharacteristic) break;
      }

      if (!targetCharacteristic) {
        throw new Error('No writable characteristic found');
      }

      await targetCharacteristic.writeWithResponse(base64Data);
      
      this.logger.info('[WalletBLE] Data sent to wallet device:', deviceId);
      this._notifySubscribers('dataSentToWallet', { deviceId, data });

    } catch (error) {
      this.logger.error('[WalletBLE] Send data failed:', error);
      throw error;
    }
  }

  // Get discovered wallet devices
  getDiscoveredWalletDevices() {
    return Array.from(this.discoveredWalletDevices.values());
  }

  // Get connected wallet devices
  getConnectedWalletDevices() {
    return Array.from(this.connectedDevices.values());
  }

  // Start scanning (advertising not supported)
  async startBoth() {
    await this.startScanning();
  }

  // Stop scanning
  async stopBoth() {
    await this.stopScanning();
  }

  // Advertising methods (not supported in this version)
  async startAdvertising() {
    this.logger.warn('[WalletBLE] Advertising not supported in this version');
    return Promise.resolve();
  }

  async stopAdvertising() {
    this.logger.warn('[WalletBLE] Advertising not supported in this version');
    return Promise.resolve();
  }

  // Clear discovered devices
  clearDiscoveredDevices() {
    this.discoveredWalletDevices.clear();
    this._notifySubscribers('devicesCleared', {});
  }

  // Subscribe to events
  subscribe(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }
    this.subscribers.get(event).push(callback);
  }

  // Unsubscribe from events
  unsubscribe(event, callback) {
    if (this.subscribers.has(event)) {
      const callbacks = this.subscribers.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // Notify subscribers
  _notifySubscribers(event, data) {
    if (this.subscribers.has(event)) {
      this.subscribers.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          this.logger.error('[WalletBLE] Subscriber callback error:', error);
        }
      });
    }
  }

  // Cleanup
  destroy() {
    this.stopScanning().catch(error => {
      this.logger.error('[WalletBLE] Cleanup error:', error);
    });

    // Disconnect all devices
    for (const deviceId of this.connectedDevices.keys()) {
      const connectionInfo = this.connectedDevices.get(deviceId);
      if (connectionInfo && connectionInfo.device) {
        connectionInfo.device.cancelConnection().catch(error => {
          this.logger.error('[WalletBLE] Cleanup disconnect error:', error);
        });
      }
    }

    this.subscribers.clear();
    this.discoveredWalletDevices.clear();
    this.connectedDevices.clear();
    
    if (this.bleManager) {
      this.bleManager.destroy();
    }
  }
}

export default WalletBleService;
