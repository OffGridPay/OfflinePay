/**
 * Simplified React hook for BLE functionality
 * Provides easy-to-use interface for scanning, connecting, and data sharing
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import SimpleBleService, { DEVICE_TYPES } from '../services/SimpleBleService';

export default function useSimpleBle(options = {}) {
  const { autoStart = false, logger = console } = options;
  
  const serviceRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [bluetoothState, setBluetoothState] = useState('Unknown');
  const [error, setError] = useState(null);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [connectedDevices, setConnectedDevices] = useState([]);

  // Initialize BLE service
  const initializeService = useCallback(async () => {
    if (serviceRef.current) {
      return serviceRef.current;
    }

    try {
      logger.info('[useSimpleBle] Initializing BLE service...');
      const service = new SimpleBleService({ logger });
      
      // Subscribe to events
      service.subscribe('stateChange', ({ state }) => {
        setBluetoothState(state);
        if (state !== 'PoweredOn') {
          setError(`Bluetooth is ${state}. Please enable Bluetooth.`);
        } else {
          setError(null);
        }
      });

      service.subscribe('scanStarted', () => {
        setIsScanning(true);
        setError(null);
        logger.info('[useSimpleBle] Scan started');
      });

      service.subscribe('scanStopped', () => {
        setIsScanning(false);
        logger.info('[useSimpleBle] Scan stopped');
      });

      service.subscribe('scanError', ({ error }) => {
        setError(error.message || 'Scan failed');
        setIsScanning(false);
        logger.error('[useSimpleBle] Scan error:', error);
      });

      service.subscribe('deviceDiscovered', ({ device }) => {
        setDiscoveredDevices(prev => {
          const existing = prev.find(d => d.id === device.id);
          if (existing) {
            // Update existing device
            return prev.map(d => d.id === device.id ? device : d);
          } else {
            // Add new device
            return [...prev, device];
          }
        });
      });

      service.subscribe('deviceConnected', ({ deviceId, deviceInfo, connectionInfo }) => {
        setConnectedDevices(prev => {
          const existing = prev.find(d => d.deviceId === deviceId);
          if (!existing) {
            return [...prev, { deviceId, deviceInfo, connectionInfo, connectedAt: Date.now() }];
          }
          return prev;
        });
        logger.info('[useSimpleBle] Device connected:', deviceInfo.name);
      });

      service.subscribe('deviceDisconnected', ({ deviceId }) => {
        setConnectedDevices(prev => prev.filter(d => d.deviceId !== deviceId));
        logger.info('[useSimpleBle] Device disconnected:', deviceId);
      });

      service.subscribe('connectionError', ({ deviceId, error }) => {
        setError(`Connection failed: ${error.message}`);
        logger.error('[useSimpleBle] Connection error:', error);
      });

      service.subscribe('dataSent', ({ deviceId, data }) => {
        logger.info('[useSimpleBle] Data sent to device:', deviceId);
      });

      serviceRef.current = service;
      setIsInitialized(true);
      setError(null);
      
      logger.info('[useSimpleBle] BLE service initialized successfully');
      return service;

    } catch (error) {
      logger.error('[useSimpleBle] Failed to initialize BLE service:', error);
      setError(error.message || 'Failed to initialize BLE');
      throw error;
    }
  }, [logger]);

  // Start scanning for devices
  const startScanning = useCallback(async () => {
    try {
      const service = serviceRef.current || await initializeService();
      await service.startScanning();
    } catch (error) {
      logger.error('[useSimpleBle] Failed to start scanning:', error);
      setError(error.message || 'Failed to start scanning');
    }
  }, [initializeService, logger]);

  // Stop scanning
  const stopScanning = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.stopScanning();
    }
  }, []);

  // Connect to a device
  const connectToDevice = useCallback(async (deviceId) => {
    try {
      if (!serviceRef.current) {
        throw new Error('BLE service not initialized');
      }
      
      setError(null);
      await serviceRef.current.connectToDevice(deviceId);
    } catch (error) {
      logger.error('[useSimpleBle] Failed to connect to device:', error);
      setError(error.message || 'Connection failed');
      throw error;
    }
  }, [logger]);

  // Disconnect from device
  const disconnectFromDevice = useCallback(async (deviceId) => {
    try {
      if (!serviceRef.current) {
        throw new Error('BLE service not initialized');
      }
      
      await serviceRef.current.disconnectFromDevice(deviceId);
    } catch (error) {
      logger.error('[useSimpleBle] Failed to disconnect from device:', error);
      setError(error.message || 'Disconnect failed');
      throw error;
    }
  }, [logger]);

  // Send data to connected device
  const sendData = useCallback(async (deviceId, data) => {
    try {
      if (!serviceRef.current) {
        throw new Error('BLE service not initialized');
      }
      
      await serviceRef.current.sendData(deviceId, data);
    } catch (error) {
      logger.error('[useSimpleBle] Failed to send data:', error);
      setError(error.message || 'Send data failed');
      throw error;
    }
  }, [logger]);

  // Get devices filtered by type
  const getDevicesByType = useCallback((type) => {
    return discoveredDevices.filter(device => device.type === type);
  }, [discoveredDevices]);

  // Get phone devices only
  const getPhoneDevices = useCallback(() => {
    return getDevicesByType(DEVICE_TYPES.PHONE);
  }, [getDevicesByType]);

  // Get other devices (non-phones)
  const getOtherDevices = useCallback(() => {
    return discoveredDevices.filter(device => 
      device.type === DEVICE_TYPES.OTHER || device.type === DEVICE_TYPES.UNKNOWN
    );
  }, [discoveredDevices]);

  // Clear discovered devices
  const clearDiscoveredDevices = useCallback(() => {
    setDiscoveredDevices([]);
  }, []);

  // Initialize service on mount if autoStart is enabled
  useEffect(() => {
    if (autoStart) {
      initializeService().catch(error => {
        logger.error('[useSimpleBle] Auto-initialization failed:', error);
      });
    }
  }, [autoStart, initializeService, logger]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.destroy();
        serviceRef.current = null;
      }
    };
  }, []);

  return {
    // State
    isInitialized,
    isScanning,
    bluetoothState,
    error,
    discoveredDevices,
    connectedDevices,
    
    // Device filtering
    phoneDevices: getPhoneDevices(),
    otherDevices: getOtherDevices(),
    
    // Actions
    initializeService,
    startScanning,
    stopScanning,
    connectToDevice,
    disconnectFromDevice,
    sendData,
    clearDiscoveredDevices,
    getDevicesByType,
    
    // Service reference for advanced usage
    service: serviceRef.current,
  };
}
