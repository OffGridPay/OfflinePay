import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

const MAX_LOG_ENTRIES = 50;

const INITIAL_STATE = {
  isConnected: false,
  isInternetReachable: null,
  connectionType: 'unknown',
  details: undefined,
  lastChangedAt: null,
  heartbeat: {
    url: null,
    status: 'idle',
    lastCheckedAt: null,
    latencyMs: null,
    error: null,
  },
};

const defaultLogger = {
  info: (...args) => console.log('[connectivity]', ...args),
  warn: (...args) => console.warn('[connectivity]', ...args),
  error: (...args) => console.error('[connectivity]', ...args),
};

function createLogEntry(type, payload = {}) {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    timestamp: Date.now(),
  };
}

export function useConnectivityMonitor(options = {}) {
  const {
    heartbeatUrl = null,
    heartbeatIntervalMs = 30000,
    logger = defaultLogger,
    autoStartHeartbeat = false,
  } = options;

  const [snapshot, setSnapshot] = useState(() => ({ ...INITIAL_STATE, heartbeat: { ...INITIAL_STATE.heartbeat, url: heartbeatUrl } }));
  const [logs, setLogs] = useState([]);

  const heartbeatTimer = useRef(null);
  const netInfoSubscription = useRef(null);
  const appState = useRef(AppState.currentState);

  const pushLog = useCallback((entry) => {
    setLogs((prev) => {
      const next = [entry, ...prev];
      if (next.length > MAX_LOG_ENTRIES) {
        next.length = MAX_LOG_ENTRIES;
      }
      return next;
    });

    if (entry.type === 'heartbeat-error') {
      logger.warn(entry);
    } else {
      logger.info(entry);
    }
  }, [logger]);

  const updateSnapshotFromNetInfo = useCallback((state) => {
    setSnapshot((prev) => ({
      ...prev,
      isConnected: Boolean(state.isConnected),
      isInternetReachable: typeof state.isInternetReachable === 'boolean' ? state.isInternetReachable : prev.isInternetReachable,
      connectionType: state.type,
      details: state.details,
      lastChangedAt: Date.now(),
    }));

    pushLog(createLogEntry('netinfo-change', {
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
    }));
  }, [pushLog]);

  const runHeartbeat = useCallback(async () => {
    if (!heartbeatUrl) {
      return;
    }

    const startedAt = Date.now();
    setSnapshot((prev) => ({
      ...prev,
      heartbeat: {
        ...prev.heartbeat,
        url: heartbeatUrl,
        status: 'pending',
        lastCheckedAt: startedAt,
        error: null,
      },
    }));

    pushLog(createLogEntry('heartbeat-started', { url: heartbeatUrl }));

    try {
      const response = await fetch(heartbeatUrl, { method: 'HEAD' });
      const latency = Date.now() - startedAt;

      setSnapshot((prev) => ({
        ...prev,
        isInternetReachable: response.ok ? true : prev.isInternetReachable,
        heartbeat: {
          ...prev.heartbeat,
          status: response.ok ? 'ok' : 'error',
          lastCheckedAt: Date.now(),
          latencyMs: latency,
          error: response.ok ? null : `HTTP_${response.status}`,
        },
      }));

      pushLog(createLogEntry('heartbeat-finished', {
        status: response.ok ? 'ok' : 'error',
        latencyMs: latency,
        httpStatus: response.status,
      }));
    } catch (error) {
      const latency = Date.now() - startedAt;

      setSnapshot((prev) => ({
        ...prev,
        heartbeat: {
          ...prev.heartbeat,
          status: 'error',
          lastCheckedAt: Date.now(),
          latencyMs: latency,
          error: error?.message || 'unknown-error',
        },
      }));

      pushLog(createLogEntry('heartbeat-error', {
        message: error?.message,
        latencyMs: latency,
      }));
    }
  }, [heartbeatUrl, pushLog]);

  const startHeartbeat = useCallback(() => {
    if (!heartbeatUrl || heartbeatTimer.current) {
      return;
    }

    runHeartbeat();
    heartbeatTimer.current = setInterval(() => {
      runHeartbeat();
    }, heartbeatIntervalMs);

    pushLog(createLogEntry('heartbeat-scheduled', {
      url: heartbeatUrl,
      intervalMs: heartbeatIntervalMs,
    }));
  }, [heartbeatIntervalMs, heartbeatUrl, pushLog, runHeartbeat]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
      pushLog(createLogEntry('heartbeat-stopped'));
    }
  }, [pushLog]);

  useEffect(() => {
    netInfoSubscription.current = NetInfo.addEventListener(updateSnapshotFromNetInfo);

    NetInfo.fetch().then(updateSnapshotFromNetInfo).catch((error) => {
      pushLog(createLogEntry('netinfo-error', { message: error?.message }));
    });

    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      const previous = appState.current;
      appState.current = nextAppState;
      pushLog(createLogEntry('appstate-change', { previous, next: nextAppState }));

      if (previous.match(/inactive|background/) && nextAppState === 'active' && heartbeatUrl) {
        runHeartbeat();
      }
    });

    return () => {
      appStateSubscription.remove();
      if (netInfoSubscription.current) {
        netInfoSubscription.current();
      }
      stopHeartbeat();
    };
  }, [heartbeatUrl, pushLog, runHeartbeat, stopHeartbeat, updateSnapshotFromNetInfo]);

  useEffect(() => {
    if (autoStartHeartbeat && heartbeatUrl) {
      startHeartbeat();
    }

    return () => {
      stopHeartbeat();
    };
  }, [autoStartHeartbeat, heartbeatUrl, startHeartbeat, stopHeartbeat]);

  const triggerHeartbeatCheck = useCallback(() => {
    if (!heartbeatUrl) {
      pushLog(createLogEntry('heartbeat-skip', { reason: 'no-url-configured' }));
      return;
    }
    runHeartbeat();
  }, [heartbeatUrl, pushLog, runHeartbeat]);

  return useMemo(() => ({
    isConnected: snapshot.isConnected,
    isInternetReachable: snapshot.isInternetReachable,
    connectionType: snapshot.connectionType,
    lastChangedAt: snapshot.lastChangedAt,
    heartbeat: snapshot.heartbeat,
    logs,
    triggerHeartbeatCheck,
    startHeartbeat,
    stopHeartbeat,
  }), [logs, snapshot, startHeartbeat, stopHeartbeat, triggerHeartbeatCheck]);
}

export default useConnectivityMonitor;

