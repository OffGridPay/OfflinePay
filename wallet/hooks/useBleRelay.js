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
  const subscriptionsRef = useRef([]);
  const [wallet, setWallet] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState(null);
  const [peers, setPeers] = useState([]);
  const [selectedRelayer, setSelectedRelayer] = useState(null);
  const [relayerRole, setRelayerRole] = useState({ isOnline: false, canRelay: false });
  const [isScanning, setIsScanning] = useState(false);
  const [handshakeContexts, setHandshakeContexts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [handshakeErrors, setHandshakeErrors] = useState([]);

  // Initialize the service
  const initializeService = useCallback(async () => {
    logger.info('[ble-relay-hook] initializeService called', { 
      hasExistingService: !!serviceRef.current, 
      walletAddress: wallet?.address?.slice(0, 10) 
    });

    if (serviceRef.current) return;

    try {
      logger.info('[ble-relay-hook] creating BleRelayerService...');
      const service = new BleRelayerService({
        walletAddress: wallet?.address || null,
        walletPrivateKey: wallet?.privateKey || null,
        logger,
      });

      logger.info('[ble-relay-hook] calling service.initialize()...');
      await service.initialize();
      logger.info('[ble-relay-hook] service.initialize() completed');
      
      // Subscribe to peer discovery events
      const handlePeerDiscovered = (peerInfo) => {
        setPeers((prev) => {
          const exists = prev.find((p) => p.id === peerInfo.id);
          if (exists) {
            return prev.map((p) => (p.id === peerInfo.id ? peerInfo : p));
          }
          return [...prev, peerInfo];
        });
      };

      const handlePeerLost = (peerInfo) => {
        setPeers((prev) => prev.filter((peer) => peer.id !== peerInfo.id));
      };

      const handleRelayerSelected = (peerInfo) => {
        setSelectedRelayer(peerInfo);
      };

      const roleChangedHandler = ({ role, isOnline, canRelay }) => {
        setRelayerRole({ isOnline, canRelay });
        logger.info('[ble-relay-hook] role updated:', { isOnline, canRelay });
      };

      const handleHandshakeInitiated = ({ peerId, contextId, message }) => {
        setHandshakeContexts((prev) => [{ peerId, contextId, message, startedAt: Date.now() }, ...prev]);
      };

      const handleHandshakeFailed = ({ peerId, contextId, error }) => {
        setHandshakeErrors((prev) => [{ peerId, contextId, error, occurredAt: Date.now() }, ...prev.slice(0, 4)]);
        setHandshakeContexts((prev) => prev.filter((ctx) => ctx.contextId !== contextId));
      };

      const handleSessionEstablished = ({ peerId, session, role }) => {
        setHandshakeContexts((prev) => prev.filter((ctx) => ctx.peerId !== peerId));
        setSessions((prev) => {
          const filtered = prev.filter((existing) => existing.sessionId !== session.sessionId);
          return [{ ...session, role }, ...filtered];
        });
      };

      service.subscribe('peerDiscovered', handlePeerDiscovered);
      service.subscribe('peerLost', handlePeerLost);
      service.subscribe('relayerSelected', handleRelayerSelected);
      service.subscribe('roleChanged', roleChangedHandler);
      service.subscribe('handshakeInitiated', handleHandshakeInitiated);
      service.subscribe('handshakeFailed', handleHandshakeFailed);
      service.subscribe('sessionEstablished', handleSessionEstablished);

      subscriptionsRef.current = [
        { event: 'peerDiscovered', handler: handlePeerDiscovered },
        { event: 'peerLost', handler: handlePeerLost },
        { event: 'relayerSelected', handler: handleRelayerSelected },
        { event: 'roleChanged', handler: roleChangedHandler },
        { event: 'handshakeInitiated', handler: handleHandshakeInitiated },
        { event: 'handshakeFailed', handler: handleHandshakeFailed },
        { event: 'sessionEstablished', handler: handleSessionEstablished },
      ];

      serviceRef.current = service;
      setIsInitialized(true);
      setError(null);
      logger.info('[ble-relay-hook] service initialization complete, isInitialized=true');
    } catch (initError) {
      logger.error('[ble-relay-hook] initialization failed:', initError);
      logger.error('[ble-relay-hook] initialization error stack:', initError.stack);
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
      setError('BLE service not initialized');
      return;
    }

    try {
      setError(null); // Clear any previous errors
      await service.startScanning();
      setIsScanning(true);
    } catch (scanError) {
      logger.error('[ble-relay-hook] start scanning failed:', scanError);
      setError(`Scan failed: ${scanError.message}`);
      setIsScanning(false);
    }
  }, [isInitialized, logger]);

  const stopScanning = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) return;

    try {
      await service.stopScanning();
      setIsScanning(false);
    } catch (scanError) {
      logger.error('[ble-relay-hook] stop scanning failed:', scanError);
    }
  }, [logger]);

  const initiateHandshake = useCallback(async (peerId) => {
    const service = serviceRef.current;
    if (!service?.initiateHandshake) {
      logger.warn('[ble-relay-hook] initiateHandshake unavailable');
      setError('Handshake service unavailable');
      return null;
    }
    try {
      return await service.initiateHandshake(peerId);
    } catch (handshakeError) {
      logger.error('[ble-relay-hook] initiateHandshake failed:', handshakeError);
      setError(handshakeError.message || 'Handshake initiation failed');
      throw handshakeError;
    }
  }, [logger]);

  const processIncomingHandshake = useCallback(async (peerId, initMessage) => {
    const service = serviceRef.current;
    if (!service?.processIncomingHandshake) {
      logger.warn('[ble-relay-hook] processIncomingHandshake unavailable');
      setError('Handshake service unavailable');
      return null;
    }
    try {
      return await service.processIncomingHandshake(peerId, initMessage);
    } catch (handshakeError) {
      logger.error('[ble-relay-hook] processIncomingHandshake failed:', handshakeError);
      setError(handshakeError.message || 'Handshake processing failed');
      throw handshakeError;
    }
  }, [logger]);

  const completeHandshake = useCallback(async (peerId, responseMessage, contextId) => {
    const service = serviceRef.current;
    if (!service?.completeHandshake) {
      logger.warn('[ble-relay-hook] completeHandshake unavailable');
      setError('Handshake service unavailable');
      return null;
    }
    try {
      return await service.completeHandshake(peerId, responseMessage, contextId);
    } catch (handshakeError) {
      logger.error('[ble-relay-hook] completeHandshake failed:', handshakeError);
      setError(handshakeError.message || 'Handshake completion failed');
      throw handshakeError;
    }
  }, [logger]);

  const cancelHandshake = useCallback((contextId, reason) => {
    const service = serviceRef.current;
    if (!service?.cancelHandshake) {
      logger.warn('[ble-relay-hook] cancelHandshake unavailable');
      return false;
    }
    return service.cancelHandshake(contextId, reason);
  }, [logger]);

  // Load wallet on hook mount
  useEffect(() => {
    logger.info('[ble-relay-hook] Loading wallet...');
    fetchWallet()
      .then(walletData => {
        logger.info('[ble-relay-hook] Wallet loaded:', { hasWallet: !!walletData, address: walletData?.address?.slice(0, 10) });
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
    logger.info('[ble-relay-hook] Wallet effect triggered', { hasWallet: !!wallet });
    if (!wallet) {
      return;
    }

    initializeService();

    const service = serviceRef.current;
    if (service?.updateWalletCredentials) {
      service.updateWalletCredentials({
        walletAddress: wallet.address,
        walletPrivateKey: wallet.privateKey,
      });
    }
  }, [wallet, initializeService]);

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
        subscriptionsRef.current.forEach(({ event, handler }) => {
          service.unsubscribe(event, handler);
        });
        subscriptionsRef.current = [];
        setIsScanning(false);
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
    selectedRelayer,
    isScanning,
    handshakeContexts,
    handshakeErrors,
    sessions,
    startScanning,
    stopScanning,
    initiateHandshake,
    processIncomingHandshake,
    completeHandshake,
    cancelHandshake,
    service: serviceRef.current,
  };
}
