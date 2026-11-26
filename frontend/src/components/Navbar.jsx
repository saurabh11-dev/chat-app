import React, { useState } from 'react';
import { ROUTES } from '../utils/router';
import AccountPopover from './AccountPopover';
import './Navbar.css';

/**
 * Navbar Component
 * Displays clean GeoChat branding, route navigation tabs,
 * and a single clickable user account trigger that opens the Account Popover.
 */
export const Navbar = ({
  currentRoute = ROUTES.HOME,
  onNavigate,
  isAuthenticated = false,
  currentUser = null,
  joinedRoomsCount = 0,
  onSignOut,
}) => {
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const avatarInitial = (currentUser?.first_name || currentUser?.handle || 'U')
    .charAt(0)
    .toUpperCase();
  const handleText = currentUser?.handle ? `@${currentUser.handle}` : '@user';

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
          <div className="navbar__account-wrap">
            <button
              type="button"
              className={`navbar__account-trigger ${isAccountOpen ? 'navbar__account-trigger--active' : ''}`}
              onClick={() => setIsAccountOpen((prev) => !prev)}
              aria-expanded={isAccountOpen}
              aria-haspopup="dialog"
              aria-label="User account menu"
            >
              <span className="navbar__account-avatar">
                {avatarInitial}
              </span>
              <span className="navbar__account-handle">
                {handleText}
              </span>
              <svg
                className={`navbar__account-chevron ${isAccountOpen ? 'navbar__account-chevron--open' : ''}`}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isAccountOpen && (
              <AccountPopover
                currentUser={currentUser}
                joinedRoomsCount={joinedRoomsCount}
                onSignOut={onSignOut}
                onClose={() => setIsAccountOpen(false)}
              />
            )}
          </div>
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
