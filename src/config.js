/**
 * Base URL for the SOC API server.
 *
 * Used as the prefix for all API requests made by the frontend.
 * The SOC runs on the gpu-ajob box, reachable over the Asgard ZeroTier mesh
 * (not the public internet — ufw is mesh + fleet only).
 */
export const SERVER_BASE_URL = 'http://10.121.16.163:8095';

/**
 * Host (hostname:port) of the API server.
 *
 * Used in contexts where only the host portion is needed (e.g. WebSocket
 * connections, Host headers).  Derived from SERVER_BASE_URL in production;
 * kept here for dev convenience.
 *
 * ── Production override ──
 * Override via VITE_API_HOST or derive from VITE_API_BASE_URL at build time.
 *
 * @constant {string}
 */
export const SERVER_HOST = '10.121.16.163:8095';
