const DEFAULT_RELAYER_BASE_URL = 'https://acronychous-frederick-hyperconservatively.ngrok-free.dev';

const configuredBase = process.env.EXPO_PUBLIC_RELAYER_BASE_URL || DEFAULT_RELAYER_BASE_URL;
const RELAYER_BASE_URL = configuredBase.replace(/\/$/, '');
const RELAYER_HEALTHCHECK_URL = (process.env.EXPO_PUBLIC_RELAYER_HEALTHCHECK_URL || `${RELAYER_BASE_URL}/health`).replace(/\/$/, '');

export { RELAYER_HEALTHCHECK_URL, RELAYER_BASE_URL };

