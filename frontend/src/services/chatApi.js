import { buildRoomMessagesApiUrl, buildUserProfileApiUrl } from '../config/env';

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
  if (!token || !token.trim()) {
    throw new Error('JWT Access Token is required to fetch chat history.');
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
  if (!token || !token.trim()) return null;

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
