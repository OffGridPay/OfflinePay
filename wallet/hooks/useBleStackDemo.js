import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

let BlePlx;
try {
  // eslint-disable-next-line global-require
  BlePlx = require('react-native-ble-plx');
} catch (error) {
  BlePlx = null;
}

const BleManager = BlePlx?.BleManager || null;
const DEFAULT_OPTIONS = {
  autoStart: false,
  scanFilters: null,
  maxDevices: 25,
  logger: console,
};

function mapDevice(device) {
  if (!device) {
    return null;
  }

  return {
    id: device.id,
    name: device.name || 'Unknown',
    manufacturerData: device.manufacturerData,
    serviceUUIDs: device.serviceUUIDs,
    rssi: device.rssi,
    mtu: device.mtu,
    isConnectable: device.isConnectable,
    localName: device.localName,
    serviceData: device.serviceData,
  };
}

const INITIAL_SUPPORT = BleManager
  ? { supported: true, reason: null, message: null }
  : { supported: false, reason: 'missing-js-module', message: 'react-native-ble-plx JS module unavailable' };

export default function useBleStackDemo(options = {}) {
  const { autoStart, scanFilters, maxDevices, logger } = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...options }),
    [options]
  );

  const managerRef = useRef(null);
  const scanStartedAt = useRef(null);
  const stateSubscriptionRef = useRef(null);
  const [supportInfo, setSupportInfo] = useState(INITIAL_SUPPORT);
  const [status, setStatus] = useState(() => (INITIAL_SUPPORT.supported ? 'idle' : 'unsupported'));
  const [adapterState, setAdapterState] = useState('unknown');
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);

  const isSupported = supportInfo.supported;

  const stopScan = useCallback(() => {
    if (!managerRef.current) {
      return;
    }

    try {
      managerRef.current.stopDeviceScan();
      logger.info('[ble-demo] stop scan');
    } catch (stopError) {
      logger.warn('[ble-demo] failed to stop scan', stopError?.message);
    }

    scanStartedAt.current = null;
    setStatus('idle');
  }, [logger]);

  const startScan = useCallback(() => {
    if (!isSupported) {
      setError('ble-not-supported');
      setStatus('unsupported');
      logger.warn('[ble-demo] BLE not supported on this runtime');
      return;
    }

    if (!managerRef.current) {
      setError('ble-manager-uninitialized');
      logger.warn('[ble-demo] manager not initialized yet');
      return;
    }

    try {
      setError(null);
      setDevices([]);
      setStatus('scanning');
      scanStartedAt.current = Date.now();
      logger.info('[ble-demo] start scan', { filters: scanFilters });

      managerRef.current.startDeviceScan(null, scanFilters || null, (scanError, device) => {
        if (scanError) {
          logger.error('[ble-demo] scan error', scanError);
          setError(scanError.message || 'scan-error');
          stopScan();
          return;
        }

        const mapped = mapDevice(device);
        if (!mapped) {
          return;
        }

        setDevices((prev) => {
          const exists = prev.find((d) => d.id === mapped.id);
          if (exists) {
            return prev.map((d) => (d.id === mapped.id ? { ...d, ...mapped } : d));
          }

          const next = [mapped, ...prev];
          if (next.length > maxDevices) {
            next.length = maxDevices;
          }
          return next;
        });
      });
    } catch (scanError) {
      logger.error('[ble-demo] start scan failed', scanError);
      setError(scanError.message || 'start-scan-error');
      setStatus('idle');
    }
  }, [isSupported, logger, maxDevices, scanFilters, stopScan]);

  const reset = useCallback(() => {
    setDevices([]);
    setError(null);
    setStatus(isSupported ? 'idle' : 'unsupported');
  }, [isSupported]);

  useEffect(() => {
    if (!BleManager) {
      logger.warn('[ble-demo] BLE libraries missing from bundle');
      setSupportInfo({ supported: false, reason: 'missing-js-module', message: 'react-native-ble-plx not installed or not linked' });
      return () => {};
    }

    let manager;
    try {
      manager = new BleManager({ restoreStateIdentifier: 'OfflinePayBleDemo', restoreStateFunction: null });
      setSupportInfo({ supported: true, reason: null, message: null });
    } catch (managerError) {
      logger.warn('[ble-demo] failed to instantiate BleManager. Native module unavailable?', managerError);
      setSupportInfo({
        supported: false,
        reason: 'native-module-unavailable',
        message: 'BLE native module missing (Expo Go or unlinked build). Build a development client / bare workflow to use scanning.',
      });
      setStatus('unsupported');
      setError('native-module-unavailable');
      return () => {};
    }

    managerRef.current = manager;
    logger.info('[ble-demo] manager created', { platform: Platform.OS });

    stateSubscriptionRef.current = manager.onStateChange((newState) => {
      logger.info('[ble-demo] adapter state changed', newState);
      setAdapterState(newState);
    }, true);

    return () => {
      stopScan();
      if (stateSubscriptionRef.current) {
        stateSubscriptionRef.current.remove();
      }
      if (manager) {
        manager.destroy();
      }
      managerRef.current = null;
      logger.info('[ble-demo] manager destroyed');
    };
  }, [logger, stopScan]);

  useEffect(() => {
    if (autoStart) {
      startScan();
    }
  }, [autoStart, startScan]);

  return {
    isSupported,
    status,
    adapterState,
    error,
    devices,
    scanStartedAt: scanStartedAt.current,
    startScan,
    stopScan,
    reset,
    supportInfo,
  };
}

export { useBleStackDemo };

