/**
 * Utilities for message normalization, deduplication, and chronological ordering.
 */

/**
 * Safely decodes a JWT token without external dependencies.
 * Extracts the JSON payload if valid, or returns null.
 *
 * @param {string} token
 * @returns {object | null} Decoded token payload
 */
export function parseJwt(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.trim().split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Checks whether a value is a valid JSON Web Token string.
 * Specifically rejects URLs, origins, or non-JWT strings.
 * Standard JWT format: 3 dot-separated Base64URL-encoded segments.
 *
 * @param {any} token
 * @returns {boolean}
 */
export function isValidJwt(token) {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();

  // Explicitly reject URLs, origins, or web paths
  if (
    /^(https?|wss?|ftp):\/\//i.test(trimmed) ||
    trimmed.startsWith('//') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('localhost') ||
    trimmed.includes('127.0.0.1')
  ) {
    return false;
  }

  // Must have exactly 3 dot-separated segments (header.payload.signature)
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return false;
  }

  // Each segment must be non-empty base64url characters
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  if (!parts.every((part) => part.length > 0 && base64UrlRegex.test(part))) {
    return false;
  }

  // SimpleJWT access tokens always have an encoded JSON header (starts with 'eyJ')
  if (!trimmed.startsWith('eyJ')) {
    return false;
  }

  // Ensure payload can be decoded as JSON
  try {
    const payload = parseJwt(trimmed);
    return Boolean(payload && typeof payload === 'object');
  } catch {
    return false;
  }
}

/**
 * Returns a sanitized JWT token, or empty string if invalid or a URL.
 *
 * @param {any} token
 * @returns {string}
 */
export function sanitizeToken(token) {
  if (typeof token !== 'string') return '';
  const trimmed = token.trim();
  return isValidJwt(trimmed) ? trimmed : '';
}

/**
 * Safely extracts and validates a JWT access token from an auth payload or string.
 * Rejects URLs, origins, objects, or malformed strings.
 *
 * @param {any} payload - Response object (e.g. { access, refresh }) or token string
 * @returns {string} Validated JWT access token, or empty string
 */
export function extractAccessToken(payload) {
  if (typeof payload === 'string') {
    return sanitizeToken(payload);
  }
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const candidate =
    payload.access ??
    payload.access_token ??
    payload.token ??
    payload.tokens?.access ??
    '';
  return sanitizeToken(candidate);
}

/**
 * Normalizes a message payload from either REST API or WebSocket consumer
 * into a single canonical UI representation.
 *
 * @param {object} rawMsg - Message object from REST or WebSocket
 * @param {object} [currentUser] - Optional current user profile { id, handle }
 * @returns {object | null} Normalized message
 */
export function normalizeMessage(rawMsg, currentUser = null) {
  if (!rawMsg || typeof rawMsg !== 'object') {
    return null;
  }

  // Canonical ID (null if pending/optimistic)
  const id = rawMsg.id != null ? rawMsg.id : null;

  // Room ID
  const room = (
    rawMsg.room != null
      ? Number(rawMsg.room)
      : rawMsg.room_id != null
      ? Number(rawMsg.room_id)
      : null
  );

  // Sender handle extraction
  let sender_handle = 'Anonymous';
  if (typeof rawMsg.sender_handle === 'string' && rawMsg.sender_handle.trim()) {
    sender_handle = rawMsg.sender_handle.trim();
  } else if (typeof rawMsg.sender_username === 'string' && rawMsg.sender_username.trim()) {
    sender_handle = rawMsg.sender_username.trim();
  } else if (typeof rawMsg.sender === 'string' && rawMsg.sender.trim()) {
    sender_handle = rawMsg.sender.trim();
  } else if (rawMsg.sender && typeof rawMsg.sender === 'object') {
    sender_handle = rawMsg.sender.handle || rawMsg.sender.username || 'Anonymous';
  } else if (typeof rawMsg.user === 'string' && rawMsg.user.trim()) {
    sender_handle = rawMsg.user.trim();
  } else if (rawMsg.user && typeof rawMsg.user === 'object') {
    sender_handle = rawMsg.user.handle || rawMsg.user.username || 'Anonymous';
  }

  // Content extraction
  const content = (
    rawMsg.content != null
      ? String(rawMsg.content)
      : rawMsg.message != null
      ? String(rawMsg.message)
      : rawMsg.body != null
      ? String(rawMsg.body)
      : ''
  );

  // Timestamp extraction (ISO string)
  let created_at = rawMsg.created_at || rawMsg.timestamp;
  if (!created_at) {
    created_at = new Date().toISOString();
  }

  // Check if own message
  let is_own = Boolean(rawMsg.is_own);
  if (currentUser) {
    if (currentUser.handle && sender_handle) {
      if (currentUser.handle.toLowerCase() === sender_handle.toLowerCase()) {
        is_own = true;
      }
    }
    const senderId = (
      rawMsg.sender_id ||
      (typeof rawMsg.sender === 'number' ? rawMsg.sender : null) ||
      (typeof rawMsg.user === 'number' ? rawMsg.user : null)
    );
    if (senderId != null && currentUser.id != null && Number(senderId) === Number(currentUser.id)) {
      is_own = true;
    }
  }

  return {
    id,
    room,
    sender_handle,
    content,
    created_at,
    is_own,
    is_pending: Boolean(rawMsg.is_pending),
  };
}

/**
 * Returns a canonical identifier key for deduplication.
 * Uses `id:<ID>` if server ID is present, otherwise fallback composite key `${sender}-${content}-${timestamp}`.
 *
 * @param {object} msg
 * @returns {string}
 */
export function getMessageKey(msg) {
  if (!msg) return '';
  if (msg.id != null && !String(msg.id).startsWith('pending-')) {
    return `id:${String(msg.id)}`;
  }
  const sender = msg.sender_handle || '';
  const content = msg.content || '';
  const timestamp = msg.created_at || '';
  return `comp:${sender}-${content}-${timestamp}`;
}

/**
 * Deterministically sorts messages in chronological order (oldest first, newest last).
 * Primary sort: `created_at` timestamp ascending.
 * Secondary sort: canonical `id` ascending.
 *
 * @param {Array<object>} messages
 * @returns {Array<object>}
 */
export function sortMessagesChronologically(messages) {
  return [...messages].sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) {
      return timeA - timeB;
    }
    const idA = Number(a.id) || 0;
    const idB = Number(b.id) || 0;
    return idA - idB;
  });
}

/**
 * Deterministically merges existing and incoming messages without duplicates.
 *
 * 1. Matches duplicates primarily by canonical message `id` (`String(msg.id)`).
 * 2. Reconciles/replaces pending/optimistic messages when confirmed messages arrive.
 * 3. Falls back to composite key `${sender}-${content}-${timestamp}` when server ID is absent.
 * 4. Preserves chronological order (oldest to newest) even when live WebSocket messages
 *    arrive while HTTP history fetch is in flight.
 *
 * @param {Array<object>} existingList - Current messages in state
 * @param {Array<object> | object} incoming - Incoming message(s) from HTTP history or WebSocket
 * @param {object} [currentUser] - Optional current user profile for own-message normalization
 * @returns {Array<object>} Deduplicated, chronologically sorted message array
 */
export function mergeMessages(existingList = [], incoming = [], currentUser = null) {
  const incomingArray = Array.isArray(incoming) ? incoming : [incoming];
  if (!incomingArray.length) {
    return existingList;
  }

  const mergedMap = new Map();
  const pendingCompositeToKey = new Map();

  const addOrUpdate = (rawMsg) => {
    const msg = normalizeMessage(rawMsg, currentUser);
    if (!msg) return;

    const hasCanonicalId = msg.id != null && !String(msg.id).startsWith('pending-');
    const canonicalKey = hasCanonicalId ? `id:${String(msg.id)}` : null;
    const compositeKey = `comp:${msg.sender_handle}-${msg.content}-${msg.created_at}`;

    if (hasCanonicalId) {
      // Reconcile matching pending/optimistic messages
      if (pendingCompositeToKey.has(compositeKey)) {
        const oldPendingKey = pendingCompositeToKey.get(compositeKey);
        mergedMap.delete(oldPendingKey);
        pendingCompositeToKey.delete(compositeKey);
      }

      // Also reconcile pending messages with same sender and content within a 15-second window
      for (const [key, existing] of mergedMap.entries()) {
        if (existing.is_pending || String(existing.id).startsWith('pending-') || existing.id == null) {
          if (existing.sender_handle === msg.sender_handle && existing.content === msg.content) {
            const timeDiff = Math.abs(
              new Date(existing.created_at).getTime() - new Date(msg.created_at).getTime()
            );
            if (isNaN(timeDiff) || timeDiff < 15000) {
              mergedMap.delete(key);
              break;
            }
          }
        }
      }

      mergedMap.set(canonicalKey, msg);
    } else {
      const key = canonicalKey || compositeKey;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, msg);
        pendingCompositeToKey.set(compositeKey, key);
      }
    }
  };

  // Process existing messages first
  for (const msg of existingList) {
    addOrUpdate(msg);
  }

  // Merge incoming messages
  for (const msg of incomingArray) {
    addOrUpdate(msg);
  }

  return sortMessagesChronologically(Array.from(mergedMap.values()));
}
