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
 */
export const ChatPreviewBox = ({
  messages = [],
  errorBanner = null,
  onDismissError,
  onSendMessage,
  isConnected = false,
  activeRoom = '1',
  isLoadingHistory = false,
  historyError = null,
  onRetryLoadHistory,
  currentUser = null,
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

  return (
    <section className="chat-box" aria-label="Live Chat Room Console">
      {/* Console Header */}
      <div className="chat-box__header">
        <div className="chat-box__header-title">
          <span className="chat-box__pulse-indicator" />
          <h2 className="chat-box__heading">Live Chat Preview Console</h2>
          <span className="chat-box__room-tag">Room #{activeRoom}</span>
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
          <button
            type="button"
            className="error-banner__dismiss"
            onClick={onDismissError}
            aria-label="Dismiss alert"
          >
            ×
          </button>
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
              <p className="chat-box__empty-title">No messages in this session yet</p>
              <p className="chat-box__empty-subtitle">
                {isConnected
                  ? 'Send a test message below to verify real-time broadcasting.'
                  : 'Connect with a valid JWT token above to listen and broadcast.'}
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
              isConnected
                ? 'Type a message and press Enter...'
                : 'Connect to room to enable messaging'
            }
            disabled={!isConnected}
            maxLength={2000}
            autoComplete="off"
          />
          <button
            type="submit"
            className="chat-box__send-btn"
            disabled={!isConnected || !inputText.trim()}
            title={isConnected ? 'Send message' : 'Connect first'}
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
          <span>Payload: <code>{'{ "content": "..." }'}</code></span>
          <span>Max 2000 chars • Content moderation active</span>
        </div>
      </form>
    </section>
  );
};

export default ChatPreviewBox;
