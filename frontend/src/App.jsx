import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import ConnectionPanel from './components/ConnectionPanel';
import ChatPreviewBox from './components/ChatPreviewBox';
import { chatSocket, ConnectionStatus } from './services/socket';
import { API_BASE_URL, WS_BASE_URL } from './config/env';
import './App.css';

/**
 * GeoChat Main Application (Day 1)
 *
 * Coordinates WebSocket connection state, incoming broadcast messages,
 * real-time moderation error handling, and modular subcomponents.
 */
export function App() {
  const [connectionStatus, setConnectionStatus] = useState(ConnectionStatus.DISCONNECTED);
  const [activeRoom, setActiveRoom] = useState('1');
  const [messages, setMessages] = useState([]);
  const [errorBanner, setErrorBanner] = useState(null);

  // Clean up WebSocket connection when application unmounts
  useEffect(() => {
    return () => {
      chatSocket.disconnect('Application unmounting');
    };
  }, []);

  /**
   * Clears the current active error banner.
   */
  const handleDismissError = useCallback(() => {
    setErrorBanner(null);
  }, []);

  /**
   * Connect to specified Room ID using provided JWT Access Token.
   */
  const handleConnect = useCallback((roomId, token) => {
    // Clear previous error state on fresh connect attempt
    setErrorBanner(null);
    setActiveRoom(roomId);

    chatSocket.connect({
      roomId,
      token,
      onStatusChange: (status) => {
        setConnectionStatus(status);
        if (status === ConnectionStatus.DISCONNECTED) {
          // Keep active room in state for display
        }
      },
      onMessage: (payload) => {
        if (!payload || typeof payload !== 'object') return;

        // 1. Valid chat message broadcast
        if (payload.type === 'message' && payload.data) {
          setMessages((prev) => [...prev, payload.data]);
          // Clear error banner on arrival of valid message
          setErrorBanner(null);
          return;
        }

        // 2. Validation / Content moderation error (e.g. ABUSIVE_CONTENT)
        if (payload.type === 'error') {
          setErrorBanner({
            code: payload.code || 'MESSAGE_REJECTED',
            detail: payload.detail || 'An error occurred while sending message.',
          });
        }
      },
      onError: (err) => {
        setErrorBanner({
          code: err.code || 'SOCKET_ERROR',
          detail: err.detail || 'WebSocket encountered an error.',
        });
      },
      onClose: (code, humanMessage) => {
        if (code !== 1000) {
          setErrorBanner({
            code: code === 4001 ? 'UNAUTHORIZED (4001)' : code === 4003 ? 'FORBIDDEN (4003)' : `CLOSE_${code}`,
            detail: humanMessage,
          });
        }
      },
    });
  }, []);

  /**
   * Disconnect from current room.
   */
  const handleDisconnect = useCallback(() => {
    chatSocket.disconnect('User clicked Disconnect');
    setConnectionStatus(ConnectionStatus.DISCONNECTED);
  }, []);

  /**
   * Send a chat message over the open WebSocket.
   */
  const handleSendMessage = useCallback((text) => {
    // UX Rule: Automatically clear error banners when sending a new message
    setErrorBanner(null);

    const result = chatSocket.sendMessage(text);
    if (!result.success && result.error) {
      setErrorBanner({
        code: 'SEND_FAILED',
        detail: result.error,
      });
    }
  }, []);

  return (
    <div className="app-container">
      <Navbar
        status={connectionStatus}
        activeRoom={connectionStatus === ConnectionStatus.CONNECTED ? activeRoom : null}
      />

      <main className="app-main">
        <div className="app-layout">
          {/* Left Column: Connection & Information Controls */}
          <aside className="app-sidebar">
            <ConnectionPanel
              status={connectionStatus}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />

            {/* Contract & Debug Overview Card */}
            <section className="info-card">
              <h3 className="info-card__title">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                Backend Endpoints
              </h3>
              <dl className="info-card__list">
                <div className="info-card__item">
                  <dt>HTTP API Base</dt>
                  <dd><code>{API_BASE_URL}</code></dd>
                </div>
                <div className="info-card__item">
                  <dt>WebSocket Base</dt>
                  <dd><code>{WS_BASE_URL}</code></dd>
                </div>
                <div className="info-card__item">
                  <dt>WS Path Pattern</dt>
                  <dd><code>/ws/chats/rooms/&lt;id&gt;/?token=&lt;jwt&gt;</code></dd>
                </div>
              </dl>
              <div className="info-card__notice">
                <p>
                  <strong>Close Codes Handled:</strong> <code>4001</code> (Unauthorized) &amp; <code>4003</code> (Forbidden / Not Room Member).
                </p>
              </div>
            </section>
          </aside>

          {/* Right Column: Live Chat Console */}
          <section className="app-content">
            <ChatPreviewBox
              messages={messages}
              errorBanner={errorBanner}
              onDismissError={handleDismissError}
              onSendMessage={handleSendMessage}
              isConnected={connectionStatus === ConnectionStatus.CONNECTED}
              activeRoom={activeRoom}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
