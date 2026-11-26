import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from './components/Navbar';
import AuthPanel from './components/AuthPanel';
import JoinedRoomsSidebar from './components/JoinedRoomsSidebar';
import DiscoverRoomsView from './components/DiscoverRoomsView';
import CreateRoomView from './components/CreateRoomView';
import ChatPreviewBox from './components/ChatPreviewBox';
import { chatSocket, ConnectionStatus } from './services/socket';
import {
  fetchRoomMessages,
  fetchUserProfile,
  fetchJoinedRooms,
  fetchNearbyRooms,
  fetchRooms,
  fetchRoomDetail,
  joinRoom,
  leaveRoom,
  createRoom,
} from './services/chatApi';
import {
  mergeMessages,
  parseJwt,
  normalizeMessage,
  isValidJwt,
  sanitizeToken,
} from './utils/messageUtils';
import { ROUTES, resolveAuthorizedRoute } from './utils/router';
import { validateCoordinates, normalizeRoomsResponse } from './utils/geolocation';
import './App.css';

const STORAGE_KEY_TOKEN = 'geochat_jwt_token';
const STORAGE_KEY_REFRESH = 'geochat_refresh_token';
const STORAGE_KEY_LAT = 'geochat_lat';
const STORAGE_KEY_LNG = 'geochat_lng';

function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * GeoChat Main Application
 *
 * Route-synced multi-view flow:
 * - /login: Sign In / Create Account (when unauthenticated)
 * - /: Joined Groups Sidebar + Focused Chat Conversation Panel
 * - /discover: Location detection & Geofenced Room Discovery / Join
 */
export function App() {
  const initialToken = sanitizeToken(readStorage(STORAGE_KEY_TOKEN, ''));
  const initialLat = readStorage(STORAGE_KEY_LAT, '25.2893');
  const initialLng = readStorage(STORAGE_KEY_LNG, '83.0064');

  const [token, setToken] = useState(initialToken);
  const isAuthenticated = isValidJwt(token);

  const [route, setRoute] = useState(() =>
    typeof window !== 'undefined'
      ? resolveAuthorizedRoute(window.location.pathname, isValidJwt(initialToken))
      : ROUTES.LOGIN
  );

  const [connectionStatus, setConnectionStatus] = useState(ConnectionStatus.DISCONNECTED);
  const [activeRoom, setActiveRoom] = useState(null);
  const [activeRoomName, setActiveRoomName] = useState('');
  const [activeRoomMemberCount, setActiveRoomMemberCount] = useState(null);
  const [lat, setLat] = useState(initialLat);
  const [lng, setLng] = useState(initialLng);

  const [currentUser, setCurrentUser] = useState(null);
  const [joinedRooms, setJoinedRooms] = useState([]);
  const [isLoadingJoined, setIsLoadingJoined] = useState(false);
  const [joinedError, setJoinedError] = useState(null);

  const [discoverRooms, setDiscoverRooms] = useState([]);
  const [roomListMode, setRoomListMode] = useState('nearby');
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);
  const [discoverError, setDiscoverError] = useState(null);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState(null);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState(null);

  const [messages, setMessages] = useState([]);
  const [errorBanner, setErrorBanner] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  // Fresh refs for async callbacks and popstate listeners
  const activeRoomRef = useRef(null);
  const activeTokenRef = useRef(initialToken);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const latRef = useRef(initialLat);
  const lngRef = useRef(initialLng);
  const currentUserRef = useRef(null);
  const abortControllerRef = useRef(null);

  isAuthenticatedRef.current = isAuthenticated;

  const navigate = useCallback((targetPath, { replace = false } = {}) => {
    const resolved = resolveAuthorizedRoute(targetPath, isAuthenticatedRef.current);
    if (typeof window !== 'undefined' && window.location.pathname !== resolved) {
      if (replace) {
        window.history.replaceState({}, '', resolved);
      } else {
        window.history.pushState({}, '', resolved);
      }
    }
    setRoute(resolved);
  }, []);

  // Enforce route auth guard on auth changes and browser back/forward
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const resolved = resolveAuthorizedRoute(window.location.pathname, isAuthenticated);
    if (window.location.pathname !== resolved) {
      window.history.replaceState({}, '', resolved);
    }
    setRoute(resolved);
  }, [isAuthenticated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const resolved = resolveAuthorizedRoute(
        window.location.pathname,
        isAuthenticatedRef.current
      );
      if (window.location.pathname !== resolved) {
        window.history.replaceState({}, '', resolved);
      }
      setRoute(resolved);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Persist coordinates
  useEffect(() => {
    latRef.current = lat;
    try {
      if (lat !== '') localStorage.setItem(STORAGE_KEY_LAT, lat);
    } catch {}
  }, [lat]);

  useEffect(() => {
    lngRef.current = lng;
    try {
      if (lng !== '') localStorage.setItem(STORAGE_KEY_LNG, lng);
    } catch {}
  }, [lng]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      chatSocket.disconnect('Application unmounting');
    };
  }, []);

  const loadJoinedRooms = useCallback(async (authToken, signal) => {
    const clean = sanitizeToken(authToken || activeTokenRef.current);
    if (!clean) return [];
    setIsLoadingJoined(true);
    setJoinedError(null);
    try {
      const rooms = await fetchJoinedRooms({ token: clean, signal });
      if (!signal?.aborted) {
        setJoinedRooms(rooms);
      }
      return rooms;
    } catch (err) {
      if (err.name !== 'AbortError' && !signal?.aborted) {
        setJoinedError(err.message || 'Failed to load joined rooms.');
      }
      return [];
    } finally {
      if (!signal?.aborted) {
        setIsLoadingJoined(false);
      }
    }
  }, []);

  // Sync token -> profile & joined rooms
  useEffect(() => {
    const clean = sanitizeToken(token);
    activeTokenRef.current = clean;

    try {
      if (clean) {
        localStorage.setItem(STORAGE_KEY_TOKEN, clean);
      } else {
        localStorage.removeItem(STORAGE_KEY_TOKEN);
      }
    } catch {}

    if (!clean) {
      setCurrentUser(null);
      currentUserRef.current = null;
      setJoinedRooms([]);
      return;
    }

    const decoded = parseJwt(clean);
    if (decoded?.user_id) {
      const seedUser = { id: decoded.user_id };
      setCurrentUser((prev) => (prev?.id === decoded.user_id ? prev : seedUser));
      currentUserRef.current =
        currentUserRef.current?.id === decoded.user_id ? currentUserRef.current : seedUser;
    }

    const controller = new AbortController();
    fetchUserProfile(clean, controller.signal)
      .then((profile) => {
        if (!controller.signal.aborted && profile) {
          setCurrentUser(profile);
          currentUserRef.current = profile;
          setMessages((prev) => prev.map((m) => normalizeMessage(m, profile)));
        }
      })
      .catch(() => {});

    loadJoinedRooms(clean, controller.signal);

    return () => controller.abort();
  }, [token, loadJoinedRooms]);

  /**
   * Fetches room message history from REST API and merges with live messages.
   * Uses AbortController & activeRoomRef guard to prevent room-switch race conditions.
   */
  const loadRoomHistory = useCallback(async (roomId, authToken) => {
    if (!roomId || !authToken || !isValidJwt(authToken)) return;

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
        token: authToken,
        signal: controller.signal,
      });

      if (String(activeRoomRef.current) !== String(roomId)) {
        return;
      }

      setMessages((prev) => mergeMessages(prev, rawHistory, currentUserRef.current));
      setHistoryError(null);
    } catch (err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
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
   * Connects to a room (loads REST history + opens WebSocket).
   */
  const handleConnect = useCallback((roomId, authToken, roomNameHint = '') => {
    const cleanRoomId = String(roomId).trim();
    const cleanToken = sanitizeToken(authToken || activeTokenRef.current);

    if (!cleanRoomId || !cleanToken) {
      return;
    }

    const isRoomChange = cleanRoomId !== String(activeRoomRef.current || '');
    activeRoomRef.current = cleanRoomId;
    activeTokenRef.current = cleanToken;
    setActiveRoom(cleanRoomId);
    setErrorBanner(null);
    setHistoryError(null);

    const match =
      joinedRooms.find((r) => String(r.id) === cleanRoomId) ||
      discoverRooms.find((r) => String(r.id) === cleanRoomId);
    if (roomNameHint) {
      setActiveRoomName(roomNameHint);
    } else {
      setActiveRoomName(match ? match.name : '');
    }
    if (match?.member_count != null) {
      setActiveRoomMemberCount(match.member_count);
    }

    if (isRoomChange) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setMessages([]);
    }

    // Ensure room name and member count are resolved even if navigated directly
    fetchRoomDetail({
      roomId: cleanRoomId,
      token: cleanToken,
      lat: latRef.current,
      lng: lngRef.current,
    })
      .then((room) => {
        if (String(activeRoomRef.current) === cleanRoomId) {
          if (room?.name) setActiveRoomName(room.name);
          if (room?.member_count != null) setActiveRoomMemberCount(room.member_count);
        }
      })
      .catch(() => {});

    loadRoomHistory(cleanRoomId, cleanToken);

    chatSocket.connect({
      roomId: cleanRoomId,
      token: cleanToken,
      onStatusChange: (status, meta) => {
        setConnectionStatus(status);
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

        if (payload.type === 'message' && payload.data) {
          const rawMsg = payload.data;
          if (rawMsg.room != null && String(rawMsg.room) !== String(activeRoomRef.current)) {
            return;
          }
          setMessages((prev) => mergeMessages(prev, rawMsg, currentUserRef.current));
          setErrorBanner(null);
          return;
        }

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
  }, [loadRoomHistory, joinedRooms, discoverRooms]);

  const handleSelectJoinedRoom = useCallback(
    (room) => {
      if (!room) return;
      handleConnect(room.id, activeTokenRef.current, room.name);
    },
    [handleConnect]
  );

  const handleAuthSuccess = useCallback(({ access, refresh, user }) => {
    const cleanAccess = sanitizeToken(access);
    if (!cleanAccess) return;

    activeTokenRef.current = cleanAccess;
    isAuthenticatedRef.current = true;
    setToken(cleanAccess);

    try {
      localStorage.setItem(STORAGE_KEY_TOKEN, cleanAccess);
      if (refresh && isValidJwt(refresh)) {
        localStorage.setItem(STORAGE_KEY_REFRESH, refresh);
      }
    } catch {}

    if (user && typeof user === 'object' && user.handle) {
      setCurrentUser(user);
      currentUserRef.current = user;
    }

    setErrorBanner(null);
    setDiscoverError(null);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', ROUTES.HOME);
    }
    setRoute(ROUTES.HOME);
  }, []);

  const handleSignOut = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    chatSocket.disconnect('User signed out');
    setConnectionStatus(ConnectionStatus.DISCONNECTED);
    activeTokenRef.current = '';
    isAuthenticatedRef.current = false;
    activeRoomRef.current = null;
    setToken('');
    setActiveRoom(null);
    setActiveRoomName('');
    setActiveRoomMemberCount(null);
    setCurrentUser(null);
    currentUserRef.current = null;
    setJoinedRooms([]);
    setDiscoverRooms([]);
    setMessages([]);
    setHistoryError(null);
    setErrorBanner(null);
    setDiscoverError(null);
    setJoinedError(null);
    setIsLoadingHistory(false);
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_REFRESH);
    } catch {}
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', ROUTES.LOGIN);
    }
    setRoute(ROUTES.LOGIN);
  }, []);

  const handleDiscoverRooms = useCallback(
    async (latArg, lngArg, { includeAll = false } = {}) => {
      const cleanToken = sanitizeToken(activeTokenRef.current || token);
      if (!cleanToken) {
        const authErr = 'You must be signed in to discover rooms.';
        setDiscoverError(authErr);
        throw new Error(authErr);
      }

      setIsLoadingDiscover(true);
      setDiscoverError(null);
      setRoomListMode(includeAll ? 'all' : 'nearby');

      try {
        let rooms;
        if (includeAll) {
          rooms = await fetchRooms({ token: cleanToken });
        } else {
          const rawLat =
            latArg != null && String(latArg).trim() !== '' ? latArg : (latRef.current || lat);
          const rawLng =
            lngArg != null && String(lngArg).trim() !== '' ? lngArg : (lngRef.current || lng);

          const validation = validateCoordinates(rawLat, rawLng);
          if (!validation.valid) {
            throw new Error(validation.error);
          }

          const latStr = String(validation.lat);
          const lngStr = String(validation.lng);
          setLat(latStr);
          setLng(lngStr);

          rooms = await fetchNearbyRooms({
            token: cleanToken,
            lat: validation.lat,
            lng: validation.lng,
            radius: 30,
          });
        }

        const normalizedRooms = normalizeRoomsResponse(rooms);
        setDiscoverRooms(normalizedRooms);
        return normalizedRooms;
      } catch (err) {
        console.error('[GeoChat] Discover rooms error:', err);
        const msg = err.message || 'Failed to discover rooms.';
        setDiscoverError(msg);
        throw err;
      } finally {
        setIsLoadingDiscover(false);
      }
    },
    [token, lat, lng]
  );

  const handleJoinRoom = useCallback(
    async (roomId, latArg, lngArg) => {
      const targetRoomId = String(roomId || activeRoomRef.current || '').trim();
      const cleanToken = sanitizeToken(activeTokenRef.current);
      const targetLat =
        latArg != null && String(latArg).trim() !== '' ? latArg : (latRef.current || lat);
      const targetLng =
        lngArg != null && String(lngArg).trim() !== '' ? lngArg : (lngRef.current || lng);

      if (!targetRoomId || !cleanToken) return;

      setIsJoiningRoom(true);
      setJoiningRoomId(targetRoomId);
      setDiscoverError(null);

      try {
        const joinRes = await joinRoom({
          roomId: targetRoomId,
          token: cleanToken,
          lat: targetLat,
          lng: targetLng,
        });

        if (targetLat != null && targetLng != null && String(targetLat).trim() !== '' && String(targetLng).trim() !== '') {
          setLat(String(targetLat));
          setLng(String(targetLng));
        }

        setDiscoverRooms((prev) =>
          prev.map((r) => (String(r.id) === targetRoomId ? { ...r, is_member: true } : r))
        );

        const refreshed = await loadJoinedRooms(cleanToken);
        const joinedMatch = refreshed.find((r) => String(r.id) === targetRoomId);
        const roomNameHint = joinedMatch?.name || joinRes?.room_name || '';

        navigate(ROUTES.HOME);
        handleConnect(targetRoomId, cleanToken, roomNameHint);
      } catch (err) {
        console.error(`[GeoChat] Failed to join room ${targetRoomId}:`, err);
        const detail = err.message || 'Failed to join room.';
        setDiscoverError(detail);
        setErrorBanner({
          code: err.status === 400 ? 'OUTSIDE_GEOFENCE' : 'JOIN_FAILED',
          detail,
        });
      } finally {
        setIsJoiningRoom(false);
        setJoiningRoomId(null);
      }
    },
    [handleConnect, loadJoinedRooms, navigate, lat, lng]
  );

  const handleOpenJoinedFromDiscover = useCallback(
    (room) => {
      if (!room) return;
      navigate(ROUTES.HOME);
      handleConnect(room.id, activeTokenRef.current, room.name);
    },
    [handleConnect, navigate]
  );

  const handleCreateRoom = useCallback(
    async ({ name, description, latitude, longitude, radius }) => {
      const cleanToken = sanitizeToken(activeTokenRef.current);
      if (!cleanToken) return;

      setIsCreatingRoom(true);
      setCreateRoomError(null);

      try {
        const createdRoom = await createRoom({
          token: cleanToken,
          name,
          description,
          latitude,
          longitude,
          radius,
        });

        if (latitude != null && longitude != null && String(latitude).trim() !== '' && String(longitude).trim() !== '') {
          setLat(String(latitude));
          setLng(String(longitude));
        }

        const newRoomId = String(createdRoom.id);
        const refreshed = await loadJoinedRooms(cleanToken);
        const matched = refreshed.find((r) => String(r.id) === newRoomId);
        const roomNameHint = matched?.name || createdRoom.name || '';

        setJoinedRooms((prev) => {
          if (!prev.some((r) => String(r.id) === newRoomId)) {
            return [createdRoom, ...prev];
          }
          return prev;
        });

        // Redirect back to '/' with the newly created room selected so the user can chat immediately
        navigate(ROUTES.HOME);
        handleConnect(newRoomId, cleanToken, roomNameHint);
      } catch (err) {
        console.error('[GeoChat] Failed to create room:', err);
        setCreateRoomError(err.message || 'Failed to create room.');
      } finally {
        setIsCreatingRoom(false);
      }
    },
    [handleConnect, loadJoinedRooms, navigate]
  );

  const handleLeaveRoom = useCallback(async (roomId) => {
    const targetRoomId = String(roomId || activeRoomRef.current || '').trim();
    const cleanToken = sanitizeToken(activeTokenRef.current);
    if (!targetRoomId || !cleanToken) return;

    setIsLeavingRoom(true);
    try {
      const res = await leaveRoom({ roomId: targetRoomId, token: cleanToken });
      setJoinedRooms((prev) => prev.filter((r) => String(r.id) !== targetRoomId));
      setDiscoverRooms((prev) =>
        prev.map((r) => (String(r.id) === targetRoomId ? { ...r, is_member: false } : r))
      );

      if (targetRoomId === String(activeRoomRef.current || '')) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        chatSocket.disconnect('User left room');
        setConnectionStatus(ConnectionStatus.DISCONNECTED);
        activeRoomRef.current = null;
        setActiveRoom(null);
        setActiveRoomName('');
        setActiveRoomMemberCount(null);
        setMessages([]);
        setHistoryError(null);
      }

      setErrorBanner({
        code: 'ROOM_LEFT',
        detail: res.detail || `You left Room #${targetRoomId}.`,
      });
    } catch (err) {
      setErrorBanner({
        code: 'LEAVE_FAILED',
        detail: err.message || 'Failed to leave room.',
      });
    } finally {
      setIsLeavingRoom(false);
    }
  }, []);

  const handleRetryLoadHistory = useCallback(() => {
    if (activeRoomRef.current && activeTokenRef.current) {
      loadRoomHistory(activeRoomRef.current, activeTokenRef.current);
    }
  }, [loadRoomHistory]);

  const handleSendMessage = useCallback((text) => {
    setErrorBanner(null);
    const result = chatSocket.sendMessage(text);
    if (!result.success && result.error) {
      setErrorBanner({
        code: 'SEND_FAILED',
        detail: result.error,
      });
    }
  }, []);

  const activeRoomObj = joinedRooms.find((r) => String(r.id) === String(activeRoom));
  const currentMemberCount = activeRoomObj?.member_count ?? activeRoomMemberCount;

  return (
    <div className="app-container">
      <Navbar
        currentRoute={route}
        onNavigate={navigate}
        isAuthenticated={isAuthenticated}
        currentUser={currentUser}
        joinedRoomsCount={joinedRooms.length}
        onSignOut={handleSignOut}
      />

      <main className="app-main">
        {!isAuthenticated || route === ROUTES.LOGIN ? (
          <AuthPanel onAuthSuccess={handleAuthSuccess} />
        ) : route === ROUTES.NEW_ROOM ? (
          <CreateRoomView
            initialLat={lat}
            initialLng={lng}
            onLatChange={setLat}
            onLngChange={setLng}
            onCreateRoom={handleCreateRoom}
            isCreating={isCreatingRoom}
            actionError={createRoomError}
            onDismissError={() => setCreateRoomError(null)}
            onBackToChats={() => navigate(ROUTES.HOME)}
            onNavigateDiscover={() => navigate(ROUTES.DISCOVER)}
          />
        ) : route === ROUTES.DISCOVER ? (
          <DiscoverRoomsView
            lat={lat}
            lng={lng}
            onLatChange={setLat}
            onLngChange={setLng}
            rooms={discoverRooms}
            roomListMode={roomListMode}
            isLoadingRooms={isLoadingDiscover}
            isJoiningRoom={isJoiningRoom}
            joiningRoomId={joiningRoomId}
            actionError={discoverError}
            onDismissError={() => setDiscoverError(null)}
            onDiscoverRooms={handleDiscoverRooms}
            onJoinRoom={handleJoinRoom}
            onOpenJoinedRoom={handleOpenJoinedFromDiscover}
            onBackToChats={() => navigate(ROUTES.HOME)}
            onNavigateCreateRoom={() => navigate(ROUTES.NEW_ROOM)}
          />
        ) : (
          <div className="app-layout">
            <JoinedRoomsSidebar
              joinedRooms={joinedRooms}
              activeRoom={activeRoom}
              isConnected={connectionStatus === ConnectionStatus.CONNECTED}
              isLoading={isLoadingJoined}
              error={joinedError}
              onSelectRoom={handleSelectJoinedRoom}
              onRefresh={() => loadJoinedRooms(activeTokenRef.current)}
              onNavigateDiscover={() => navigate(ROUTES.DISCOVER)}
              onNavigateCreateRoom={() => navigate(ROUTES.NEW_ROOM)}
              onLeaveRoom={handleLeaveRoom}
              isLeavingRoom={isLeavingRoom}
              currentUser={currentUser}
            />

            <section className="app-content">
              <ChatPreviewBox
                messages={messages}
                errorBanner={errorBanner}
                onDismissError={() => setErrorBanner(null)}
                onSendMessage={handleSendMessage}
                isConnected={connectionStatus === ConnectionStatus.CONNECTED}
                connectionStatus={connectionStatus}
                memberCount={currentMemberCount}
                activeRoom={activeRoom}
                activeRoomName={activeRoomName}
                isLoadingHistory={isLoadingHistory}
                historyError={historyError}
                onRetryLoadHistory={handleRetryLoadHistory}
                currentUser={currentUser}
                onJoinRoom={(id) => handleJoinRoom(id, lat, lng)}
                isJoiningRoom={isJoiningRoom}
                onLeaveRoom={handleLeaveRoom}
                isLeavingRoom={isLeavingRoom}
                onNavigateDiscover={() => navigate(ROUTES.DISCOVER)}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
