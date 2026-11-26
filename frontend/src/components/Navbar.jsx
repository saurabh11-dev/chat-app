import React from 'react';
import { ConnectionStatus } from '../services/socket';
import { ROUTES } from '../utils/router';
import './Navbar.css';

/**
 * Navbar Component
 * Displays GeoChat branding, route navigation (/ and /discover when authenticated),
 * user handle, live connection status badge, and Sign Out button.
 */
export const Navbar = ({
  status,
  activeRoom,
  currentRoute = ROUTES.HOME,
  onNavigate,
  isAuthenticated = false,
  currentUser = null,
  onSignOut,
}) => {
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
          <span className="navbar__badge-tag">Location Chat</span>
        </div>
      </div>

      {isAuthenticated && onNavigate && (
        <nav className="navbar__nav" aria-label="Primary Navigation">
          <button
            type="button"
            className={`navbar__nav-btn ${currentRoute === ROUTES.HOME ? 'navbar__nav-btn--active' : ''}`}
            onClick={() => onNavigate(ROUTES.HOME)}
          >
            My Chats
          </button>
          <button
            type="button"
            className={`navbar__nav-btn ${currentRoute === ROUTES.DISCOVER ? 'navbar__nav-btn--active' : ''}`}
            onClick={() => onNavigate(ROUTES.DISCOVER)}
          >
            Discover Rooms
          </button>
          <button
            type="button"
            className={`navbar__nav-btn ${currentRoute === ROUTES.NEW_ROOM ? 'navbar__nav-btn--active' : ''}`}
            onClick={() => onNavigate(ROUTES.NEW_ROOM)}
          >
            + Create Room
          </button>
        </nav>
      )}

      {isAuthenticated ? (
        <div className="navbar__status-area">
          {currentUser?.handle && (
            <span className="navbar__user-pill" title={currentUser.email || currentUser.handle}>
              @{currentUser.handle}
            </span>
          )}

          {status === ConnectionStatus.CONNECTED && activeRoom && (
            <span className="navbar__room-pill">
              <span className="navbar__room-hash">#</span> Room {activeRoom}
            </span>
          )}

          <div className={`status-badge ${getStatusClass()}`} role="status" aria-live="polite">
            <span className="status-badge__dot" />
            <span className="status-badge__text">{status}</span>
          </div>

          {onSignOut && (
            <button
              type="button"
              className="navbar__auth-action navbar__auth-action--signout"
              onClick={onSignOut}
            >
              Sign Out
            </button>
          )}
        </div>
      ) : (
        <div className="navbar__status-area">
          <span className="navbar__badge-tag">Sign In Required</span>
        </div>
      )}
    </header>
  );
};

export default Navbar;


