import React, { useState, useEffect, useRef } from 'react';
import { checkUsernameAvailability, updateUserProfile } from '../services/chatApi';
import './AccountPopover.css';

/**
 * AccountPopover Component
 * Clean modern dropdown menu displaying account profile details,
 * an inline "Edit Profile" mode with live Bloom filter username availability check,
 * and a Sign Out action.
 *
 * @param {object} props
 * @param {object} props.currentUser - Authenticated user profile object
 * @param {string} [props.token] - JWT access token
 * @param {number} [props.joinedRoomsCount=0] - Total number of rooms user has joined
 * @param {(updatedUser: object) => void} [props.onUpdateUser] - Callback when profile is saved
 * @param {() => void} props.onSignOut - Sign out handler
 * @param {() => void} props.onClose - Popover dismiss handler
 * @param {() => void} [props.onNavigateHome] - Navigate to home chats handler
 */
export const AccountPopover = ({
  currentUser,
  token,
  joinedRoomsCount = 0,
  onUpdateUser,
  onSignOut,
  onClose,
  onNavigateHome,
}) => {
  const popoverRef = useRef(null);
  const latestCleanRef = useRef('');

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [availabilityStatus, setAvailabilityStatus] = useState({
    checking: false,
    available: true,
    is_current: true,
    message: 'Current username',
    type: 'current',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
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
  const currentHandle = currentUser?.handle || currentUser?.username || 'user';
  const handle = currentHandle ? `@${currentHandle}` : '@user';
  const email = currentUser?.email || 'Not set';
  const mobileNumber = currentUser?.mobile_number || currentUser?.phone || 'Not set';
  const avatarLetter = (currentUser?.first_name || currentHandle || 'U')
    .charAt(0)
    .toUpperCase();

  // Debounced username availability check
  useEffect(() => {
    if (!isEditing) return;

    const clean = editUsername.trim().replace(/^@/, '');
    latestCleanRef.current = clean;
    const currentNorm = (currentUser?.handle || currentUser?.username || '').trim().toLowerCase();

    if (!clean) {
      setAvailabilityStatus({
        checking: false,
        available: false,
        is_current: false,
        message: 'Username cannot be empty',
        type: 'error',
      });
      return;
    }

    if (clean.toLowerCase() === currentNorm) {
      setAvailabilityStatus({
        checking: false,
        available: true,
        is_current: true,
        message: 'Current username',
        type: 'current',
      });
      return;
    }

    if (clean.length < 3 || clean.length > 30) {
      setAvailabilityStatus({
        checking: false,
        available: false,
        is_current: false,
        message: 'Must be 3–30 chars',
        type: 'error',
      });
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      setAvailabilityStatus({
        checking: false,
        available: false,
        is_current: false,
        message: 'Letters, numbers, _ only',
        type: 'error',
      });
      return;
    }

    setAvailabilityStatus({
      checking: true,
      available: false,
      is_current: false,
      message: 'Checking...',
      type: 'checking',
    });

    const activeToken = token || localStorage.getItem('geochat_jwt_token') || '';
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailability({
          username: clean,
          token: activeToken,
          signal: controller.signal,
        });

        // Staleness guard: ignore if user has typed something newer
        if (latestCleanRef.current.toLowerCase() !== clean.toLowerCase()) {
          return;
        }

        const isCurrent = Boolean(res?.is_current ?? res?.isCurrent);
        const isAvailable = Boolean(res?.available ?? res?.is_available);

        if (isCurrent) {
          setAvailabilityStatus({
            checking: false,
            available: true,
            is_current: true,
            message: 'Current username',
            type: 'current',
          });
        } else if (isAvailable) {
          setAvailabilityStatus({
            checking: false,
            available: true,
            is_current: false,
            message: 'Available',
            type: 'available',
          });
        } else {
          setAvailabilityStatus({
            checking: false,
            available: false,
            is_current: false,
            message: res?.detail || res?.message || 'Already taken',
            type: 'taken',
          });
        }
      } catch (err) {
        if (err.name === 'AbortError') return;

        // Staleness guard
        if (latestCleanRef.current.toLowerCase() !== clean.toLowerCase()) {
          return;
        }

        // Handle structured error payload if returned by parseApiError
        const errData = err.data;
        if (errData && (errData.available === false || errData.is_available === false)) {
          setAvailabilityStatus({
            checking: false,
            available: false,
            is_current: false,
            message: errData.detail || err.message || 'Already taken',
            type: 'taken',
          });
          return;
        }

        setAvailabilityStatus({
          checking: false,
          available: false,
          is_current: false,
          message: err.message || 'Check failed',
          type: 'error',
        });
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [editUsername, isEditing, currentUser, token]);

  const handleStartEditing = () => {
    setEditName(accountName || '');
    setEditUsername(currentHandle || '');
    setSaveError(null);
    setAvailabilityStatus({
      checking: false,
      available: true,
      is_current: true,
      message: 'Current username',
      type: 'current',
    });
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setSaveError(null);
  };

  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    if (isSaving || availabilityStatus.checking) return;
    if (!availabilityStatus.available && !availabilityStatus.is_current) return;

    const cleanUsername = editUsername.trim().replace(/^@/, '');
    const cleanName = editName.trim();
    const activeToken = token || localStorage.getItem('geochat_jwt_token') || '';

    setIsSaving(true);
    setSaveError(null);

    try {
      const updated = await updateUserProfile({
        token: activeToken,
        username: cleanUsername,
        name: cleanName,
      });

      if (onUpdateUser) {
        onUpdateUser(updated);
      }
      setIsEditing(false);
    } catch (err) {
      const errMsg = err.message || 'Failed to save profile changes.';
      setSaveError(errMsg);

      // If saving fails because username is already taken, update availability status
      // to reflect unavailable/taken rather than leaving a conflicting "Available" badge on screen!
      const isTaken =
        err.status === 400 &&
        (errMsg.toLowerCase().includes('taken') ||
          err.data?.detail?.toLowerCase().includes('taken') ||
          Boolean(err.fieldErrors?.username) ||
          Boolean(err.data?.username));

      if (isTaken) {
        setAvailabilityStatus({
          checking: false,
          available: false,
          is_current: false,
          message: 'Already taken',
          type: 'taken',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

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

      {isEditing ? (
        <div className="account-popover__body">
          <div className="account-popover__section-header">
            <span className="account-popover__section-title">Edit Profile</span>
          </div>

          {saveError && (
            <div className="account-popover__alert account-popover__alert--error" role="alert">
              {saveError}
            </div>
          )}

          <form className="account-popover__form" onSubmit={handleSaveProfile}>
            <div className="account-popover__form-group">
              <label className="account-popover__label" htmlFor="edit-account-name">
                Account Name
              </label>
              <input
                id="edit-account-name"
                type="text"
                className="account-popover__input"
                placeholder="Display / Account name"
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value);
                  if (saveError) setSaveError(null);
                }}
                maxLength={60}
                disabled={isSaving}
              />
            </div>

            <div className="account-popover__form-group">
              <div className="account-popover__label-row">
                <label className="account-popover__label" htmlFor="edit-account-username">
                  Username Handle
                </label>
                <span
                  className={`account-popover__status-badge account-popover__status-badge--${availabilityStatus.type}`}
                >
                  {availabilityStatus.message}
                </span>
              </div>
              <div className="account-popover__input-group">
                <span className="account-popover__input-prefix">@</span>
                <input
                  id="edit-account-username"
                  type="text"
                  className="account-popover__input account-popover__input--with-prefix account-popover__input--mono"
                  placeholder="handle"
                  value={editUsername}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const cleaned = raw.replace(/^@+/, '');
                    setEditUsername(cleaned);
                    if (saveError) setSaveError(null);
                  }}
                  maxLength={30}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="account-popover__edit-actions">
              <button
                type="button"
                className="account-popover__cancel-btn"
                onClick={handleCancelEditing}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="account-popover__save-btn"
                disabled={
                  isSaving ||
                  availabilityStatus.checking ||
                  (!availabilityStatus.available && !availabilityStatus.is_current)
                }
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="account-popover__body">
          <div className="account-popover__section-header">
            <span className="account-popover__section-title">Account Details</span>
            <button
              type="button"
              className="account-popover__edit-trigger"
              onClick={handleStartEditing}
              title="Edit account name and username handle"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit Profile
            </button>
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
      )}

      <div className="account-popover__footer">
        {onNavigateHome && !isEditing && (
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
