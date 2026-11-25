import {
  buildRoomMessagesApiUrl,
  buildUserProfileApiUrl,
  buildRoomJoinApiUrl,
  buildRoomLeaveApiUrl,
  buildNearbyRoomsApiUrl,
  buildRoomsListApiUrl,
  buildRoomDetailApiUrl,
  buildLoginApiUrl,
  buildRegisterApiUrl,
  buildJoinedRoomsApiUrl,
} from '../config/env';
import { isValidJwt, extractAccessToken, sanitizeToken } from '../utils/messageUtils';

/**
 * Chat API Service
 * Handles authenticated HTTP requests to the Django REST Framework backend.
 */

/**
 * Extracts a structured Error with HTTP status and parsed JSON payload from a failed Response.
 * Supports DRF detail, non_field_errors, and field-level validation arrays.
 *
 * @param {Response} response
 * @param {string} fallbackMessage
 * @returns {Promise<Error>}
 */
async function parseApiError(response, fallbackMessage) {
  let errorDetail = `${fallbackMessage} (HTTP ${response.status})`;
  let errData = null;
  let fieldErrors = null;
  try {
    errData = await response.json();
    if (errData?.detail) {
      errorDetail = String(errData.detail);
    } else if (errData?.message) {
      errorDetail = String(errData.message);
    } else if (errData && typeof errData === 'object') {
      const messages = [];
      fieldErrors = {};
      for (const [key, val] of Object.entries(errData)) {
        const text = Array.isArray(val) ? val.join(' ') : String(val);
        fieldErrors[key] = text;
        if (key === 'non_field_errors') {
          messages.push(text);
        } else {
          const label = key.replace(/_/g, ' ');
          messages.push(`${label}: ${text}`);
        }
      }
      if (messages.length > 0) {
        errorDetail = messages.join(' • ');
      }
    }
  } catch {
    // response body was not JSON
  }
  const err = new Error(errorDetail);
  err.status = response.status;
  err.data = errData;
  if (fieldErrors && Object.keys(fieldErrors).length > 0) {
    err.fieldErrors = fieldErrors;
  }
  return err;
}

/**
 * Validates that a token is a valid JWT and returns its trimmed value.
 *
 * @param {string} token
 * @param {string} actionLabel
 * @returns {string}
 */
function requireValidToken(token, actionLabel) {
  const clean = typeof token === 'string' ? token.trim() : '';
  if (!clean || !isValidJwt(clean)) {
    throw new Error(`A valid JWT Access Token (starting with eyJ...) is required to ${actionLabel}.`);
  }
  return clean;
}

/**
 * Parses optional coordinate pair; returns `{ lat, lng }` if both are finite numbers, or `null` if omitted.
 * Throws if only one coordinate is provided or if values are non-numeric.
 */
function normalizeOptionalCoords(lat, lng) {
  const hasLat = lat != null && String(lat).trim() !== '';
  const hasLng = lng != null && String(lng).trim() !== '';
  if (!hasLat && !hasLng) return null;
  if (hasLat !== hasLng) {
    const err = new Error('Both latitude and longitude are required together.');
    err.status = 400;
    throw err;
  }
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
    const err = new Error('Latitude and longitude must be valid numbers.');
    err.status = 400;
    throw err;
  }
  return { lat: numLat, lng: numLng };
}

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
  const cleanToken = requireValidToken(token, 'fetch chat history');
  const url = buildRoomMessagesApiUrl(roomId, pageSize);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to fetch message history');
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
 * Lists active chat rooms, optionally filtered by coordinates and radius.
 *
 * @param {object} options
 * @param {string} options.token - JWT Access Token
 * @param {number|string} [options.lat] - Optional latitude
 * @param {number|string} [options.lng] - Optional longitude
 * @param {number|string} [options.radius=30] - Optional radius in km
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array<object>>}
 */
export async function fetchRooms({ token, lat, lng, radius = 30, signal } = {}) {
  const cleanToken = requireValidToken(token, 'list chat rooms');
  const coords = normalizeOptionalCoords(lat, lng);
  const url = coords
    ? buildRoomsListApiUrl({ lat: coords.lat, lng: coords.lng, radius })
    : buildRoomsListApiUrl();

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to fetch chat rooms');
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : (payload.results || []);
}

/**
 * Fetches active chat rooms that the authenticated user has already joined.
 * Sends GET /api/chats/rooms/joined/
 *
 * @param {object} options
 * @param {string} options.token - JWT Access Token
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array<object>>}
 */
export async function fetchJoinedRooms({ token, signal } = {}) {
  const cleanToken = requireValidToken(token, 'load joined rooms');
  const url = buildJoinedRoomsApiUrl();

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to fetch joined rooms');
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : (payload.results || []);
}

/**
 * Fetches details for a single active chat room.
 *
 * @param {object} options
 * @param {string|number} options.roomId
 * @param {string} options.token
 * @param {number|string} [options.lat]
 * @param {number|string} [options.lng]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>}
 */
export async function fetchRoomDetail({ roomId, token, lat, lng, signal }) {
  if (!roomId) {
    throw new Error('Room ID is required.');
  }
  const cleanToken = requireValidToken(token, 'fetch room details');
  const coords = normalizeOptionalCoords(lat, lng);
  const url = buildRoomDetailApiUrl(roomId, coords || {});

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to fetch room details');
  }

  return await response.json();
}

/**
 * Joins a chat room by creating/activating RoomMembership.
 * Sends POST /api/chats/rooms/<roomId>/join/
 *
 * @param {object} options
 * @param {string|number} options.roomId - ID of the chat room to join
 * @param {string} options.token - JWT Access Token
 * @param {number|string} [options.lat] - Optional user latitude
 * @param {number|string} [options.lng] - Optional user longitude
 * @returns {Promise<object>} Response data from server (membership details)
 */
export async function joinRoom({ roomId, token, lat, lng }) {
  if (!roomId) {
    throw new Error('Room ID is required to join room.');
  }
  const cleanToken = requireValidToken(token, 'join room');
  const coords = normalizeOptionalCoords(lat, lng);

  const url = buildRoomJoinApiUrl(roomId);
  const body = coords ? { lat: coords.lat, lng: coords.lng } : {};

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to join room');
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
  const cleanToken = requireValidToken(token, 'discover nearby rooms');
  const coords = normalizeOptionalCoords(lat, lng);
  if (!coords) {
    throw new Error('Latitude and Longitude are required to find nearby rooms.');
  }

  const url = buildNearbyRoomsApiUrl(coords.lat, coords.lng, radius);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to fetch nearby rooms');
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
  const cleanToken = requireValidToken(token, 'leave room');

  const url = buildRoomLeaveApiUrl(roomId);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to leave room');
  }

  return await response.json();
}

/**
 * Authenticates an existing user via SimpleJWT (`POST /api/token/`).
 * Expects `{ email, password }` and validates the returned JWT `access` token.
 *
 * @param {object} options
 * @param {string} options.email - User email address
 * @param {string} options.password - User password
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ access: string, refresh: string, raw: object }>}
 */
export async function loginUser({ email, password, signal }) {
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  if (!cleanEmail) {
    throw new Error('Email address is required to sign in.');
  }
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required to sign in.');
  }

  let response;
  try {
    response = await fetch(buildLoginApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email: cleanEmail, password }),
      signal,
    });
  } catch (networkErr) {
    if (networkErr.name === 'AbortError') throw networkErr;
    throw new Error('Unable to reach authentication server. Please verify the backend is running.');
  }

  if (!response.ok) {
    throw await parseApiError(response, 'Sign in failed');
  }

  const data = await response.json();
  const access = extractAccessToken(data);
  if (!access) {
    throw new Error('Server response did not contain a valid JWT access token.');
  }

  return {
    access,
    refresh: sanitizeToken(data?.refresh),
    raw: data,
  };
}

/**
 * Registers a new GeoChat user (`POST /api/accounts/register/`).
 * Expects `{ email, mobile_number, password }`.
 * Handles both direct-token responses and standard 201 user-only responses.
 *
 * @param {object} options
 * @param {string} options.email - User email address
 * @param {string} options.mobile_number - Unique mobile number (max 15 chars)
 * @param {string} options.password - Account password
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ access: string, refresh: string, hasTokens: boolean, user: object }>}
 */
export async function registerUser({ email, mobile_number, password, signal }) {
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const cleanMobile = typeof mobile_number === 'string' ? mobile_number.trim() : '';

  if (!cleanEmail) {
    throw new Error('Email address is required to create an account.');
  }
  if (!cleanMobile) {
    throw new Error('Mobile number is required to create an account.');
  }
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required to create an account.');
  }

  let response;
  try {
    response = await fetch(buildRegisterApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: cleanEmail,
        mobile_number: cleanMobile,
        password,
      }),
      signal,
    });
  } catch (networkErr) {
    if (networkErr.name === 'AbortError') throw networkErr;
    throw new Error('Unable to reach registration server. Please verify the backend is running.');
  }

  if (!response.ok) {
    throw await parseApiError(response, 'Registration failed');
  }

  const data = await response.json();
  const access = extractAccessToken(data);
  const refresh = sanitizeToken(data?.refresh);

  return {
    access,
    refresh,
    hasTokens: Boolean(access),
    user: data,
  };
}


