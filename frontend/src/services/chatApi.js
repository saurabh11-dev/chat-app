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
  buildCreateRoomApiUrl,
  buildUsernameAvailabilityApiUrl,
} from '../config/env';
import { isValidJwt, extractAccessToken, sanitizeToken } from '../utils/messageUtils';
import { normalizeRoomsResponse } from '../utils/geolocation';

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
export async function fetchRooms({
  token,
  lat,
  lng,
  latitude,
  longitude,
  radius = 30,
  radius_km,
  signal,
} = {}) {
  const cleanToken = requireValidToken(token, 'list chat rooms');
  const rawLat = lat !== undefined ? lat : latitude;
  const rawLng = lng !== undefined ? lng : longitude;
  const rawRadius = radius_km !== undefined ? radius_km : radius;
  const coords = normalizeOptionalCoords(rawLat, rawLng);
  const url = coords
    ? buildRoomsListApiUrl({ lat: coords.lat, lng: coords.lng, radius: rawRadius })
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
  return normalizeRoomsResponse(payload);
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
  return normalizeRoomsResponse(payload);
}

/**
 * Creates a new geofenced chat room (`POST /api/chats/rooms/`).
 * The authenticated creator is automatically enrolled as an active member on the backend.
 *
 * @param {object} options
 * @param {string} options.token - JWT Access Token
 * @param {string} options.name - Room name (non-empty)
 * @param {string} [options.description=''] - Optional room description
 * @param {number|string} options.latitude - Center latitude (-90..90)
 * @param {number|string} options.longitude - Center longitude (-180..180)
 * @param {number|string} [options.radius=30] - Geofence radius in km (> 0 and <= 500)
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>} Serialized newly created room object (201)
 */
export async function createRoom({
  token,
  name,
  description = '',
  latitude,
  longitude,
  lat,
  lng,
  radius = 30,
  radius_km,
  signal,
}) {
  const cleanToken = requireValidToken(token, 'create a room');
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) {
    throw new Error('Room name is required.');
  }

  const rawLat = latitude !== undefined ? latitude : lat;
  const rawLng = longitude !== undefined ? longitude : lng;
  const rawRadius = radius_km !== undefined ? radius_km : radius;

  const coords = normalizeOptionalCoords(rawLat, rawLng);
  if (!coords) {
    throw new Error('Latitude and longitude coordinates are required.');
  }
  if (coords.lat < -90 || coords.lat > 90 || coords.lng < -180 || coords.lng > 180) {
    throw new Error('Coordinates must be within valid ranges (lat: -90..90, lng: -180..180).');
  }

  const radiusNum = Number(rawRadius ?? 30);
  if (!Number.isFinite(radiusNum) || radiusNum <= 0 || radiusNum > 500) {
    throw new Error('Geofence radius must be greater than 0 and at most 500 km.');
  }

  const url = buildCreateRoomApiUrl();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      name: cleanName,
      description: typeof description === 'string' ? description.trim() : '',
      latitude: Number(coords.lat.toFixed(6)),
      longitude: Number(coords.lng.toFixed(6)),
      lat: Number(coords.lat.toFixed(6)),
      lng: Number(coords.lng.toFixed(6)),
      radius_km: Number(radiusNum.toFixed(2)),
      radius: Number(radiusNum.toFixed(2)),
    }),
    signal,
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to create room');
  }

  return await response.json();
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
export async function joinRoom({ roomId, token, lat, lng, latitude, longitude }) {
  if (!roomId) {
    throw new Error('Room ID is required to join room.');
  }
  const cleanToken = requireValidToken(token, 'join room');
  const rawLat = lat !== undefined ? lat : latitude;
  const rawLng = lng !== undefined ? lng : longitude;
  const coords = normalizeOptionalCoords(rawLat, rawLng);

  const url = buildRoomJoinApiUrl(roomId);
  const body = coords
    ? {
        lat: coords.lat,
        lng: coords.lng,
        latitude: coords.lat,
        longitude: coords.lng,
      }
    : {};

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
 * @param {number|string} [options.lat] - User latitude
 * @param {number|string} [options.lng] - User longitude
 * @param {number|string} [options.latitude] - User latitude alias
 * @param {number|string} [options.longitude] - User longitude alias
 * @param {number|string} [options.radius=30] - Radius in km
 * @param {number|string} [options.radius_km] - Radius in km alias
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array<object>>} List of nearby rooms with distance_km and is_member
 */
export async function fetchNearbyRooms({
  token,
  lat,
  lng,
  latitude,
  longitude,
  radius = 30,
  radius_km,
  signal,
}) {
  const cleanToken = requireValidToken(token, 'discover nearby rooms');
  const rawLat = lat !== undefined ? lat : latitude;
  const rawLng = lng !== undefined ? lng : longitude;
  const rawRadius = radius_km !== undefined ? radius_km : radius;
  const coords = normalizeOptionalCoords(rawLat, rawLng);
  if (!coords) {
    throw new Error('Latitude and Longitude are required to find nearby rooms.');
  }

  const url = buildNearbyRoomsApiUrl(coords.lat, coords.lng, rawRadius);
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
  return normalizeRoomsResponse(payload);
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

/**
 * Checks whether a username is available via Bloom filter + DB check (`GET /api/accounts/username-availability/?username=...`).
 *
 * @param {object} options
 * @param {string} options.username - The username to check
 * @param {string} [options.token] - Optional JWT token for authenticated check
 * @param {AbortSignal} [options.signal] - Optional abort signal
 * @returns {Promise<{ available: boolean, is_current?: boolean, username: string, detail?: string, error?: string }>}
 */
export async function checkUsernameAvailability({ username, token, signal }) {
  const cleanUsername = typeof username === 'string' ? username.trim().replace(/^@/, '') : '';
  const url = buildUsernameAvailabilityApiUrl(cleanUsername);

  const headers = {
    Accept: 'application/json',
  };
  if (token && isValidJwt(token)) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal,
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to check username availability');
  }

  return await response.json();
}

/**
 * Updates the authenticated user profile (`PATCH /api/accounts/profile/`).
 * Supports updating username/handle and display name (first_name, last_name, or name).
 *
 * @param {object} options
 * @param {string} options.token - JWT Access Token
 * @param {string} [options.username] - Updated username
 * @param {string} [options.handle] - Updated handle alias
 * @param {string} [options.name] - Updated display name (split into first/last)
 * @param {string} [options.first_name] - Optional first name
 * @param {string} [options.last_name] - Optional last name
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>} Serialized updated user profile
 */
export async function updateUserProfile({
  token,
  username,
  handle,
  name,
  first_name,
  last_name,
  signal,
}) {
  const cleanToken = requireValidToken(token, 'update profile');
  const payload = {};

  const userHandle = username !== undefined ? username : handle;
  if (userHandle !== undefined) {
    payload.username = String(userHandle).trim().replace(/^@/, '');
    payload.handle = payload.username;
  }

  if (name !== undefined) {
    payload.name = String(name).trim();
  }
  if (first_name !== undefined) {
    payload.first_name = String(first_name).trim();
  }
  if (last_name !== undefined) {
    payload.last_name = String(last_name).trim();
  }

  const url = buildUserProfileApiUrl();
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to update profile');
  }

  return await response.json();
}


