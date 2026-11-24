import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from './components/Navbar';
import ConnectionPanel from './components/ConnectionPanel';
import ChatPreviewBox from './components/ChatPreviewBox';
import { chatSocket, ConnectionStatus } from './services/socket';
import { fetchRoomMessages, fetchUserProfile } from './services/chatApi';
import { mergeMessages, parseJwt, normalizeMessage } from './utils/messageUtils';
import { API_BASE_URL, WS_BASE_URL } from './config/env';
import './App.css';

/**
 * GeoChat Main Application
 *
 * Coordinates WebSocket connection state, persistent room history loading,
 * deduplicated message merging, race-condition mitigation, and modular subcomponents.
 */
export function App() {
  const [connectionStatus, setConnectionStatus] = useState(ConnectionStatus.DISCONNECTED);
  const [activeRoom, setActiveRoom] = useState('1');
  const [messages, setMessages] = useState([]);
  const [errorBanner, setErrorBanner] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // References to maintain fresh values in asynchronous callbacks and event listeners
  const activeRoomRef = useRef('1');
  const activeTokenRef = useRef('');
  const currentUserRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Clean up WebSocket connection and pending fetch requests when application unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      chatSocket.disconnect('Application unmounting');
    };
  }, []);

  /**
   * Clears the current active error banner.
   */
  const handleDismissError = useCallback(() => {
    setErrorBanner(null);
  }, []);

  /**
   * Fetches room message history from REST API and merges with existing messages.
   * Cancels prior in-flight requests and guards against room-switch race conditions.
   */
  const loadRoomHistory = useCallback(async (roomId, token) => {
    if (!roomId || !token) return;

    // Abort prior in-flight request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoadingHistory(true);
    setHistoryError(null);

    try {
      const rawHistory = await fetchRoomMessages({
        roomId,
        token,
        signal: controller.signal,
      });

      // Active room guard: Check if user switched rooms while request was in-flight
      if (String(activeRoomRef.current) !== String(roomId)) {
        return;
      }

      // Merge historical messages with any live messages already received in-flight
      setMessages((prev) => mergeMessages(prev, rawHistory, currentUserRef.current));
      setHistoryError(null);
    } catch (err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        // Ignored aborted fetch
        return;
      }

      if (String(activeRoomRef.current) !== String(roomId)) {
        return;
      }

      console.error(`[GeoChat] History fetch error for room ${roomId}:`, err);
      setHistoryError({
        message: err.message || 'Failed to load room message history.',
        status: err.status,
      });
    } finally {
      if (String(activeRoomRef.current) === String(roomId) && !controller.signal.aborted) {
        setIsLoadingHistory(false);
      }
    }
  }, []);

  /**
   * Connect to specified Room ID using provided JWT Access Token.
   * Clears prior room messages immediately on room change and triggers history fetch.
   */
  const handleConnect = useCallback((roomId, token) => {
    const cleanRoomId = String(roomId).trim();
    const cleanToken = token.trim();
    const isRoomChange = cleanRoomId !== String(activeRoomRef.current);

    // Update active room and token tracking
    activeRoomRef.current = cleanRoomId;
    activeTokenRef.current = cleanToken;
    setActiveRoom(cleanRoomId);
    setErrorBanner(null);
    setHistoryError(null);

    // Room Switching: Clear previous room's messages immediately and cancel pending fetch
    if (isRoomChange) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setMessages([]);
    }

    // Resolve user profile for own-message styling
    if (!currentUserRef.current) {
      const decoded = parseJwt(cleanToken);
      if (decoded && decoded.user_id) {
        const initialUser = { id: decoded.user_id };
        setCurrentUser(initialUser);
        currentUserRef.current = initialUser;
      }
      fetchUserProfile(cleanToken)
        .then((profile) => {
          if (profile) {
            setCurrentUser(profile);
            currentUserRef.current = profile;
            // Update any existing messages with current user metadata
            setMessages((prev) => prev.map((m) => normalizeMessage(m, profile)));
          }
        })
        .catch((e) => console.warn('[GeoChat] Could not load profile:', e));
    }

    // 1. Load historical messages from REST API
    loadRoomHistory(cleanRoomId, cleanToken);

    // 2. Connect or switch WebSocket connection
    chatSocket.connect({
      roomId: cleanRoomId,
      token: cleanToken,
      onStatusChange: (status, meta) => {
        setConnectionStatus(status);
        // On reconnect, reload history to catch up on any messages missed while disconnected
        if (status === ConnectionStatus.CONNECTED && meta?.isReconnect) {
          loadRoomHistory(cleanRoomId, cleanToken);
        }
      },
      onOpen: ({ isReconnect }) => {
        if (isReconnect) {
          loadRoomHistory(cleanRoomId, cleanToken);
        }
      },
      onMessage: (payload) => {
        if (!payload || typeof payload !== 'object') return;

        // 1. Valid chat message broadcast
        if (payload.type === 'message' && payload.data) {
          const rawMsg = payload.data;
          // Guard against message arrived for previous room
          if (rawMsg.room != null && String(rawMsg.room) !== String(activeRoomRef.current)) {
            return;
          }

          // Deduplicate and merge live message with existing messages
          setMessages((prev) => mergeMessages(prev, rawMsg, currentUserRef.current));
          setErrorBanner(null);
          return;
        }

        // 2. Validation / Content moderation error (e.g. ABUSIVE_CONTENT)
        if (payload.type === 'error') {
          setErrorBanner({
            code: payload.code || 'MESSAGE_REJECTED',
            detail: payload.detail || 'An error occurred while sending message.',
          });
        }
      },
      onError: (err) => {
        setErrorBanner({
          code: err.code || 'SOCKET_ERROR',
          detail: err.detail || 'WebSocket encountered an error.',
        });
      },
      onClose: (code, humanMessage) => {
        if (code !== 1000) {
          setErrorBanner({
            code: code === 4001 ? 'UNAUTHORIZED (4001)' : code === 4003 ? 'FORBIDDEN (4003)' : `CLOSE_${code}`,
            detail: humanMessage,
          });
        }
      },
    });
  }, [loadRoomHistory]);

  /**
   * Disconnect from current room.
   */
  const handleDisconnect = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    chatSocket.disconnect('User clicked Disconnect');
    setConnectionStatus(ConnectionStatus.DISCONNECTED);
    setIsLoadingHistory(false);
    setHistoryError(null);
  }, []);

  /**
   * Retry loading room history after error.
   */
  const handleRetryLoadHistory = useCallback(() => {
    loadRoomHistory(activeRoomRef.current, activeTokenRef.current);
  }, [loadRoomHistory]);

  /**
   * Send a chat message over the open WebSocket.
   */
  const handleSendMessage = useCallback((text) => {
    // UX Rule: Automatically clear error banners when sending a new message
    setErrorBanner(null);

    const result = chatSocket.sendMessage(text);
    if (!result.success && result.error) {
      setErrorBanner({
        code: 'SEND_FAILED',
        detail: result.error,
      });
    }
  }, []);

  return (
    <div className="app-container">
      <Navbar
        status={connectionStatus}
        activeRoom={connectionStatus === ConnectionStatus.CONNECTED ? activeRoom : null}
      />

      <main className="app-main">
        <div className="app-layout">
          {/* Left Column: Connection & Information Controls */}
          <aside className="app-sidebar">
            <ConnectionPanel
              status={connectionStatus}
              activeRoom={activeRoom}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />

            {/* Contract & Debug Overview Card */}
            <section className="info-card">
              <h3 className="info-card__title">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                Backend Endpoints
              </h3>
              <dl className="info-card__list">
                <div className="info-card__item">
                  <dt>HTTP API Base</dt>
                  <dd><code>{API_BASE_URL}</code></dd>
                </div>
                <div className="info-card__item">
                  <dt>Room History GET</dt>
                  <dd><code>/api/chats/rooms/&lt;id&gt;/messages/</code></dd>
                </div>
                <div className="info-card__item">
                  <dt>WebSocket Base</dt>
                  <dd><code>{WS_BASE_URL}</code></dd>
                </div>
                <div className="info-card__item">
                  <dt>WS Path Pattern</dt>
                  <dd><code>/ws/chats/rooms/&lt;id&gt;/?token=&lt;jwt&gt;</code></dd>
                </div>
              </dl>
              <div className="info-card__notice">
                <p>
                  <strong>Features:</strong> Persistent REST chat history, live WebSocket broadcast deduplication, and room switching cleanup.
                </p>
              </div>
            </section>
          </aside>

          {/* Right Column: Live Chat Console */}
          <section className="app-content">
            <ChatPreviewBox
              messages={messages}
              errorBanner={errorBanner}
              onDismissError={handleDismissError}
              onSendMessage={handleSendMessage}
              isConnected={connectionStatus === ConnectionStatus.CONNECTED}
              activeRoom={activeRoom}
              isLoadingHistory={isLoadingHistory}
              historyError={historyError}
              onRetryLoadHistory={handleRetryLoadHistory}
              currentUser={currentUser}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
