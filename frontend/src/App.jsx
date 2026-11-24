import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from './components/Navbar';
import ConnectionPanel from './components/ConnectionPanel';
import ChatPreviewBox from './components/ChatPreviewBox';
import { chatSocket, ConnectionStatus } from './services/socket';
import {
  fetchRoomMessages,
  fetchUserProfile,
  joinRoom,
  leaveRoom,
  fetchNearbyRooms,
} from './services/chatApi';
import { mergeMessages, parseJwt, normalizeMessage, isValidJwt } from './utils/messageUtils';
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
  const [activeRoomName, setActiveRoomName] = useState('Assi Ghat Hangout');
  const [messages, setMessages] = useState([]);
  const [errorBanner, setErrorBanner] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [nearbyRooms, setNearbyRooms] = useState([]);
  const [isLoadingNearbyRooms, setIsLoadingNearbyRooms] = useState(false);

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
    if (!roomId || !token || !isValidJwt(token)) return;

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
    const cleanToken = (token || '').trim();

    if (!isValidJwt(cleanToken)) {
      setErrorBanner({
        code: 'INVALID_TOKEN',
        detail: 'Invalid JWT Access Token. URLs, origins, or non-JWT strings cannot be used as tokens.',
      });
      return;
    }

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
   * Discovers active chat rooms within 30 km radius of given coordinates.
   */
  const handleDiscoverRooms = useCallback(async (lat, lng, token) => {
    const cleanToken = (token || activeTokenRef.current || '').trim();
    if (!isValidJwt(cleanToken)) {
      setErrorBanner({
        code: 'INVALID_TOKEN',
        detail: 'A valid JWT Access Token is required to discover nearby rooms.',
      });
      return;
    }

    setIsLoadingNearbyRooms(true);
    setErrorBanner(null);
    try {
      const rooms = await fetchNearbyRooms({ token: cleanToken, lat, lng, radius: 30 });
      setNearbyRooms(rooms);
      const match = rooms.find((r) => String(r.id) === String(activeRoomRef.current));
      if (match) {
        setActiveRoomName(match.name);
      }
    } catch (err) {
      console.error('[GeoChat] Discover rooms error:', err);
      setErrorBanner({
        code: 'DISCOVERY_FAILED',
        detail: err.message || 'Failed to discover nearby rooms.',
      });
    } finally {
      setIsLoadingNearbyRooms(false);
    }
  }, []);

  /**
   * Joins a room by verifying location coordinates against room geofence (30 km),
   * activating RoomMembership, then automatically connecting to chat.
   */
  const handleJoinRoom = useCallback(async (roomId, token, lat, lng) => {
    const targetRoomId = String(roomId || activeRoomRef.current || '1').trim();
    const targetToken = (token || activeTokenRef.current || '').trim();

    if (!isValidJwt(targetToken)) {
      setErrorBanner({
        code: 'INVALID_TOKEN',
        detail: 'A valid JWT Access Token is required to join a room.',
      });
      return;
    }

    setIsJoiningRoom(true);
    try {
      await joinRoom({ roomId: targetRoomId, token: targetToken, lat, lng });
      setErrorBanner(null);
      setHistoryError(null);
      // Mark as joined in nearbyRooms list
      setNearbyRooms((prev) =>
        prev.map((r) => (String(r.id) === targetRoomId ? { ...r, is_member: true } : r))
      );
      // Automatically connect and load history for the newly joined room
      handleConnect(targetRoomId, targetToken);
    } catch (err) {
      console.error(`[GeoChat] Failed to join room ${targetRoomId}:`, err);
      setErrorBanner({
        code: err.status === 400 ? 'GEOFENCE_REJECTED' : 'JOIN_FAILED',
        detail: err.message || 'Failed to join room.',
      });
    } finally {
      setIsJoiningRoom(false);
    }
  }, [handleConnect]);

  /**
   * Leaves a room anytime, deactivating RoomMembership.
   */
  const handleLeaveRoom = useCallback(async (roomId) => {
    const targetRoomId = String(roomId || activeRoomRef.current || '1').trim();
    const targetToken = (activeTokenRef.current || '').trim();

    if (!isValidJwt(targetToken)) {
      setErrorBanner({
        code: 'INVALID_TOKEN',
        detail: 'A valid JWT Access Token is required to leave a room.',
      });
      return;
    }

    setIsLeavingRoom(true);
    try {
      const res = await leaveRoom({ roomId: targetRoomId, token: targetToken });
      // Update nearbyRooms is_member to false
      setNearbyRooms((prev) =>
        prev.map((r) => (String(r.id) === targetRoomId ? { ...r, is_member: false } : r))
      );

      // If leaving currently active connected room, disconnect and clear messages
      if (targetRoomId === String(activeRoomRef.current)) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        chatSocket.disconnect('User clicked Leave Room');
        setConnectionStatus(ConnectionStatus.DISCONNECTED);
        setMessages([]);
        setHistoryError(null);
      }

      setErrorBanner({
        code: 'ROOM_LEFT',
        detail: res.detail || `You have left Room #${targetRoomId}.`,
      });
    } catch (err) {
      console.error(`[GeoChat] Failed to leave room ${targetRoomId}:`, err);
      setErrorBanner({
        code: 'LEAVE_FAILED',
        detail: err.message || 'Failed to leave room.',
      });
    } finally {
      setIsLeavingRoom(false);
    }
  }, []);

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
              activeRoomName={activeRoomName}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onJoinRoom={handleJoinRoom}
              onLeaveRoom={handleLeaveRoom}
              isJoiningRoom={isJoiningRoom}
              isLeavingRoom={isLeavingRoom}
              nearbyRooms={nearbyRooms}
              isLoadingNearbyRooms={isLoadingNearbyRooms}
              onDiscoverRooms={handleDiscoverRooms}
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
                  <dt>Nearby Groups GET</dt>
                  <dd><code>/api/chats/rooms/?lat=&amp;lng=&amp;radius=30</code></dd>
                </div>
                <div className="info-card__item">
                  <dt>Room Join POST</dt>
                  <dd><code>/api/chats/rooms/&lt;id&gt;/join/</code></dd>
                </div>
                <div className="info-card__item">
                  <dt>Room Leave POST</dt>
                  <dd><code>/api/chats/rooms/&lt;id&gt;/leave/</code></dd>
                </div>
                <div className="info-card__item">
                  <dt>Room History GET</dt>
                  <dd><code>/api/chats/rooms/&lt;id&gt;/messages/</code></dd>
                </div>
                <div className="info-card__item">
                  <dt>WebSocket Endpoint</dt>
                  <dd><code>/ws/chats/rooms/&lt;id&gt;/?token=&lt;jwt&gt;</code></dd>
                </div>
              </dl>
              <div className="info-card__notice">
                <p>
                  <strong>Geofence Rules:</strong> Discover groups in 30 km range. Location is checked when joining. Chat freely afterwards and leave anytime.
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
              activeRoomName={activeRoomName}
              isLoadingHistory={isLoadingHistory}
              historyError={historyError}
              onRetryLoadHistory={handleRetryLoadHistory}
              currentUser={currentUser}
              onJoinRoom={handleJoinRoom}
              isJoiningRoom={isJoiningRoom}
              onLeaveRoom={handleLeaveRoom}
              isLeavingRoom={isLeavingRoom}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
