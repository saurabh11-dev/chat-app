import React from 'react';
import './JoinedRoomsSidebar.css';

/**
 * JoinedRoomsSidebar Component
 * Displays only the rooms/groups the authenticated user has already joined,
 * with quick selection to open chat and a CTA to discover new rooms (/discover).
 */
export const JoinedRoomsSidebar = ({
  joinedRooms = [],
  activeRoom = null,
  isConnected = false,
  isLoading = false,
  error = null,
  onSelectRoom,
  onRefresh,
  onNavigateDiscover,
  onNavigateCreateRoom,
  onLeaveRoom,
  isLeavingRoom = false,
}) => {
  return (
    <aside className="joined-sidebar" aria-label="Joined Groups">
      <div className="joined-sidebar__header">
        <div className="joined-sidebar__title-row">
          <h2 className="joined-sidebar__title">Joined Groups</h2>
          <span className="joined-sidebar__count">{joinedRooms.length}</span>
        </div>
        {onRefresh && (
          <button
            type="button"
            className="joined-sidebar__refresh-btn"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh joined groups"
            aria-label="Refresh joined groups"
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
              className={isLoading ? 'spin-icon' : ''}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        )}
      </div>

      <div className="joined-sidebar__actions-row">
        <button
          type="button"
          className="joined-sidebar__discover-cta"
          onClick={onNavigateDiscover}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Discover
        </button>
        {onNavigateCreateRoom && (
          <button
            type="button"
            className="joined-sidebar__create-cta"
            onClick={onNavigateCreateRoom}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create
          </button>
        )}
      </div>

      {error && (
        <div className="joined-sidebar__error" role="alert">
          <span>{error}</span>
          {onRefresh && (
            <button type="button" className="joined-sidebar__retry" onClick={onRefresh}>
              Retry
            </button>
          )}
        </div>
      )}

      <div className="joined-sidebar__list-wrap">
        {isLoading && joinedRooms.length === 0 ? (
          <div className="joined-sidebar__empty">
            <span className="joined-sidebar__spinner" />
            <p className="joined-sidebar__empty-title">Loading your groups...</p>
          </div>
        ) : joinedRooms.length === 0 ? (
          <div className="joined-sidebar__empty">
            <div className="joined-sidebar__empty-icon">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <p className="joined-sidebar__empty-title">No joined groups yet</p>
            <p className="joined-sidebar__empty-sub">
              Detect your location and join nearby rooms to start chatting.
            </p>
            <div className="joined-sidebar__empty-actions">
              <button
                type="button"
                className="joined-sidebar__empty-btn"
                onClick={onNavigateDiscover}
              >
                Discover Rooms
              </button>
              {onNavigateCreateRoom && (
                <button
                  type="button"
                  className="joined-sidebar__empty-btn joined-sidebar__empty-btn--create"
                  onClick={onNavigateCreateRoom}
                >
                  + Create Room
                </button>
              )}
            </div>
          </div>
        ) : (
          <ul className="joined-sidebar__list">
            {joinedRooms.map((room) => {
              const isSelected = activeRoom != null && String(activeRoom) === String(room.id);
              const isActiveLive = isSelected && isConnected;

              return (
                <li key={room.id} className="joined-sidebar__item">
                  <button
                    type="button"
                    className={`joined-room-btn ${isSelected ? 'joined-room-btn--selected' : ''}`}
                    onClick={() => onSelectRoom?.(room)}
                  >
                    <div className="joined-room-btn__top">
                      <span className="joined-room-btn__name">
                        <span className="joined-room-btn__hash">#</span>
                        {room.name}
                      </span>
                      {isActiveLive ? (
                        <span className="joined-room-btn__live-dot" title="Connected" />
                      ) : (
                        <span className="joined-room-btn__id">ID {room.id}</span>
                      )}
                    </div>
                    {room.description && (
                      <p className="joined-room-btn__desc">{room.description}</p>
                    )}
                  </button>

                  {isSelected && onLeaveRoom && (
                    <button
                      type="button"
                      className="joined-sidebar__leave-chip"
                      onClick={() => onLeaveRoom(room.id)}
                      disabled={isLeavingRoom}
                      title="Leave this room"
                    >
                      {isLeavingRoom ? '...' : 'Leave'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};

export default JoinedRoomsSidebar;
