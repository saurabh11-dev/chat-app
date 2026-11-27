import React, { useState } from 'react';
import { ROUTES } from '../utils/router';
import AccountPopover from './AccountPopover';
import './Navbar.css';

/**
 * Navbar Component
 * Minimal top header displaying GeoChat branding on the left
 * and a single clickable user account trigger on the right.
 * Center navigation tabs are removed to keep the top bar clean and minimal.
 */
export const Navbar = ({
  onNavigate,
  isAuthenticated = false,
  currentUser = null,
  token = '',
  joinedRoomsCount = 0,
  onUpdateUser,
  onSignOut,
}) => {
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const avatarInitial = (currentUser?.first_name || currentUser?.handle || 'U')
    .charAt(0)
    .toUpperCase();
  const handleText = currentUser?.handle ? `@${currentUser.handle}` : '@user';

  const handleBrandClick = () => {
    if (isAuthenticated && onNavigate) {
      onNavigate(ROUTES.HOME);
    }
  };

  return (
    <header className="navbar">
      <div
        className={`navbar__brand ${isAuthenticated && onNavigate ? 'navbar__brand--clickable' : ''}`}
        onClick={handleBrandClick}
        role={isAuthenticated && onNavigate ? 'button' : undefined}
        tabIndex={isAuthenticated && onNavigate ? 0 : undefined}
        onKeyDown={
          isAuthenticated && onNavigate
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleBrandClick();
                }
              }
            : undefined
        }
        title={isAuthenticated ? 'GeoChat - Return to My Chats' : 'GeoChat'}
      >
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
                token={token}
                joinedRoomsCount={joinedRoomsCount}
                onUpdateUser={onUpdateUser}
                onSignOut={onSignOut}
                onClose={() => setIsAccountOpen(false)}
                onNavigateHome={onNavigate ? () => onNavigate(ROUTES.HOME) : undefined}
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
