/**
 * React hook for Wallet BLE functionality
 * Provides easy-to-use interface for scanning and connecting to BLE devices
 * Note: Advertising functionality removed due to library compatibility issues
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import WalletBleService, { DEVICE_STATES } from '../services/WalletBleService';

export default function useWalletBle(options = {}) {
  const { autoStart = false, logger = console, walletAddress = null } = options;
  
  const serviceRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [state, setState] = useState(DEVICE_STATES.BLUETOOTH_OFF);
  const [isAdvertising, setIsAdvertising] = useState(false); // Always false in this version
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [discoveredWalletDevices, setDiscoveredWalletDevices] = useState([]);
  const [connectedWalletDevices, setConnectedWalletDevices] = useState([]);

  // Initialize BLE service
  const initializeService = useCallback(async () => {
    if (serviceRef.current) {
      return serviceRef.current;
    }

    try {
      logger.info('[useWalletBle] Initializing wallet BLE service...');
      const service = new WalletBleService({ logger, walletAddress });
      
      // Subscribe to events
      service.subscribe('stateChange', (data) => {
        logger.info('[useWalletBle] BLE state changed:', data);
        if (data.state) {
          setState(data.state);
        }
        if (data.managerState && data.managerState !== 'PoweredOn') {
          setError(`Bluetooth is ${data.managerState}. Please enable Bluetooth.`);
        } else {
          setError(null);
        }
      });

      service.subscribe('scanningStarted', () => {
        setIsScanning(true);
        setError(null);
        logger.info('[useWalletBle] Scanning started');
      });

      service.subscribe('scanningStopped', () => {
        setIsScanning(false);
        logger.info('[useWalletBle] Scanning stopped');
      });

      service.subscribe('scanningError', ({ error }) => {
        setError(`Scanning failed: ${error.message}`);
        setIsScanning(false);
        logger.error('[useWalletBle] Scanning error:', error);
      });

      service.subscribe('walletDeviceDiscovered', ({ device }) => {
        setDiscoveredWalletDevices(prev => {
          const existing = prev.find(d => d.id === device.id);
          if (!existing) {
            return [...prev, device];
          }
          return prev;
        });
        logger.info('[useWalletBle] Wallet device discovered:', device.name);
      });

      service.subscribe('walletDeviceUpdated', ({ device }) => {
        setDiscoveredWalletDevices(prev => 
          prev.map(d => d.id === device.id ? device : d)
        );
      });

      service.subscribe('walletDeviceConnected', ({ deviceId, walletDevice, connectionInfo }) => {
        setConnectedWalletDevices(prev => {
          const existing = prev.find(d => d.deviceId === deviceId);
          if (!existing) {
            return [...prev, { deviceId, walletDevice, connectionInfo, connectedAt: Date.now() }];
          }
          return prev;
        });
        logger.info('[useWalletBle] Wallet device connected:', walletDevice.name);
      });

      service.subscribe('connectionError', ({ deviceId, error }) => {
        setError(`Connection failed: ${error.message}`);
        logger.error('[useWalletBle] Connection error:', error);
      });

      service.subscribe('dataSentToWallet', ({ deviceId, data }) => {
        logger.info('[useWalletBle] Data sent to wallet device:', deviceId);
      });

      await service.initialize();
      serviceRef.current = service;
      setIsInitialized(true);
      setError(null);
      
      logger.info('[useWalletBle] Wallet BLE service initialized successfully');
      return service;

    } catch (error) {
      logger.error('[useWalletBle] Failed to initialize wallet BLE service:', error);
      setError(error.message || 'Failed to initialize BLE');
      throw error;
    }
  }, [logger, walletAddress]);

  // Start advertising
  const startAdvertising = useCallback(async () => {
    try {
      const service = serviceRef.current || await initializeService();
      await service.startAdvertising();
    } catch (error) {
      logger.error('[useWalletBle] Failed to start advertising:', error);
      setError(error.message || 'Failed to start advertising');
    }
  }, [initializeService, logger]);

  // Stop advertising
  const stopAdvertising = useCallback(async () => {
    try {
      if (serviceRef.current) {
        await serviceRef.current.stopAdvertising();
      }
    } catch (error) {
      logger.error('[useWalletBle] Failed to stop advertising:', error);
      setError(error.message || 'Failed to stop advertising');
    }
  }, [logger]);

  // Start scanning
  const startScanning = useCallback(async () => {
    try {
      const service = serviceRef.current || await initializeService();
      await service.startScanning();
    } catch (error) {
      logger.error('[useWalletBle] Failed to start scanning:', error);
      setError(error.message || 'Failed to start scanning');
    }
  }, [initializeService, logger]);

  // Stop scanning
  const stopScanning = useCallback(async () => {
    try {
      if (serviceRef.current) {
        await serviceRef.current.stopScanning();
      }
    } catch (error) {
      logger.error('[useWalletBle] Failed to stop scanning:', error);
      setError(error.message || 'Failed to stop scanning');
    }
  }, [logger]);

  // Start both advertising and scanning
  const startBoth = useCallback(async () => {
    try {
      const service = serviceRef.current || await initializeService();
      await service.startBoth();
    } catch (error) {
      logger.error('[useWalletBle] Failed to start both:', error);
      setError(error.message || 'Failed to start BLE operations');
    }
  }, [initializeService, logger]);

  // Stop both advertising and scanning
  const stopBoth = useCallback(async () => {
    try {
      if (serviceRef.current) {
        await serviceRef.current.stopBoth();
      }
    } catch (error) {
      logger.error('[useWalletBle] Failed to stop both:', error);
      setError(error.message || 'Failed to stop BLE operations');
    }
  }, [logger]);

  // Connect to wallet device
  const connectToWalletDevice = useCallback(async (deviceId) => {
    try {
      if (!serviceRef.current) {
        throw new Error('BLE service not initialized');
      }
      
      setError(null);
      await serviceRef.current.connectToWalletDevice(deviceId);
    } catch (error) {
      logger.error('[useWalletBle] Failed to connect to wallet device:', error);
      setError(error.message || 'Connection failed');
      throw error;
    }
  }, [logger]);

  // Send data to wallet device
  const sendDataToWalletDevice = useCallback(async (deviceId, data) => {
    try {
      if (!serviceRef.current) {
        throw new Error('BLE service not initialized');
      }
      
      await serviceRef.current.sendDataToWalletDevice(deviceId, data);
    } catch (error) {
      logger.error('[useWalletBle] Failed to send data to wallet device:', error);
      setError(error.message || 'Send data failed');
      throw error;
    }
  }, [logger]);

  // Clear discovered devices
  const clearDiscoveredDevices = useCallback(() => {
    setDiscoveredWalletDevices([]);
  }, []);

  // Get device by ID
  const getWalletDeviceById = useCallback((deviceId) => {
    return discoveredWalletDevices.find(device => device.id === deviceId);
  }, [discoveredWalletDevices]);

  // Check if device is connected
  const isWalletDeviceConnected = useCallback((deviceId) => {
    return connectedWalletDevices.some(conn => conn.deviceId === deviceId);
  }, [connectedWalletDevices]);

  // Initialize service on mount if autoStart is enabled
  useEffect(() => {
    if (autoStart) {
      initializeService().catch(error => {
        logger.error('[useWalletBle] Auto-initialization failed:', error);
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
    state,
    isAdvertising,
    isScanning,
    error,
    discoveredWalletDevices,
    connectedWalletDevices,
    
    // Computed state
    isBluetoothReady: state !== DEVICE_STATES.BLUETOOTH_OFF && state !== DEVICE_STATES.ERROR,
    deviceCount: discoveredWalletDevices.length,
    connectionCount: connectedWalletDevices.length,
    
    // Actions
    initializeService,
    startAdvertising,
    stopAdvertising,
    startScanning,
    stopScanning,
    startBoth,
    stopBoth,
    connectToWalletDevice,
    sendDataToWalletDevice,
    clearDiscoveredDevices,
    getWalletDeviceById,
    isWalletDeviceConnected,
    
    // Service reference for advanced usage
    service: serviceRef.current,
  };
}
