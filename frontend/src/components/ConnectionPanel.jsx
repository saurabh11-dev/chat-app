import React, { useState, useEffect } from 'react';
import { ConnectionStatus } from '../services/socket';
import './ConnectionPanel.css';

const STORAGE_KEY_TOKEN = 'geochat_jwt_token';
const STORAGE_KEY_ROOM = 'geochat_room_id';

/**
 * ConnectionPanel Component
 * Manages Room ID and JWT Access Token credentials, with persistence to localStorage.
 * Provides Connect and Disconnect triggers.
 *
 * @param {object} props
 * @param {string} props.status - Current WebSocket status
 * @param {(roomId: string|number, token: string) => void} props.onConnect
 * @param {() => void} props.onDisconnect
 */
export const ConnectionPanel = ({ status, onConnect, onDisconnect }) => {
  const [token, setToken] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_TOKEN) || '';
  });

  const [roomId, setRoomId] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_ROOM) || '1';
  });

  const [showToken, setShowToken] = useState(false);

  // Sync token to localStorage on change
  useEffect(() => {
    if (token) {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    }
  }, [token]);

  // Sync roomId to localStorage on change
  useEffect(() => {
    if (roomId) {
      localStorage.setItem(STORAGE_KEY_ROOM, roomId);
    }
  }, [roomId]);

  const isConnected = status === ConnectionStatus.CONNECTED;
  const isConnecting = status === ConnectionStatus.CONNECTING;
  const canConnect = Boolean(token.trim()) && Boolean(roomId.trim()) && !isConnected && !isConnecting;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canConnect) return;
    onConnect(roomId.trim(), token.trim());
  };

  const handleClearToken = () => {
    setToken('');
    localStorage.removeItem(STORAGE_KEY_TOKEN);
  };

  return (
    <section className="connection-panel" aria-labelledby="connection-settings-heading">
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
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
          <h2 id="connection-settings-heading" className="connection-panel__title">
            Connection Settings
          </h2>
        </div>
        <span className="connection-panel__hint">Django SimpleJWT WebSocket Endpoint</span>
      </div>

      <form className="connection-panel__form" onSubmit={handleSubmit}>
        <div className="connection-panel__grid">
          {/* Room ID Input */}
          <div className="form-group form-group--room">
            <label htmlFor="room-id-input" className="form-label">
              Room ID
            </label>
            <div className="input-wrap">
              <span className="input-prefix">#</span>
              <input
                id="room-id-input"
                type="number"
                min="1"
                step="1"
                className="form-input form-input--room"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                disabled={isConnected || isConnecting}
                placeholder="1"
                required
              />
            </div>
          </div>

          {/* JWT Access Token Input */}
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
                    disabled={isConnected || isConnecting}
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
                disabled={isConnected || isConnecting}
                placeholder="Paste your access token here (e.g. eyJhbGciOiJIUzI1Ni...)"
                autoComplete="off"
                spellCheck="false"
                required
              />
            </div>
          </div>
        </div>

        {/* Buttons / Controls */}
        <div className="connection-panel__actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!canConnect}
          >
            {isConnecting ? (
              <>
                <span className="btn__spinner" />
                Connecting...
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Connect
              </>
            )}
          </button>

          <button
            type="button"
            className="btn btn--secondary"
            onClick={onDisconnect}
            disabled={status === ConnectionStatus.DISCONNECTED}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Disconnect
          </button>
        </div>
      </form>
    </section>
  );
};

export default ConnectionPanel;
