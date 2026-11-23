import React from 'react';
import { ConnectionStatus } from '../services/socket';
import './Navbar.css';

/**
 * Navbar Component
 * Displays application branding and live WebSocket connection status badge.
 *
 * @param {object} props
 * @param {string} props.status - Current connection state (Disconnected, Connecting, Connected, Error)
 * @param {string|number} [props.activeRoom] - Active room ID when connected
 */
export const Navbar = ({ status, activeRoom }) => {
  const getStatusClass = () => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return 'status-badge--connected';
      case ConnectionStatus.CONNECTING:
        return 'status-badge--connecting';
      case ConnectionStatus.ERROR:
        return 'status-badge--error';
      default:
        return 'status-badge--disconnected';
    }
  };

  return (
    <header className="navbar">
      <div className="navbar__brand">
        <div className="navbar__logo-icon">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div className="navbar__brand-text">
          <h1 className="navbar__title">GeoChat</h1>
          <span className="navbar__badge-tag">Day 1 • Real-time WS</span>
        </div>
      </div>

      <div className="navbar__status-area">
        {status === ConnectionStatus.CONNECTED && activeRoom && (
          <span className="navbar__room-pill">
            <span className="navbar__room-hash">#</span> Room {activeRoom}
          </span>
        )}

        <div className={`status-badge ${getStatusClass()}`} role="status" aria-live="polite">
          <span className="status-badge__dot" />
          <span className="status-badge__text">{status}</span>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
