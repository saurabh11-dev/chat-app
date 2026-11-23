import { buildRoomWebSocketUrl } from '../config/env';

/**
 * Standard WebSocket connection states.
 */
export const ConnectionStatus = {
  DISCONNECTED: 'Disconnected',
  CONNECTING: 'Connecting',
  CONNECTED: 'Connected',
  ERROR: 'Error',
};

/**
 * Known server-side WebSocket close codes and human-readable explanations.
 */
export const CLOSE_CODE_MESSAGES = {
  1000: 'Disconnected cleanly.',
  1001: 'Endpoint going away (server shutting down or client navigating away).',
  1006: 'Connection dropped unexpectedly. Check if the backend server is running.',
  4001: 'Unauthorized: Invalid or expired JWT access token (Code 4001).',
  4003: 'Forbidden: You are not an active member of this room or the room is inactive (Code 4003).',
};

/**
 * ChatSocket manages a single active WebSocket connection to a GeoChat room.
 * Encapsulates lifecycle handlers, message dispatching, and duplicate prevention.
 */
export class ChatSocket {
  constructor() {
    /** @type {WebSocket | null} */
    this.ws = null;
    /** @type {string} */
    this.status = ConnectionStatus.DISCONNECTED;
    /** @type {string | null} */
    this.activeRoomId = null;
    /** @type {boolean} */
    this.isManualClose = false;

    // Callbacks
    this.onStatusChange = null;
    this.onMessageReceived = null;
    this.onErrorOccurred = null;
    this.onClosed = null;
  }

  /**
   * Returns whether the socket is currently connected and ready.
   * @returns {boolean}
   */
  isConnected() {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  /**
   * Updates internal status and invokes the status change callback.
   * @param {string} newStatus
   * @param {object} [meta]
   */
  _setStatus(newStatus, meta = {}) {
    this.status = newStatus;
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(newStatus, meta);
    }
  }

  /**
   * Establishes a new WebSocket connection to the designated room.
   * If a connection is already open, it is cleanly closed first to avoid duplicates.
   *
   * @param {object} options
   * @param {string|number} options.roomId
   * @param {string} options.token
   * @param {(status: string, meta?: any) => void} [options.onStatusChange]
   * @param {(data: any) => void} [options.onMessage]
   * @param {(err: any) => void} [options.onError]
   * @param {(code: number, message: string) => void} [options.onClose]
   * @returns {WebSocket}
   */
  connect({ roomId, token, onStatusChange, onMessage, onError, onClose }) {
    if (!roomId) {
      throw new Error('Room ID is required to connect.');
    }
    if (!token || !token.trim()) {
      throw new Error('JWT Access Token is required to connect.');
    }

    // Assign event listeners
    this.onStatusChange = onStatusChange || null;
    this.onMessageReceived = onMessage || null;
    this.onErrorOccurred = onError || null;
    this.onClosed = onClose || null;

    // Prevent duplicate connections: Clean up any existing connection
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN && this.activeRoomId === String(roomId)) {
        console.warn(`[ChatSocket] Already connected to room ${roomId}. Skipping re-connect.`);
        return this.ws;
      }
      this.disconnect('Switching connection / reconnecting');
    }

    const url = buildRoomWebSocketUrl(roomId, token);
    this.activeRoomId = String(roomId);
    this.isManualClose = false;
    this._setStatus(ConnectionStatus.CONNECTING, { roomId });

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this._setStatus(ConnectionStatus.ERROR, { error: err.message });
      if (this.onErrorOccurred) {
        this.onErrorOccurred({
          code: 'CONNECTION_INIT_ERROR',
          detail: err.message || 'Failed to initialize WebSocket.',
        });
      }
      return null;
    }

    this.ws.onopen = () => {
      this._setStatus(ConnectionStatus.CONNECTED, { roomId: this.activeRoomId });
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (this.onMessageReceived) {
          this.onMessageReceived(payload);
        }
      } catch (err) {
        console.error('[ChatSocket] Failed to parse incoming WebSocket message:', event.data, err);
        if (this.onErrorOccurred) {
          this.onErrorOccurred({
            code: 'PARSE_ERROR',
            detail: 'Failed to parse incoming server message as JSON.',
          });
        }
      }
    };

    this.ws.onerror = (event) => {
      // Note: Browser WebSocket onerror events do not provide verbose reasons
      console.error('[ChatSocket] WebSocket error occurred:', event);
      this._setStatus(ConnectionStatus.ERROR, { event });
      if (this.onErrorOccurred) {
        this.onErrorOccurred({
          code: 'SOCKET_ERROR',
          detail: 'WebSocket encountered a network or protocol error.',
        });
      }
    };

    this.ws.onclose = (event) => {
      const code = event.code;
      const humanMessage =
        CLOSE_CODE_MESSAGES[code] ||
        (event.reason ? `Closed: ${event.reason} (Code ${code})` : `Connection closed with code ${code}`);

      // If closed by user or standard disconnect, mark as Disconnected.
      // If closed due to auth/permission failures or abnormal closure, flag error state.
      if (this.isManualClose || code === 1000) {
        this._setStatus(ConnectionStatus.DISCONNECTED, { code, reason: humanMessage });
      } else {
        this._setStatus(ConnectionStatus.ERROR, { code, reason: humanMessage });
      }

      if (this.onClosed) {
        this.onClosed(code, humanMessage);
      }

      this.ws = null;
    };

    return this.ws;
  }

  /**
   * Transmits a chat message payload to the server.
   * Expected format: { "content": "..." }
   *
   * @param {string} content
   * @returns {{ success: boolean, error?: string }}
   */
  sendMessage(content) {
    if (!this.isConnected()) {
      const errMsg = 'Cannot send message: WebSocket is not connected.';
      if (this.onErrorOccurred) {
        this.onErrorOccurred({ code: 'NOT_CONNECTED', detail: errMsg });
      }
      return { success: false, error: errMsg };
    }

    const trimmed = (content || '').trim();
    if (!trimmed) {
      const errMsg = 'Message content cannot be empty.';
      if (this.onErrorOccurred) {
        this.onErrorOccurred({ code: 'EMPTY_CONTENT', detail: errMsg });
      }
      return { success: false, error: errMsg };
    }

    const payload = JSON.stringify({ content: trimmed });
    this.ws.send(payload);
    return { success: true };
  }

  /**
   * Cleanly closes the active WebSocket connection.
   *
   * @param {string} [reason='User initiated disconnect']
   */
  disconnect(reason = 'User initiated disconnect') {
    this.isManualClose = true;
    if (this.ws) {
      // Disconnect cleanly if open or connecting
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        try {
          this.ws.close(1000, reason);
        } catch (e) {
          console.warn('[ChatSocket] Error closing socket:', e);
        }
      }
      this.ws = null;
    }
    this._setStatus(ConnectionStatus.DISCONNECTED);
  }
}

// Export a singleton instance for global convenience, while retaining class export
export const chatSocket = new ChatSocket();
