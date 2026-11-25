import React, { useState, useEffect } from 'react';
import { ConnectionStatus } from '../services/socket';
import { isValidJwt } from '../utils/messageUtils';
import { getBrowserLocation, LOCATION_PRESETS } from '../utils/geolocation';
import './ConnectionPanel.css';

/**
 * ConnectionPanel Component
 * Coordinates JWT Authentication, direct Room ID connection, HTML5 Geolocation detection,
 * 30 km radius group discovery, joining/leaving groups, and WebSocket connection.
 */
export const ConnectionPanel = ({
  status,
  activeRoom,
  activeRoomName,
  token = '',
  onTokenChange,
  onOpenAuth,
  onSignOut,
  lat,
  lng,
  onLatChange,
  onLngChange,
  onConnect,
  onDisconnect,
  onJoinRoom,
  onLeaveRoom,
  isJoiningRoom = false,
  isLeavingRoom = false,
  nearbyRooms = [],
  roomListMode = 'nearby',
  isLoadingNearbyRooms = false,
  onDiscoverRooms,
  roomActionError = null,
  onDismissRoomActionError,
}) => {
  const [roomId, setRoomId] = useState(() => String(activeRoom || '1'));
  const [showToken, setShowToken] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsNotice, setGpsNotice] = useState(null);

  // Keep Room ID input synced when activeRoom changes from discovery/join actions
  useEffect(() => {
    if (activeRoom != null) {
      setRoomId(String(activeRoom));
    }
  }, [activeRoom]);

  const isConnected = status === ConnectionStatus.CONNECTED;
  const isConnecting = status === ConnectionStatus.CONNECTING;
  const isTokenValid = isValidJwt(token);
  const isUrlEntered = Boolean(token.trim()) && (
    /^(https?|wss?):\/\//i.test(token.trim()) ||
    token.includes('localhost') ||
    token.includes('127.0.0.1')
  );

  const handleClearToken = () => {
    if (onSignOut) {
      onSignOut();
    } else {
      onTokenChange?.('');
    }
  };

  const handleDirectConnect = (e) => {
    e.preventDefault();
    if (!isTokenValid || !roomId.trim() || !onConnect) return;
    onConnect(roomId.trim(), token.trim());
  };

  const handleDetectGps = async () => {
    setIsDetectingGps(true);
    setGpsNotice(null);
    try {
      const pos = await getBrowserLocation();
      onLatChange?.(String(pos.lat));
      onLngChange?.(String(pos.lng));
      setGpsNotice({
        type: 'success',
        text: `GPS coordinates detected: ${pos.lat}, ${pos.lng} (accuracy: ±${pos.accuracy}m)`,
      });
      if (isTokenValid && onDiscoverRooms) {
        onDiscoverRooms(pos.lat, pos.lng, token);
      }
    } catch (err) {
      setGpsNotice({ type: 'error', text: err.message });
    } finally {
      setIsDetectingGps(false);
    }
  };

  const handleApplyPreset = (preset) => {
    onLatChange?.(String(preset.lat));
    onLngChange?.(String(preset.lng));
    setGpsNotice({ type: 'info', text: `Location set to ${preset.name}` });
    if (isTokenValid && onDiscoverRooms) {
      onDiscoverRooms(preset.lat, preset.lng, token);
    }
  };

  const handleSearchGroups = (e) => {
    if (e) e.preventDefault();
    if (!isTokenValid || !onDiscoverRooms) return;
    onDiscoverRooms(lat, lng, token, { includeAll: false });
  };

  const handleListAllGroups = () => {
    if (!isTokenValid || !onDiscoverRooms) return;
    onDiscoverRooms(lat, lng, token, { includeAll: true });
  };

  return (
    <section className="connection-panel" aria-labelledby="connection-settings-heading">
      {/* Panel Header */}
      <div className="connection-panel__header">
        <div className="connection-panel__title-wrap">
          <svg
            className="connection-panel__icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <h2 id="connection-settings-heading" className="connection-panel__title">
            GeoChat Location &amp; Room Hub
          </h2>
        </div>
        <span className="connection-panel__hint">30 km Geofence Discovery</span>
      </div>

      {/* Step 1: JWT Authentication & Direct Room Connect */}
      <form className="connection-panel__section" onSubmit={handleDirectConnect}>
        <div className="form-group form-group--token">
          <div className="form-label-row">
            <label htmlFor="jwt-token-input" className="form-label">
              JWT Access Token
            </label>
            <div className="form-label-actions">
              {onOpenAuth && (
                <button
                  type="button"
                  className="text-btn"
                  onClick={onOpenAuth}
                  disabled={isConnecting}
                >
                  {isTokenValid ? 'Switch Account' : 'Sign In'}
                </button>
              )}
              {token && (
                <button
                  type="button"
                  className="text-btn"
                  onClick={handleClearToken}
                  disabled={isConnecting}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="text-btn"
                onClick={() => setShowToken(!showToken)}
                title={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="input-wrap">
            <input
              id="jwt-token-input"
              type={showToken ? 'text' : 'password'}
              className="form-input form-input--token"
              value={token}
              onChange={(e) => onTokenChange?.(e.target.value)}
              disabled={isConnecting}
              placeholder="Paste SimpleJWT access token (eyJhbGci...)"
              autoComplete="off"
              spellCheck="false"
              required
            />
          </div>
          {token.trim().length > 0 && !isTokenValid && (
            <p className="token-validation-error">
              {isUrlEntered
                ? 'A URL was detected instead of a JWT token. Please paste your SimpleJWT token.'
                : 'Invalid JWT format (must start with eyJ... and contain 3 dot-separated segments).'}
            </p>
          )}
        </div>

        {/* Direct Room ID + Connect/Disconnect */}
        <div className="direct-connect-row">
          <div className="form-group direct-connect-row__input">
            <label htmlFor="room-id-input" className="form-label">
              Room ID
            </label>
            <input
              id="room-id-input"
              type="text"
              inputMode="numeric"
              className="form-input form-input--compact"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              disabled={isConnecting}
              placeholder="1"
              required
            />
          </div>
          <div className="direct-connect-row__actions">
            <button
              type="submit"
              className="btn btn--connect"
              disabled={!isTokenValid || !roomId.trim() || isConnecting}
            >
              {isConnecting ? 'Connecting...' : isConnected && String(activeRoom) === roomId.trim() ? 'Reconnect' : 'Connect'}
            </button>
            {isConnected && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={onDisconnect}
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Step 2: Location Selection & GPS */}
      <div className="connection-panel__section geo-section">
        <div className="geo-section__header">
          <span className="geo-section__badge">1</span>
          <h3 className="geo-section__title">Your Current Location</h3>
          <button
            type="button"
            className="btn btn--gps"
            onClick={handleDetectGps}
            disabled={isDetectingGps}
            title="Use device GPS location via browser"
          >
            {isDetectingGps ? (
              <>
                <span className="btn__spinner" />
                Detecting GPS...
              </>
            ) : (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                  <line x1="12" y1="2" x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="6" y2="12" />
                  <line x1="18" y1="12" x2="22" y2="12" />
                </svg>
                Detect My Location
              </>
            )}
          </button>
        </div>

        {/* Location Presets */}
        <div className="geo-presets">
          <span className="geo-presets__label">Test Presets:</span>
          <div className="geo-presets__chips">
            {LOCATION_PRESETS.map((p) => {
              const isActive = String(p.lat) === String(lat) && String(p.lng) === String(lng);
              return (
                <button
                  key={p.name}
                  type="button"
                  className={`chip ${isActive ? 'chip--active' : ''}`}
                  onClick={() => handleApplyPreset(p)}
                  title={p.description}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Coordinate Inputs */}
        <div className="geo-coords-grid">
          <div className="form-group">
            <label htmlFor="geo-lat-input" className="form-label">
              Latitude
            </label>
            <input
              id="geo-lat-input"
              type="number"
              step="any"
              className="form-input form-input--compact"
              value={lat}
              onChange={(e) => onLatChange?.(e.target.value)}
              placeholder="25.2893"
            />
          </div>
          <div className="form-group">
            <label htmlFor="geo-lng-input" className="form-label">
              Longitude
            </label>
            <input
              id="geo-lng-input"
              type="number"
              step="any"
              className="form-input form-input--compact"
              value={lng}
              onChange={(e) => onLngChange?.(e.target.value)}
              placeholder="83.0064"
            />
          </div>
        </div>

        {gpsNotice && (
          <p className={`geo-notice geo-notice--${gpsNotice.type}`}>
            {gpsNotice.text}
          </p>
        )}

        <div className="geo-search-actions">
          <button
            type="button"
            className="btn btn--search-rooms"
            onClick={handleSearchGroups}
            disabled={!isTokenValid || isLoadingNearbyRooms}
          >
            {isLoadingNearbyRooms && roomListMode === 'nearby' ? (
              <>
                <span className="btn__spinner" />
                Scanning 30 km...
              </>
            ) : (
              <>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Find Nearby (30 km)
              </>
            )}
          </button>
          <button
            type="button"
            className="btn btn--list-all"
            onClick={handleListAllGroups}
            disabled={!isTokenValid || isLoadingNearbyRooms}
            title="List all active rooms regardless of distance"
          >
            {isLoadingNearbyRooms && roomListMode === 'all' ? 'Loading...' : 'All Rooms'}
          </button>
        </div>
      </div>

      {/* Inline Action Feedback (e.g. Geofence rejection, 404, unauthorized) */}
      {roomActionError && (
        <div className="panel-error-notice" role="alert">
          <span className="panel-error-notice__text">{roomActionError}</span>
          {onDismissRoomActionError && (
            <button
              type="button"
              className="panel-error-notice__dismiss"
              onClick={onDismissRoomActionError}
              aria-label="Dismiss room error"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Step 3: Discovered Groups */}
      <div className="connection-panel__section rooms-section">
        <div className="rooms-section__header">
          <span className="geo-section__badge">2</span>
          <h3 className="geo-section__title">
            {roomListMode === 'all' ? `All Active Groups (${nearbyRooms.length})` : `Groups in Range (${nearbyRooms.length})`}
          </h3>
          <span className="rooms-section__sub">
            {roomListMode === 'all' ? 'All active' : 'Limit: 30 km radius'}
          </span>
        </div>

        {isLoadingNearbyRooms ? (
          <div className="rooms-loading">
            <span className="btn__spinner" />
            <span>{roomListMode === 'all' ? 'Loading active rooms...' : 'Finding groups within 30 km...'}</span>
          </div>
        ) : nearbyRooms.length === 0 ? (
          <div className="rooms-empty">
            <p className="rooms-empty__text">
              {roomListMode === 'all'
                ? 'No active chat groups found.'
                : 'No chat groups found within 30 km of your selected coordinates.'}
            </p>
            <p className="rooms-empty__hint">
              Tip: Click <strong>Assi Ghat</strong> preset or <strong>All Rooms</strong> above to browse rooms.
            </p>
          </div>
        ) : (
          <div className="rooms-list">
            {nearbyRooms.map((room) => {
              const isCurrentRoom = String(activeRoom) === String(room.id);
              const isRoomConnected = isCurrentRoom && isConnected;

              return (
                <div
                  key={room.id}
                  className={`room-card ${isRoomConnected ? 'room-card--active' : ''}`}
                >
                  <div className="room-card__header">
                    <span className="room-card__name">
                      #{room.id} {room.name}
                    </span>
                    <span className="room-card__distance">
                      {room.distance_km != null
                        ? `📍 ${room.distance_km} km away`
                        : `${room.radius_km || 30} km radius`}
                    </span>
                  </div>

                  {room.description && (
                    <p className="room-card__desc">{room.description}</p>
                  )}

                  <div className="room-card__actions">
                    {isRoomConnected ? (
                      <>
                        <span className="badge badge--active">Active in Chat</span>
                        {onLeaveRoom && (
                          <button
                            type="button"
                            className="btn btn--leave-sm"
                            onClick={() => onLeaveRoom(room.id)}
                            disabled={isLeavingRoom}
                            title="Leave this group anytime"
                          >
                            {isLeavingRoom ? 'Leaving...' : 'Leave Group'}
                          </button>
                        )}
                      </>
                    ) : room.is_member ? (
                      <>
                        <button
                          type="button"
                          className="btn btn--enter-sm"
                          onClick={() => onConnect(room.id, token.trim())}
                          disabled={!isTokenValid || isConnecting}
                        >
                          Enter Chat
                        </button>
                        {onLeaveRoom && (
                          <button
                            type="button"
                            className="btn btn--leave-sm"
                            onClick={() => onLeaveRoom(room.id)}
                            disabled={isLeavingRoom}
                          >
                            {isLeavingRoom ? 'Leaving...' : 'Leave'}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--join-sm"
                        onClick={() => onJoinRoom(room.id, token.trim(), lat, lng)}
                        disabled={!isTokenValid || isJoiningRoom}
                      >
                        {isJoiningRoom ? (
                          <>
                            <span className="btn__spinner" />
                            Joining...
                          </>
                        ) : (
                          <>
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="8.5" cy="7" r="4" />
                              <line x1="20" y1="8" x2="20" y2="14" />
                              <line x1="23" y1="11" x2="17" y2="11" />
                            </svg>
                            Join Group
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 4: Active Chat Status & Disconnect */}
      {isConnected && (
        <div className="connection-panel__section active-room-bar">
          <div className="active-room-bar__info">
            <span className="active-room-bar__dot" />
            <span className="active-room-bar__text">
              Connected to <strong>Room #{activeRoom}</strong> {activeRoomName ? `(${activeRoomName})` : ''}
            </span>
          </div>
          <div className="active-room-bar__buttons">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onDisconnect}
            >
              Disconnect
            </button>
            {onLeaveRoom && (
              <button
                type="button"
                className="btn btn--leave-sm"
                onClick={() => onLeaveRoom(activeRoom)}
                disabled={isLeavingRoom}
              >
                Leave Room
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default ConnectionPanel;

