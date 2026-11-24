import {
  buildRoomMessagesApiUrl,
  buildUserProfileApiUrl,
  buildRoomJoinApiUrl,
  buildRoomLeaveApiUrl,
  buildNearbyRoomsApiUrl,
} from '../config/env';
import { isValidJwt } from '../utils/messageUtils';

/**
 * Chat API Service
 * Handles authenticated HTTP requests to the Django REST Framework backend.
 */

/**
 * Fetches message history for a specified room.
 * Safely parses both plain array `[...]` and paginated `{ results: [...] }` formats.
 * Supports request cancellation via AbortSignal.
 *
 * @param {object} options
 * @param {string|number} options.roomId - ID of the chat room
 * @param {string} options.token - JWT Access Token
 * @param {AbortSignal} [options.signal] - Abort signal for cancellation
 * @param {number} [options.pageSize=100] - Number of messages to retrieve per page
 * @returns {Promise<Array<object>>} Raw array of message objects from backend
 */
export async function fetchRoomMessages({ roomId, token, signal, pageSize = 100 }) {
  if (!roomId) {
    throw new Error('Room ID is required to fetch chat history.');
  }
  if (!token || !isValidJwt(token.trim())) {
    throw new Error('A valid JWT Access Token (starting with eyJ...) is required to fetch chat history.');
  }

  const url = buildRoomMessagesApiUrl(roomId, pageSize);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    let errorDetail = `Failed to fetch message history (HTTP ${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.detail) {
        errorDetail = errJson.detail;
      } else if (errJson.message) {
        errorDetail = errJson.message;
      }
    } catch {
      // response body was not JSON
    }
    const err = new Error(errorDetail);
    err.status = response.status;
    throw err;
  }

  const payload = await response.json();

  // Handle both plain array `[...]` and paginated `{ results: [...] }`
  if (Array.isArray(payload)) {
    return payload;
  } else if (payload && Array.isArray(payload.results)) {
    return payload.results;
  }

  return [];
}

/**
 * Fetches the authenticated user profile.
 * Used to identify the current user's handle/id for own-message styling.
 *
 * @param {string} token - JWT Access Token
 * @param {AbortSignal} [signal] - Optional AbortSignal
 * @returns {Promise<{ id: number, handle: string, email: string } | null>}
 */
export async function fetchUserProfile(token, signal) {
  if (!token || !isValidJwt(token.trim())) return null;

  try {
    const url = buildUserProfileApiUrl();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Joins a chat room by creating/activating RoomMembership.
 * Sends POST /api/chats/rooms/<roomId>/join/
 *
 * @param {object} options
 * @param {string|number} options.roomId - ID of the chat room to join
 * @param {string} options.token - JWT Access Token
 * @param {number} [options.lat] - Optional user latitude
 * @param {number} [options.lng] - Optional user longitude
 * @returns {Promise<object>} Response data from server (membership details)
 */
export async function joinRoom({ roomId, token, lat, lng }) {
  if (!roomId) {
    throw new Error('Room ID is required to join room.');
  }
  if (!token || !isValidJwt(token.trim())) {
    throw new Error('A valid JWT Access Token (starting with eyJ...) is required to join room.');
  }

  const url = buildRoomJoinApiUrl(roomId);
  const body = (lat != null && lng != null) ? { lat, lng } : {};

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorDetail = `Failed to join room (HTTP ${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.detail) {
        errorDetail = errJson.detail;
      } else if (errJson.message) {
        errorDetail = errJson.message;
      }
    } catch {
      // response body was not JSON
    }
    const err = new Error(errorDetail);
    err.status = response.status;
    throw err;
  }

  return await response.json();
}

/**
 * Fetches active chat rooms within a specified radius (default 30 km) of the user's location.
 *
 * @param {object} options
 * @param {string} options.token - JWT Access Token
 * @param {number|string} options.lat - User latitude
 * @param {number|string} options.lng - User longitude
 * @param {number|string} [options.radius=30] - Radius in km
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array<object>>} List of nearby rooms with distance_km and is_member
 */
export async function fetchNearbyRooms({ token, lat, lng, radius = 30, signal }) {
  if (!token || !isValidJwt(token.trim())) {
    throw new Error('A valid JWT Access Token is required to discover nearby rooms.');
  }
  if (lat == null || lng == null) {
    throw new Error('Latitude and Longitude are required to find nearby rooms.');
  }

  const url = buildNearbyRoomsApiUrl(lat, lng, radius);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    let errorDetail = `Failed to fetch nearby rooms (HTTP ${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {}
    const err = new Error(errorDetail);
    err.status = response.status;
    throw err;
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : (payload.results || []);
}

/**
 * Leaves a chat room by deactivating RoomMembership.
 * Sends POST /api/chats/rooms/<roomId>/leave/
 *
 * @param {object} options
 * @param {string|number} options.roomId - ID of room to leave
 * @param {string} options.token - JWT Access Token
 * @returns {Promise<object>} Response message from server
 */
export async function leaveRoom({ roomId, token }) {
  if (!roomId) throw new Error('Room ID is required to leave room.');
  if (!token || !isValidJwt(token.trim())) {
    throw new Error('A valid JWT Access Token is required to leave room.');
  }

  const url = buildRoomLeaveApiUrl(roomId);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    let errorDetail = `Failed to leave room (HTTP ${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch {}
    const err = new Error(errorDetail);
    err.status = response.status;
    throw err;
  }

  return await response.json();
}
