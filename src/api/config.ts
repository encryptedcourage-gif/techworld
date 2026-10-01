/**
 * Backend connection settings.
 *
 * Set EXPO_PUBLIC_API_URL at build time to your deployed server, e.g.
 *   EXPO_PUBLIC_API_URL=https://api.yourdomain.com
 *
 * Local development notes:
 *   - Android emulator reaches your machine at 10.0.2.2, not localhost.
 *   - A physical device must use your computer's LAN IP (e.g. 192.168.1.x).
 */
const DEFAULT_API_URL = 'http://localhost:8080';

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL
).replace(/\/$/, '');

/** Derive the WebSocket URL from the API URL (http->ws, https->wss). */
export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';
