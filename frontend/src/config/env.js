/**
 * Centralized application environment configuration.
 * Normalizes HTTP and WebSocket base URLs with sensible local defaults.
 */

export const API_BASE_URL = (
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_API_BASE_URL) ||
  'http://127.0.0.1:8000'
).replace(/\/+$/, '');

export const WS_BASE_URL = (
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_WS_BASE_URL) ||
  'ws://127.0.0.1:8000'
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

/**
 * Helper to construct the REST API endpoint for fetching room message history.
 * Format: http://127.0.0.1:8000/api/chats/rooms/<room_id>/messages/?page_size=<page_size>
 *
 * @param {string|number} roomId - ID of the target chat room
 * @param {number} [pageSize=100] - Page size for pagination
 * @returns {string} Complete REST API URL
 */
export const buildRoomMessagesApiUrl = (roomId, pageSize = 100) => {
  const cleanRoomId = encodeURIComponent(String(roomId).trim());
  return `${API_BASE_URL}/api/chats/rooms/${cleanRoomId}/messages/?page_size=${pageSize}`;
};

/**
 * Helper to construct the user profile REST API endpoint.
 * Format: http://127.0.0.1:8000/api/accounts/profile/
 *
 * @returns {string} User profile endpoint URL
 */
export const buildUserProfileApiUrl = () => {
  return `${API_BASE_URL}/api/accounts/profile/`;
};

/**
 * Helper to construct the JWT login (token obtain pair) REST API endpoint.
 * Format: http://127.0.0.1:8000/api/token/
 *
 * @returns {string} Login token endpoint URL
 */
export const buildLoginApiUrl = () => {
  return `${API_BASE_URL}/api/token/`;
};

/**
 * Helper to construct the JWT refresh REST API endpoint.
 * Format: http://127.0.0.1:8000/api/token/refresh/
 *
 * @returns {string} Token refresh endpoint URL
 */
export const buildTokenRefreshApiUrl = () => {
  return `${API_BASE_URL}/api/token/refresh/`;
};

/**
 * Helper to construct the user registration REST API endpoint.
 * Format: http://127.0.0.1:8000/api/accounts/register/
 *
 * @returns {string} Registration endpoint URL
 */
export const buildRegisterApiUrl = () => {
  return `${API_BASE_URL}/api/accounts/register/`;
};

/**
 * Helper to construct the room join REST API endpoint.
 * Format: http://127.0.0.1:8000/api/chats/rooms/<room_id>/join/
 *
 * @param {string|number} roomId - ID of the target chat room
 * @returns {string} Room join endpoint URL
 */
export const buildRoomJoinApiUrl = (roomId) => {
  const cleanRoomId = encodeURIComponent(String(roomId).trim());
  return `${API_BASE_URL}/api/chats/rooms/${cleanRoomId}/join/`;
};

/**
 * Helper to construct the room leave REST API endpoint.
 * Format: http://127.0.0.1:8000/api/chats/rooms/<room_id>/leave/
 *
 * @param {string|number} roomId - ID of the target chat room
 * @returns {string} Room leave endpoint URL
 */
export const buildRoomLeaveApiUrl = (roomId) => {
  const cleanRoomId = encodeURIComponent(String(roomId).trim());
  return `${API_BASE_URL}/api/chats/rooms/${cleanRoomId}/leave/`;
};

/**
 * Helper to construct the chat rooms listing / discovery REST API endpoint.
 * When lat and lng are provided, filters rooms within radius km.
 *
 * @param {object} [options]
 * @param {number|string} [options.lat] - Latitude
 * @param {number|string} [options.lng] - Longitude
 * @param {number|string} [options.radius=30] - Radius in km
 * @returns {string} Rooms list/discovery endpoint URL
 */
export const buildRoomsListApiUrl = ({ lat, lng, radius = 30 } = {}) => {
  if (lat != null && lng != null && String(lat).trim() !== '' && String(lng).trim() !== '') {
    const params = new URLSearchParams({
      lat: String(lat).trim(),
      lng: String(lng).trim(),
      radius: String(radius ?? 30),
    });
    return `${API_BASE_URL}/api/chats/rooms/?${params.toString()}`;
  }
  return `${API_BASE_URL}/api/chats/rooms/`;
};

/**
 * Helper to construct the room detail REST API endpoint.
 * Format: http://127.0.0.1:8000/api/chats/rooms/<room_id>/
 *
 * @param {string|number} roomId - ID of the target chat room
 * @param {object} [options]
 * @param {number|string} [options.lat] - Optional latitude for distance calculation
 * @param {number|string} [options.lng] - Optional longitude for distance calculation
 * @returns {string} Room detail endpoint URL
 */
export const buildRoomDetailApiUrl = (roomId, { lat, lng } = {}) => {
  const cleanRoomId = encodeURIComponent(String(roomId).trim());
  if (lat != null && lng != null && String(lat).trim() !== '' && String(lng).trim() !== '') {
    const params = new URLSearchParams({
      lat: String(lat).trim(),
      lng: String(lng).trim(),
    });
    return `${API_BASE_URL}/api/chats/rooms/${cleanRoomId}/?${params.toString()}`;
  }
  return `${API_BASE_URL}/api/chats/rooms/${cleanRoomId}/`;
};

/**
 * Helper to construct the nearby chat rooms discovery REST API endpoint.
 * Format: http://127.0.0.1:8000/api/chats/rooms/?lat=<lat>&lng=<lng>&radius=<radius>
 *
 * @param {number|string} lat - Latitude
 * @param {number|string} lng - Longitude
 * @param {number|string} [radius=30] - Radius in km (defaults to 30)
 * @returns {string} Nearby rooms endpoint URL
 */
export const buildNearbyRoomsApiUrl = (lat, lng, radius = 30) => {
  return buildRoomsListApiUrl({ lat, lng, radius });
};

/**
 * Helper to construct the user's joined chat rooms REST API endpoint.
 * Format: http://127.0.0.1:8000/api/chats/rooms/joined/
 *
 * @returns {string} Joined rooms endpoint URL
 */
export const buildJoinedRoomsApiUrl = () => {
  return `${API_BASE_URL}/api/chats/rooms/joined/`;
};

/**
 * Helper to construct the room creation REST API endpoint.
 * Format: http://127.0.0.1:8000/api/chats/rooms/
 *
 * @returns {string} Room creation endpoint URL
 */
export const buildCreateRoomApiUrl = () => {
  return `${API_BASE_URL}/api/chats/rooms/`;
};

/**
 * Helper to construct the username availability REST API endpoint.
 * Format: http://127.0.0.1:8000/api/accounts/username-availability/?username=<username>
 *
 * @param {string} username - Target username to check
 * @returns {string} Username availability endpoint URL
 */
export const buildUsernameAvailabilityApiUrl = (username) => {
  const cleanUsername = encodeURIComponent(String(username ?? '').trim().replace(/^@/, ''));
  return `${API_BASE_URL}/api/accounts/username-availability/?username=${cleanUsername}`;
};



