/**
 * React hook for BLE relayer functionality
 * Integrates BleRelayerService with connectivity monitoring and wallet state
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import BleRelayerService from '../services/BleRelayerService';
import { useConnectivity } from '../context/ConnectivityContext';
import { fetchWallet } from '../utils/db';

export default function useBleRelay(options = {}) {
  const { autoStart = true, logger = console } = options;
  const connectivity = useConnectivity();
  
  const serviceRef = useRef(null);
  const [wallet, setWallet] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState(null);
  const [peers, setPeers] = useState([]);
  const [relayerRole, setRelayerRole] = useState({ isOnline: false, canRelay: false });

  // Initialize the service
  const initializeService = useCallback(async () => {
    if (serviceRef.current || !wallet) return;

    try {
      const service = new BleRelayerService({
        walletAddress: wallet.address,
        logger,
      });

      await service.initialize();
      
      // Subscribe to peer discovery events
      service.subscribe('peerDiscovered', (peerInfo) => {
        setPeers(prev => {
          const exists = prev.find(p => p.id === peerInfo.id);
          if (exists) {
            return prev.map(p => p.id === peerInfo.id ? peerInfo : p);
          }
          return [...prev, peerInfo];
        });
      });

      service.subscribe('roleChanged', ({ role, isOnline, canRelay }) => {
        setRelayerRole({ isOnline, canRelay });
        logger.info('[ble-relay-hook] role updated:', { isOnline, canRelay });
      });

      serviceRef.current = service;
      setIsInitialized(true);
      setError(null);

    } catch (initError) {
      logger.error('[ble-relay-hook] initialization failed:', initError);
      setError(initError.message);
      setIsSupported(false);
    }
  }, [wallet, logger]);

  // Update relayer role based on connectivity
  const updateRelayerRole = useCallback(async () => {
    const service = serviceRef.current;
    if (!service || !isInitialized) return;

    const canRelay = connectivity.isConnected && connectivity.isInternetReachable;
    const isOnline = connectivity.isConnected;

    try {
      await service.updateRole(isOnline, canRelay);
      
      // Start/stop advertising based on role
      if (canRelay && !service.isAdvertising) {
        await service.startAdvertising();
      } else if (!canRelay && service.isAdvertising) {
        await service.stopAdvertising();
      }

    } catch (roleError) {
      logger.error('[ble-relay-hook] role update failed:', roleError);
      setError(roleError.message);
    }
  }, [connectivity.isConnected, connectivity.isInternetReachable, isInitialized, logger]);

  // Start/stop scanning
  const startScanning = useCallback(async () => {
    const service = serviceRef.current;
    if (!service || !isInitialized) {
      logger.warn('[ble-relay-hook] service not ready for scanning');
      return;
    }

    try {
      await service.startScanning();
    } catch (scanError) {
      logger.error('[ble-relay-hook] start scanning failed:', scanError);
      setError(scanError.message);
    }
  }, [isInitialized, logger]);

  const stopScanning = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) return;

    try {
      await service.stopScanning();
    } catch (scanError) {
      logger.error('[ble-relay-hook] stop scanning failed:', scanError);
    }
  }, [logger]);

  // Load wallet on hook mount
  useEffect(() => {
    fetchWallet()
      .then(walletData => {
        if (walletData) {
          setWallet(walletData);
        }
      })
      .catch(error => {
        logger.error('[ble-relay-hook] wallet fetch failed:', error);
      });
  }, [logger]);

  // Initialize service when wallet is loaded
  useEffect(() => {
    if (wallet && autoStart) {
      initializeService();
    }
  }, [wallet, autoStart, initializeService]);

  // Update role when connectivity changes
  useEffect(() => {
    if (isInitialized) {
      updateRelayerRole();
    }
  }, [isInitialized, updateRelayerRole]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const service = serviceRef.current;
      if (service) {
        service.destroy();
        serviceRef.current = null;
      }
    };
  }, []);

  // Get relayer peers (devices capable of relaying)
  const getRelayerPeers = useCallback(() => {
    return peers.filter(peer => peer.role & 0x04); // RELAY_CAPABLE flag
  }, [peers]);

  return {
    isSupported,
    isInitialized,
    error,
    peers,
    relayerPeers: getRelayerPeers(),
    relayerRole,
    startScanning,
    stopScanning,
    service: serviceRef.current,
  };
}
