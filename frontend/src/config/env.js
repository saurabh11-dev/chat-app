/**
 * Centralized application environment configuration.
 * Normalizes HTTP and WebSocket base URLs with sensible local defaults.
 */

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

export const WS_BASE_URL = (
  import.meta.env.VITE_WS_BASE_URL || 'ws://127.0.0.1:8000'
).replace(/\/+$/, '');

/**
 * Helper to construct the WebSocket endpoint for a chat room.
 * Format: ws://127.0.0.1:8000/ws/chats/rooms/<room_id>/?token=<JWT_ACCESS_TOKEN>
 *
 * @param {string|number} roomId - ID of the target chat room
 * @param {string} token - JWT access token
 * @returns {string} Complete WebSocket connection URL
 */
export const buildRoomWebSocketUrl = (roomId, token) => {
  const base = WS_BASE_URL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  const cleanRoomId = encodeURIComponent(String(roomId).trim());
  const cleanToken = encodeURIComponent(String(token).trim());
  return `${base}/ws/chats/rooms/${cleanRoomId}/?token=${cleanToken}`;
};
