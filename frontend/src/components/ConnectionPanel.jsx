import React, { useState, useEffect } from 'react';
import { ConnectionStatus } from '../services/socket';
import { isValidJwt } from '../utils/messageUtils';
import { getBrowserLocation, LOCATION_PRESETS } from '../utils/geolocation';
import './ConnectionPanel.css';

const STORAGE_KEY_TOKEN = 'geochat_jwt_token';
const STORAGE_KEY_ROOM = 'geochat_room_id';
const STORAGE_KEY_LAT = 'geochat_lat';
const STORAGE_KEY_LNG = 'geochat_lng';

/**
 * ConnectionPanel Component
 * Coordinates JWT Authentication, HTML5 Geolocation detection,
 * 30 km radius group discovery, joining/leaving groups, and WebSocket connection.
 */
export const ConnectionPanel = ({
  status,
  activeRoom,
  activeRoomName,
  onConnect,
  onDisconnect,
  onJoinRoom,
  onLeaveRoom,
  isJoiningRoom = false,
  isLeavingRoom = false,
  nearbyRooms = [],
  isLoadingNearbyRooms = false,
  onDiscoverRooms,
}) => {
  const [token, setToken] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_TOKEN);
      if (stored) {
        if (isValidJwt(stored)) return stored.trim();
        localStorage.removeItem(STORAGE_KEY_TOKEN);
      }
    } catch {}
    return '';
  });

  const [roomId, setRoomId] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_ROOM) || '1';
  });

  const [lat, setLat] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_LAT) || '25.2893';
  });

  const [lng, setLng] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_LNG) || '83.0064';
  });

  const [showToken, setShowToken] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsNotice, setGpsNotice] = useState(null);

  // Sync state to localStorage
  useEffect(() => {
    if (token && isValidJwt(token)) {
      localStorage.setItem(STORAGE_KEY_TOKEN, token.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    }
  }, [token]);

  useEffect(() => {
    if (roomId) localStorage.setItem(STORAGE_KEY_ROOM, roomId);
  }, [roomId]);

  useEffect(() => {
    if (lat) localStorage.setItem(STORAGE_KEY_LAT, lat);
    if (lng) localStorage.setItem(STORAGE_KEY_LNG, lng);
  }, [lat, lng]);

  const isConnected = status === ConnectionStatus.CONNECTED;
  const isConnecting = status === ConnectionStatus.CONNECTING;
  const isTokenValid = isValidJwt(token);
  const isUrlEntered = Boolean(token.trim()) && (
    /^(https?|wss?):\/\//i.test(token.trim()) ||
    token.includes('localhost') ||
    token.includes('127.0.0.1')
  );

  const handleClearToken = () => {
    setToken('');
    localStorage.removeItem(STORAGE_KEY_TOKEN);
  };

  const handleDetectGps = async () => {
    setIsDetectingGps(true);
    setGpsNotice(null);
    try {
      const pos = await getBrowserLocation();
      setLat(String(pos.lat));
      setLng(String(pos.lng));
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
    setLat(String(preset.lat));
    setLng(String(preset.lng));
    setGpsNotice({ type: 'info', text: `Location set to ${preset.name}` });
    if (isTokenValid && onDiscoverRooms) {
      onDiscoverRooms(preset.lat, preset.lng, token);
    }
  };

  const handleSearchGroups = (e) => {
    if (e) e.preventDefault();
    if (!isTokenValid || !onDiscoverRooms) return;
    onDiscoverRooms(lat, lng, token);
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
            GeoChat Location & Room Hub
          </h2>
        </div>
        <span className="connection-panel__hint">30 km Geofence Discovery</span>
      </div>

      {/* Step 1: JWT Authentication */}
      <div className="connection-panel__section">
        <div className="form-group form-group--token">
          <div className="form-label-row">
            <label htmlFor="jwt-token-input" className="form-label">
              JWT Access Token
            </label>
            <div className="form-label-actions">
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
              onChange={(e) => setToken(e.target.value)}
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
      </div>

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
              onChange={(e) => setLat(e.target.value)}
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
              onChange={(e) => setLng(e.target.value)}
              placeholder="83.0064"
            />
          </div>
        </div>

        {gpsNotice && (
          <p className={`geo-notice geo-notice--${gpsNotice.type}`}>
            {gpsNotice.text}
          </p>
        )}

        <button
          type="button"
          className="btn btn--search-rooms"
          onClick={handleSearchGroups}
          disabled={!isTokenValid || isLoadingNearbyRooms}
        >
          {isLoadingNearbyRooms ? (
            <>
              <span className="btn__spinner" />
              Scanning for groups in 30 km...
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
              Find Groups Within 30 km
            </>
          )}
        </button>
      </div>

      {/* Step 3: Discovered Groups Within 30 km */}
      <div className="connection-panel__section rooms-section">
        <div className="rooms-section__header">
          <span className="geo-section__badge">2</span>
          <h3 className="geo-section__title">
            Groups in Range ({nearbyRooms.length})
          </h3>
          <span className="rooms-section__sub">Limit: 30 km radius</span>
        </div>

        {isLoadingNearbyRooms ? (
          <div className="rooms-loading">
            <span className="btn__spinner" />
            <span>Finding groups within 30 km...</span>
          </div>
        ) : nearbyRooms.length === 0 ? (
          <div className="rooms-empty">
            <p className="rooms-empty__text">
              No chat groups found within 30 km of your selected coordinates.
            </p>
            <p className="rooms-empty__hint">
              Tip: Click the <strong>Assi Ghat</strong> preset above to discover Varanasi groups.
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
                      📍 {room.distance_km != null ? `${room.distance_km} km away` : 'In Range'}
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
