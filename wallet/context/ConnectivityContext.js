import { createContext, useContext } from 'react';

const defaultValue = {
  isConnected: false,
  isInternetReachable: null,
  connectionType: 'unknown',
  lastChangedAt: null,
  heartbeat: {
    url: null,
    status: 'idle',
    lastCheckedAt: null,
    latencyMs: null,
    error: null,
  },
  logs: [],
  triggerHeartbeatCheck: () => {},
  startHeartbeat: () => {},
  stopHeartbeat: () => {},
};

const ConnectivityContext = createContext(defaultValue);

export function useConnectivity() {
  return useContext(ConnectivityContext);
}

export default ConnectivityContext;

