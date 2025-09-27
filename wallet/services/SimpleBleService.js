/**
 * Simplified BLE Service for reliable device scanning and connection
 * Focuses on core functionality: scan, connect, and data sharing between phones
 */

import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager } from 'react-native-ble-plx';

// Service UUID for our wallet app
export const WALLET_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
export const DATA_CHARACTERISTIC_UUID = '87654321-4321-4321-4321-cba987654321';

// Device types for filtering
export const DEVICE_TYPES = {
  PHONE: 'phone',
  OTHER: 'other',
  UNKNOWN: 'unknown'
};

export class SimpleBleService {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.manager = new BleManager();
    this.isScanning = false;
    this.connectedDevices = new Map();
    this.discoveredDevices = new Map();
    this.subscribers = new Map();
    
    // Initialize manager
    this.manager.onStateChange((state) => {
      this.logger.info('[SimpleBLE] State changed:', state);
      this._notifySubscribers('stateChange', { state });
    }, true);
  }

  // Request necessary permissions
  async requestPermissions() {
    if (Platform.OS === 'android') {
      try {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        const granted = await PermissionsAndroid.requestMultiple(permissions);
        
        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          this.logger.error('[SimpleBLE] Not all permissions granted:', granted);
          return false;
        }

        this.logger.info('[SimpleBLE] All permissions granted');
        return true;
      } catch (error) {
        this.logger.error('[SimpleBLE] Permission request failed:', error);
        return false;
      }
    }
    return true; // iOS handles permissions automatically
  }

  // Start scanning for devices
  async startScanning() {
    try {
      if (this.isScanning) {
        this.logger.warn('[SimpleBLE] Already scanning');
        return;
      }

      // Request permissions first
      const hasPermissions = await this.requestPermissions();
      if (!hasPermissions) {
        throw new Error('BLE permissions not granted');
      }

      // Check if Bluetooth is enabled
      const state = await this.manager.state();
      if (state !== 'PoweredOn') {
        throw new Error(`Bluetooth not ready. State: ${state}`);
      }

      this.logger.info('[SimpleBLE] Starting scan...');
      this.isScanning = true;
      this.discoveredDevices.clear();

      // Start scanning with no service filter to find all devices
      this.manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          this.logger.error('[SimpleBLE] Scan error:', error);
          this._notifySubscribers('scanError', { error });
          return;
        }

        if (device) {
          this._handleDeviceDiscovered(device);
        }
      });

      this._notifySubscribers('scanStarted', {});
      
      // Auto-stop scanning after 30 seconds to save battery
      setTimeout(() => {
        if (this.isScanning) {
          this.stopScanning();
        }
      }, 30000);

    } catch (error) {
      this.logger.error('[SimpleBLE] Failed to start scanning:', error);
      this.isScanning = false;
      throw error;
    }
  }

  // Stop scanning
  stopScanning() {
    if (!this.isScanning) {
      return;
    }

    this.logger.info('[SimpleBLE] Stopping scan...');
    this.manager.stopDeviceScan();
    this.isScanning = false;
    this._notifySubscribers('scanStopped', {});
  }

  // Handle discovered device
  _handleDeviceDiscovered(device) {
    if (!device.id || !device.name) {
      return; // Skip devices without name or ID
    }

    const deviceInfo = {
      id: device.id,
      name: device.name,
      rssi: device.rssi,
      type: this._determineDeviceType(device),
      isConnectable: device.isConnectable,
      lastSeen: Date.now(),
      rawDevice: device
    };

    // Update or add device
    this.discoveredDevices.set(device.id, deviceInfo);
    
    this.logger.info('[SimpleBLE] Device discovered:', {
      name: deviceInfo.name,
      type: deviceInfo.type,
      rssi: deviceInfo.rssi
    });

    this._notifySubscribers('deviceDiscovered', { device: deviceInfo });
  }

  // Determine if device is a phone or other device
  _determineDeviceType(device) {
    const name = device.name?.toLowerCase() || '';
    
    // Common phone indicators
    const phoneIndicators = [
      'iphone', 'android', 'samsung', 'pixel', 'oneplus', 'huawei', 
      'xiaomi', 'oppo', 'vivo', 'lg', 'motorola', 'nokia', 'sony'
    ];

    // Check if device name contains phone indicators
    const isPhone = phoneIndicators.some(indicator => name.includes(indicator));
    
    if (isPhone) {
      return DEVICE_TYPES.PHONE;
    }

    // Check for other common device types
    const otherDeviceIndicators = [
      'headphone', 'speaker', 'watch', 'fitness', 'car', 'tv', 'mouse', 'keyboard'
    ];

    const isOtherDevice = otherDeviceIndicators.some(indicator => name.includes(indicator));
    
    if (isOtherDevice) {
      return DEVICE_TYPES.OTHER;
    }

    return DEVICE_TYPES.UNKNOWN;
  }

  // Connect to a device
  async connectToDevice(deviceId) {
    try {
      const deviceInfo = this.discoveredDevices.get(deviceId);
      if (!deviceInfo) {
        throw new Error('Device not found in discovered devices');
      }

      if (this.connectedDevices.has(deviceId)) {
        this.logger.warn('[SimpleBLE] Already connected to device:', deviceId);
        return this.connectedDevices.get(deviceId);
      }

      this.logger.info('[SimpleBLE] Connecting to device:', deviceInfo.name);

      // Connect to the device
      const device = await this.manager.connectToDevice(deviceId);
      
      // Discover services and characteristics
      await device.discoverAllServicesAndCharacteristics();

      const connectionInfo = {
        device,
        deviceInfo,
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
      
      this.logger.info('[SimpleBLE] Connected to device:', {
        name: deviceInfo.name,
        services: connectionInfo.services.length
      });

      this._notifySubscribers('deviceConnected', { 
        deviceId, 
        deviceInfo, 
        connectionInfo 
      });

      return connectionInfo;

    } catch (error) {
      this.logger.error('[SimpleBLE] Connection failed:', error);
      this._notifySubscribers('connectionError', { deviceId, error });
      throw error;
    }
  }

  // Disconnect from device
  async disconnectFromDevice(deviceId) {
    try {
      const connectionInfo = this.connectedDevices.get(deviceId);
      if (!connectionInfo) {
        this.logger.warn('[SimpleBLE] Device not connected:', deviceId);
        return;
      }

      await connectionInfo.device.cancelConnection();
      this.connectedDevices.delete(deviceId);

      this.logger.info('[SimpleBLE] Disconnected from device:', deviceId);
      this._notifySubscribers('deviceDisconnected', { deviceId });

    } catch (error) {
      this.logger.error('[SimpleBLE] Disconnect failed:', error);
      throw error;
    }
  }

  // Send data to connected device
  async sendData(deviceId, data) {
    try {
      const connectionInfo = this.connectedDevices.get(deviceId);
      if (!connectionInfo) {
        throw new Error('Device not connected');
      }

      // Convert data to base64 if it's a string
      const base64Data = typeof data === 'string' ? 
        Buffer.from(data).toString('base64') : 
        data;

      // Find our service and characteristic
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

      // Write data
      await targetCharacteristic.writeWithResponse(base64Data);
      
      this.logger.info('[SimpleBLE] Data sent to device:', deviceId);
      this._notifySubscribers('dataSent', { deviceId, data });

    } catch (error) {
      this.logger.error('[SimpleBLE] Send data failed:', error);
      throw error;
    }
  }

  // Get discovered devices filtered by type
  getDiscoveredDevices(type = null) {
    const devices = Array.from(this.discoveredDevices.values());
    
    if (type) {
      return devices.filter(device => device.type === type);
    }
    
    return devices;
  }

  // Get phone devices only
  getPhoneDevices() {
    return this.getDiscoveredDevices(DEVICE_TYPES.PHONE);
  }

  // Get connected devices
  getConnectedDevices() {
    return Array.from(this.connectedDevices.values());
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
          this.logger.error('[SimpleBLE] Subscriber callback error:', error);
        }
      });
    }
  }

  // Cleanup
  destroy() {
    this.stopScanning();
    
    // Disconnect all devices
    for (const deviceId of this.connectedDevices.keys()) {
      this.disconnectFromDevice(deviceId).catch(error => {
        this.logger.error('[SimpleBLE] Cleanup disconnect error:', error);
      });
    }

    this.subscribers.clear();
    this.discoveredDevices.clear();
    this.connectedDevices.clear();
    
    if (this.manager) {
      this.manager.destroy();
    }
  }
}

export default SimpleBleService;
