import React, { useEffect, useRef } from 'react';
import './AccountPopover.css';

/**
 * AccountPopover Component
 * Clean modern dropdown menu displaying account profile details and a Sign Out action.
 * Automatically closes on outside clicks or Escape key.
 *
 * @param {object} props
 * @param {object} props.currentUser - Authenticated user profile object
 * @param {number} props.joinedRoomsCount - Total number of rooms user has joined
 * @param {() => void} props.onSignOut - Sign out handler
 * @param {() => void} props.onClose - Popover dismiss handler
 * @param {() => void} [props.onNavigateHome] - Navigate to home chats handler
 */
export const AccountPopover = ({
  currentUser,
  joinedRoomsCount = 0,
  onSignOut,
  onClose,
  onNavigateHome,
}) => {
  const popoverRef = useRef(null);

  useEffect(() => {
    const handlePointerDown = (event) => {
      // Don't close if clicking inside the popover or trigger element
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        // Check if target is account trigger
        if (!event.target.closest?.('.navbar__account-trigger')) {
          onClose?.();
        }
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const fullName = [currentUser?.first_name, currentUser?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const accountName = fullName || currentUser?.name || currentUser?.account_name || null;
  const handle = currentUser?.handle ? `@${currentUser.handle}` : '@user';
  const email = currentUser?.email || 'Not set';
  const mobileNumber = currentUser?.mobile_number || currentUser?.phone || 'Not set';
  const avatarLetter = (currentUser?.first_name || currentUser?.handle || 'U')
    .charAt(0)
    .toUpperCase();

  const handleSignOutClick = () => {
    onClose?.();
    onSignOut?.();
  };

  return (
    <div
      className="account-popover"
      ref={popoverRef}
      role="dialog"
      aria-label="Account details"
      aria-modal="false"
    >
      <div className="account-popover__header">
        <div className="account-popover__avatar" aria-hidden="true">
          {avatarLetter}
        </div>
        <div className="account-popover__user-meta">
          <div className="account-popover__handle-row">
            <span className="account-popover__handle">{handle}</span>
            <span className="account-popover__badge">Active</span>
          </div>
          {accountName && (
            <span className="account-popover__name" title="Account Name">
              {accountName}
            </span>
          )}
        </div>
        <button
          type="button"
          className="account-popover__close-btn"
          onClick={onClose}
          aria-label="Close account menu"
        >
          ×
        </button>
      </div>

      <div className="account-popover__body">
        <div className="account-popover__section-title">Account Details</div>

        <div className="account-popover__detail-item">
          <div className="account-popover__detail-label">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Username / Handle
          </div>
          <div className="account-popover__detail-value account-popover__detail-value--mono">
            {handle}
          </div>
        </div>

        {accountName && (
          <div className="account-popover__detail-item">
            <div className="account-popover__detail-label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
              Account Name
            </div>
            <div className="account-popover__detail-value">{accountName}</div>
          </div>
        )}

        <div className="account-popover__detail-item">
          <div className="account-popover__detail-label">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Email
          </div>
          <div className="account-popover__detail-value" title={email}>
            {email}
          </div>
        </div>

        <div className="account-popover__detail-item">
          <div className="account-popover__detail-label">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            Mobile Number
          </div>
          <div className="account-popover__detail-value">{mobileNumber}</div>
        </div>

        <div className="account-popover__detail-item">
          <div className="account-popover__detail-label">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Total Rooms Joined
          </div>
          <div className="account-popover__detail-value account-popover__detail-value--count">
            <span className="account-popover__count-pill">
              {joinedRoomsCount} {joinedRoomsCount === 1 ? 'group' : 'groups'}
            </span>
          </div>
        </div>
      </div>

      <div className="account-popover__footer">
        {onNavigateHome && (
          <button
            type="button"
            className="account-popover__nav-btn"
            onClick={() => {
              onClose?.();
              onNavigateHome();
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Go to My Chats
          </button>
        )}
        <button
          type="button"
          className="account-popover__signout-btn"
          onClick={handleSignOutClick}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default AccountPopover;
