import React, { useState, useRef, useEffect } from 'react';
import './ChatPreviewBox.css';

/**
 * Format ISO-8601 timestamp string into readable local time.
 * @param {string} isoString
 * @returns {string}
 */
const formatTimestamp = (isoString) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('default', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return isoString;
  }
};

/**
 * ChatPreviewBox Component
 * Live WebSocket test console showing incoming messages, error/moderation alerts,
 * and a message transmission input.
 *
 * @param {object} props
 * @param {Array<{ id: number|string, sender_handle: string, content: string, created_at: string, is_own?: boolean }>} props.messages
 * @param {{ code?: string, detail: string } | null} props.errorBanner
 * @param {() => void} props.onDismissError
 * @param {(text: string) => boolean | void} props.onSendMessage
 * @param {boolean} props.isConnected
 * @param {string|number} [props.activeRoom]
 * @param {boolean} [props.isLoadingHistory]
 * @param {{ message: string, status?: number } | null} [props.historyError]
 * @param {() => void} [props.onRetryLoadHistory]
 * @param {object} [props.currentUser]
 * @param {(roomId: string|number) => void} [props.onJoinRoom]
 * @param {boolean} [props.isJoiningRoom]
 * @param {string} [props.activeRoomName]
 * @param {(roomId: string|number) => void} [props.onLeaveRoom]
 * @param {boolean} [props.isLeavingRoom]
 */
export const ChatPreviewBox = ({
  messages = [],
  errorBanner = null,
  onDismissError,
  onSendMessage,
  isConnected = false,
  activeRoom = null,
  activeRoomName = '',
  isLoadingHistory = false,
  historyError = null,
  onRetryLoadHistory,
  currentUser = null,
  onJoinRoom,
  isJoiningRoom = false,
  onLeaveRoom,
  isLeavingRoom = false,
  onNavigateDiscover,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll to newest message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || !isConnected) return;

    onSendMessage(trimmed);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const isRoomNotFound = Boolean(
    historyError?.status === 404 ||
    errorBanner?.code === 'ROOM_NOT_FOUND (404)'
  );

  const isMembershipError = !isRoomNotFound && Boolean(
    historyError?.status === 403 ||
    (historyError?.message && historyError.message.toLowerCase().includes('member')) ||
    errorBanner?.code === 'FORBIDDEN (4003)' ||
    (errorBanner?.detail && errorBanner.detail.toLowerCase().includes('member'))
  );

  const canOfferJoinFromBanner = !isRoomNotFound && Boolean(
    errorBanner?.code === 'FORBIDDEN (4003)' ||
    errorBanner?.detail?.toLowerCase().includes('member')
  );

  const hasSelectedRoom = activeRoom != null && String(activeRoom).trim() !== '';

  return (
    <section className="chat-box" aria-label="Chat Conversation">
      {/* Console Header */}
      <div className="chat-box__header">
        <div className="chat-box__header-title">
          <span className="chat-box__pulse-indicator" />
          <h2 className="chat-box__heading">
            {hasSelectedRoom ? (activeRoomName || `Room #${activeRoom}`) : 'GeoChat'}
          </h2>
          {hasSelectedRoom && (
            <span className="chat-box__room-tag">
              #{activeRoom}
            </span>
          )}
          {hasSelectedRoom && isConnected && onLeaveRoom && (
            <button
              type="button"
              className="chat-box__leave-btn"
              onClick={() => onLeaveRoom(activeRoom)}
              disabled={isLeavingRoom}
              title="Leave this group anytime"
            >
              {isLeavingRoom ? 'Leaving...' : 'Leave Room'}
            </button>
          )}
        </div>
        <div className="chat-box__meta">
          {isLoadingHistory && (
            <span className="chat-box__loading-pill">
              <span className="chat-box__loading-dot" />
              Syncing history...
            </span>
          )}
          <span className="chat-box__counter">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </span>
        </div>
      </div>

      {/* Moderation / WebSocket Error Alert Banner */}
      {errorBanner && (
        <div className="error-banner" role="alert">
          <div className="error-banner__content">
            <svg
              className="error-banner__icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="error-banner__text">
              {errorBanner.code && (
                <span className="error-banner__code">{errorBanner.code}</span>
              )}
              <span className="error-banner__detail">{errorBanner.detail}</span>
            </div>
          </div>
          <div className="error-banner__actions">
            {canOfferJoinFromBanner && onJoinRoom && (
              <button
                type="button"
                className="error-banner__action-btn"
                onClick={() => onJoinRoom(activeRoom)}
                disabled={isJoiningRoom}
              >
                {isJoiningRoom ? 'Joining...' : `Join Room #${activeRoom}`}
              </button>
            )}
            <button
              type="button"
              className="error-banner__dismiss"
              onClick={onDismissError}
              aria-label="Dismiss alert"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* History Loading Error Alert Banner */}
      {historyError && (
        <div className="history-error-banner" role="alert">
          <div className="history-error-banner__content">
            <svg
              className="history-error-banner__icon"
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
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="history-error-banner__text">
              <span className="history-error-banner__title">Chat History Notice</span>
              <span className="history-error-banner__detail">
                {historyError.message || 'Failed to load room message history.'}
              </span>
            </div>
          </div>
          <div className="history-error-banner__actions">
            {(historyError.status === 403 || isMembershipError) && onJoinRoom && (
              <button
                type="button"
                className="history-error-banner__join-btn"
                onClick={() => onJoinRoom(activeRoom)}
                disabled={isJoiningRoom}
              >
                {isJoiningRoom ? 'Joining...' : `Join Room #${activeRoom}`}
              </button>
            )}
            {onRetryLoadHistory && (
              <button
                type="button"
                className="history-error-banner__retry-btn"
                onClick={onRetryLoadHistory}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages Viewport */}
      <div className="chat-box__viewport">
        {isLoadingHistory && messages.length > 0 && (
          <div className="chat-box__loading-history" aria-live="polite">
            <span className="chat-box__loading-spinner" />
            <span>Updating message history...</span>
          </div>
        )}

        {messages.length === 0 ? (
          isLoadingHistory ? (
            <div className="chat-box__empty">
              <div className="chat-box__empty-icon">
                <span className="chat-box__loading-spinner chat-box__loading-spinner--large" />
              </div>
              <p className="chat-box__empty-title">Loading message history...</p>
              <p className="chat-box__empty-subtitle">
                Retrieving prior messages from room #{activeRoom}.
              </p>
            </div>
          ) : isMembershipError ? (
            <div className="chat-box__empty chat-box__empty--membership">
              <div className="chat-box__empty-icon chat-box__empty-icon--locked">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f87171"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <p className="chat-box__empty-title">Room Membership Required</p>
              <p className="chat-box__empty-subtitle">
                You must be an active member of Room #{activeRoom} to load message history and participate in chat.
              </p>
              {onJoinRoom && (
                <button
                  type="button"
                  className="btn btn--primary chat-box__empty-join-btn"
                  onClick={() => onJoinRoom(activeRoom)}
                  disabled={isJoiningRoom}
                >
                  {isJoiningRoom ? (
                    <>
                      <span className="btn__spinner" />
                      Joining Room #{activeRoom}...
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
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <line x1="20" y1="8" x2="20" y2="14" />
                        <line x1="23" y1="11" x2="17" y2="11" />
                      </svg>
                      Join Room #{activeRoom}
                    </>
                  )}
                </button>
              )}
            </div>
          ) : !hasSelectedRoom ? (
            <div className="chat-box__empty">
              <div className="chat-box__empty-icon">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="chat-box__empty-title">Select a joined group to start chatting</p>
              <p className="chat-box__empty-subtitle">
                Pick a room from your Joined Groups list on the left, or discover new nearby rooms.
              </p>
              {onNavigateDiscover && (
                <button
                  type="button"
                  className="chat-box__discover-btn"
                  onClick={onNavigateDiscover}
                >
                  Discover Nearby Rooms
                </button>
              )}
            </div>
          ) : (
            <div className="chat-box__empty">
              <div className="chat-box__empty-icon">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="chat-box__empty-title">No messages yet</p>
              <p className="chat-box__empty-subtitle">
                {isConnected
                  ? 'Say hello below to start the conversation.'
                  : 'Connecting to room chat...'}
              </p>
            </div>
          )
        ) : (
          <div className="chat-box__message-list">
            {messages.map((msg, index) => {
              const isOwn = Boolean(
                msg.is_own ||
                (currentUser?.handle &&
                  msg.sender_handle &&
                  currentUser.handle.toLowerCase() === msg.sender_handle.toLowerCase()) ||
                (currentUser?.id != null &&
                  msg.sender_id != null &&
                  Number(currentUser.id) === Number(msg.sender_id))
              );

              return (
                <article
                  key={msg.id != null ? `msg-${msg.id}` : `msg-idx-${msg.sender_handle}-${msg.created_at}-${index}`}
                  className={`message-item ${isOwn ? 'message-item--own' : 'message-item--other'}`}
                >
                  <div className="message-item__header">
                    <div className={`message-item__avatar ${isOwn ? 'message-item__avatar--own' : ''}`}>
                      {(msg.sender_handle || 'U').substring(0, 2).toUpperCase()}
                    </div>
                    <span className="message-item__sender">
                      {msg.sender_handle || 'Unknown User'}
                      {isOwn && <span className="message-item__you-tag">(You)</span>}
                    </span>
                    <time className="message-item__time">
                      {formatTimestamp(msg.created_at)}
                    </time>
                  </div>
                  <div className="message-item__body">
                    <p className="message-item__content">{msg.content}</p>
                  </div>
                </article>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Transmission Composer */}
      <form className="chat-box__composer" onSubmit={handleSend}>
        <div className="chat-box__input-wrap">
          <input
            type="text"
            className="chat-box__input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !hasSelectedRoom
                ? 'Select a joined room to send messages'
                : isConnected
                ? 'Type a message and press Enter...'
                : 'Connecting to room...'
            }
            disabled={!isConnected || !hasSelectedRoom}
            maxLength={2000}
            autoComplete="off"
          />
          <button
            type="submit"
            className="chat-box__send-btn"
            disabled={!isConnected || !hasSelectedRoom || !inputText.trim()}
            title={isConnected ? 'Send message' : 'Select and connect to a room first'}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span className="chat-box__send-text">Send</span>
          </button>
        </div>
        <div className="chat-box__footer-info">
          <span>Press Enter to send</span>
          <span>Max 2000 chars • Content moderation active</span>
        </div>
      </form>
    </section>
  );
};

export default ChatPreviewBox;
