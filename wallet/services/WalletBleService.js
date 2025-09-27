/**
 * Wallet BLE Service - Complete BLE solution for peer-to-peer wallet discovery
 * Combines advertising (peripheral mode) and scanning (central mode)
 * Only discovers devices running the same wallet app
 */

import { Platform, PermissionsAndroid, NativeEventEmitter, NativeModules } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import BLEAdvertiser from 'react-native-ble-advertiser';

// Custom service UUID for our wallet app - ONLY devices with this app will advertise this UUID
export const WALLET_APP_SERVICE_UUID = '12345678-9ABC-DEF0-1234-56789ABCDEF0';
export const WALLET_DATA_CHARACTERISTIC_UUID = '87654321-4321-4321-4321-CBA987654321';

// Company ID for manufacturer data (you can register your own or use a test ID)
const WALLET_COMPANY_ID = 0x0059; // Test company ID

export const DEVICE_STATES = {
  BLUETOOTH_OFF: 'bluetooth_off',
  READY: 'ready',
  ADVERTISING: 'advertising',
  SCANNING: 'scanning',
  BOTH: 'both', // Both advertising and scanning
  ERROR: 'error'
};

export class WalletBleService {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.walletAddress = options.walletAddress || null;
    
    // BLE Manager for scanning (central mode)
    this.bleManager = new BleManager();
    
    // Event emitter for BLE Advertiser
    this.advertiserEmitter = new NativeEventEmitter(NativeModules.BLEAdvertiser);
    
    // State management
    this.state = DEVICE_STATES.BLUETOOTH_OFF;
    this.isAdvertising = false;
    this.isScanning = false;
    this.discoveredWalletDevices = new Map(); // Only devices with our app
    this.connectedDevices = new Map();
    
    // Event subscribers
    this.subscribers = new Map();
    
    // Initialize BLE state monitoring
    this._initializeStateMonitoring();
  }

  // Initialize BLE state monitoring
  _initializeStateMonitoring() {
    // Monitor BLE Manager state changes
    this.bleManager.onStateChange((state) => {
      this.logger.info('[WalletBLE] BLE Manager state changed:', state);
      this._updateState();
      this._notifySubscribers('stateChange', { state, managerState: state });
    }, true);

    // Monitor BLE Advertiser state changes
    this.advertiserEmitter.addListener('onBTStatusChange', (enabled) => {
      this.logger.info('[WalletBLE] BLE Advertiser state changed:', enabled);
      this._updateState();
      this._notifySubscribers('stateChange', { advertiserEnabled: enabled });
    });

    // Listen for discovered devices from advertiser
    this.advertiserEmitter.addListener('onDeviceFound', (deviceData) => {
      this._handleAdvertiserDeviceFound(deviceData);
    });
  }

  // Update overall service state
  _updateState() {
    const managerState = this.bleManager.state();
    
    if (managerState !== 'PoweredOn') {
      this.state = DEVICE_STATES.BLUETOOTH_OFF;
    } else if (this.isAdvertising && this.isScanning) {
      this.state = DEVICE_STATES.BOTH;
    } else if (this.isAdvertising) {
      this.state = DEVICE_STATES.ADVERTISING;
    } else if (this.isScanning) {
      this.state = DEVICE_STATES.SCANNING;
    } else {
      this.state = DEVICE_STATES.READY;
    }

    this._notifySubscribers('stateUpdate', { state: this.state });
  }

  // Request all necessary permissions
  async requestPermissions() {
    if (Platform.OS === 'android') {
      try {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
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

        this.logger.info('[WalletBLE] All BLE permissions granted');
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
      throw error;
    }
  }

  // Start advertising as a wallet app device
  async startAdvertising() {
    try {
      if (this.isAdvertising) {
        this.logger.warn('[WalletBLE] Already advertising');
        return;
      }

      this.logger.info('[WalletBLE] Starting advertising...');

      // Set company ID
      BLEAdvertiser.setCompanyId(WALLET_COMPANY_ID);

      // Create manufacturer data with wallet identifier
      const manufacturerData = [0x57, 0x41, 0x4C, 0x4C, 0x45, 0x54]; // "WALLET" in hex

      // Start advertising with our custom service UUID
      await BLEAdvertiser.broadcast(
        [WALLET_APP_SERVICE_UUID], 
        manufacturerData,
        {
          advertiseMode: BLEAdvertiser.ADVERTISE_MODE_BALANCED,
          txPowerLevel: BLEAdvertiser.ADVERTISE_TX_POWER_MEDIUM,
          connectable: true,
          includeDeviceName: true,
          includeTxPowerLevel: true
        }
      );

      this.isAdvertising = true;
      this._updateState();
      
      this.logger.info('[WalletBLE] Advertising started successfully');
      this._notifySubscribers('advertisingStarted', {});

    } catch (error) {
      this.logger.error('[WalletBLE] Failed to start advertising:', error);
      this._notifySubscribers('advertisingError', { error });
      throw error;
    }
  }

  // Stop advertising
  async stopAdvertising() {
    try {
      if (!this.isAdvertising) {
        return;
      }

      await BLEAdvertiser.stopBroadcast();
      this.isAdvertising = false;
      this._updateState();
      
      this.logger.info('[WalletBLE] Advertising stopped');
      this._notifySubscribers('advertisingStopped', {});

    } catch (error) {
      this.logger.error('[WalletBLE] Failed to stop advertising:', error);
      throw error;
    }
  }

  // Start scanning for wallet app devices
  async startScanning() {
    try {
      if (this.isScanning) {
        this.logger.warn('[WalletBLE] Already scanning');
        return;
      }

      this.logger.info('[WalletBLE] Starting scan for wallet devices...');
      this.discoveredWalletDevices.clear();

      // Method 1: Scan using BLE Manager for devices advertising our service UUID
      this.bleManager.startDeviceScan([WALLET_APP_SERVICE_UUID], null, (error, device) => {
        if (error) {
          this.logger.error('[WalletBLE] BLE Manager scan error:', error);
          return;
        }

        if (device) {
          this._handleBleManagerDeviceFound(device);
        }
      });

      // Method 2: Scan using BLE Advertiser for manufacturer data
      BLEAdvertiser.setCompanyId(WALLET_COMPANY_ID);
      await BLEAdvertiser.scanByService([WALLET_APP_SERVICE_UUID], {
        scanMode: BLEAdvertiser.SCAN_MODE_BALANCED,
        matchMode: BLEAdvertiser.MATCH_MODE_AGGRESSIVE,
        numberOfMatches: BLEAdvertiser.MATCH_NUM_MAX_ADVERTISEMENT,
        reportDelay: 0
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
      await BLEAdvertiser.stopScan();
      
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

    const walletDevice = {
      id: device.id,
      name: device.name,
      rssi: device.rssi,
      isConnectable: device.isConnectable,
      lastSeen: Date.now(),
      source: 'ble_manager',
      serviceUUIDs: device.serviceUUIDs || [],
      rawDevice: device
    };

    this._addWalletDevice(walletDevice);
  }

  // Handle device found via BLE Advertiser
  _handleAdvertiserDeviceFound(deviceData) {
    const walletDevice = {
      id: deviceData.address || deviceData.id,
      name: deviceData.name || 'Unknown Wallet Device',
      rssi: deviceData.rssi,
      isConnectable: true,
      lastSeen: Date.now(),
      source: 'ble_advertiser',
      manufacturerData: deviceData.manufacturerData,
      serviceUUIDs: deviceData.serviceUUIDs || [],
      rawDevice: deviceData
    };

    this._addWalletDevice(walletDevice);
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

  // Start both advertising and scanning
  async startBoth() {
    await this.startAdvertising();
    await this.startScanning();
  }

  // Stop both advertising and scanning
  async stopBoth() {
    await this.stopAdvertising();
    await this.stopScanning();
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
    this.stopBoth().catch(error => {
      this.logger.error('[WalletBLE] Cleanup error:', error);
    });

    // Disconnect all devices
    for (const deviceId of this.connectedDevices.keys()) {
      this.connectedDevices.get(deviceId).device.cancelConnection().catch(error => {
        this.logger.error('[WalletBLE] Cleanup disconnect error:', error);
      });
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
