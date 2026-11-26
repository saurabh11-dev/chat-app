import React, { useState, useEffect } from 'react';
import { getBrowserLocation, LOCATION_PRESETS } from '../utils/geolocation';
import './DiscoverRoomsView.css';

/**
 * DiscoverRoomsView Component (/discover)
 * Guides the user to detect or input coordinates, discovers nearby/active geo-rooms,
 * handles geofence validation feedback, and redirects back to / after joining.
 */
export const DiscoverRoomsView = ({
  lat,
  lng,
  onLatChange,
  onLngChange,
  rooms = [],
  roomListMode = 'nearby',
  isLoadingRooms = false,
  isJoiningRoom = false,
  joiningRoomId = null,
  actionError = null,
  onDismissError,
  onDiscoverRooms,
  onJoinRoom,
  onOpenJoinedRoom,
  onBackToChats,
  onNavigateCreateRoom,
}) => {
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsNotice, setGpsNotice] = useState(null);

  // Auto-fetch nearby rooms on mount if list is empty and coordinates exist
  useEffect(() => {
    if (rooms.length === 0 && lat !== '' && lng !== '' && onDiscoverRooms) {
      onDiscoverRooms(lat, lng, { includeAll: false });
    }
    // Only run on initial mount of Discover page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDetectGps = async () => {
    setIsDetectingGps(true);
    setGpsNotice(null);
    try {
      const pos = await getBrowserLocation();
      onLatChange?.(String(pos.lat));
      onLngChange?.(String(pos.lng));
      setGpsNotice({
        type: 'success',
        text: `GPS detected: ${pos.lat}, ${pos.lng} (±${pos.accuracy}m)`,
      });
      onDiscoverRooms?.(pos.lat, pos.lng, { includeAll: false });
    } catch (err) {
      setGpsNotice({ type: 'error', text: err.message });
    } finally {
      setIsDetectingGps(false);
    }
  };

  const handleApplyPreset = (preset) => {
    onLatChange?.(String(preset.lat));
    onLngChange?.(String(preset.lng));
    setGpsNotice({ type: 'info', text: `Location set to ${preset.name}` });
    onDiscoverRooms?.(preset.lat, preset.lng, { includeAll: false });
  };

  const handleSearchNearby = (e) => {
    e.preventDefault();
    onDiscoverRooms?.(lat, lng, { includeAll: false });
  };

  const handleBrowseAll = () => {
    onDiscoverRooms?.(lat, lng, { includeAll: true });
  };

  return (
    <div className="discover-view">
      {/* Page Header */}
      <div className="discover-header">
        <div>
          <h2 className="discover-header__title">Discover &amp; Join Geo-Rooms</h2>
          <p className="discover-header__subtitle">
            Share your coordinates to find rooms within a 30 km geofence and join to start chatting.
          </p>
        </div>
        <div className="discover-header__actions">
          {onNavigateCreateRoom && (
            <button
              type="button"
              className="discover-create-btn"
              onClick={onNavigateCreateRoom}
            >
              + Create Room
            </button>
          )}
          <button
            type="button"
            className="discover-back-btn"
            onClick={onBackToChats}
          >
            ← Back to My Chats
          </button>
        </div>
      </div>

      {/* Location Input Card */}
      <section className="discover-location-card" aria-label="Your Location">
        <div className="discover-location-card__top">
          <div className="discover-location-card__heading">
            <span className="discover-step-badge">1</span>
            <h3>Your Current Location</h3>
          </div>
          <button
            type="button"
            className="discover-gps-btn"
            onClick={handleDetectGps}
            disabled={isDetectingGps}
          >
            {isDetectingGps ? 'Detecting GPS...' : 'Detect My Location'}
          </button>
        </div>

        <div className="discover-presets">
          <span className="discover-presets__label">Quick Presets:</span>
          <div className="discover-presets__list">
            {LOCATION_PRESETS.map((preset) => {
              const isActive =
                String(preset.lat) === String(lat) && String(preset.lng) === String(lng);
              return (
                <button
                  key={preset.name}
                  type="button"
                  className={`discover-chip ${isActive ? 'discover-chip--active' : ''}`}
                  onClick={() => handleApplyPreset(preset)}
                  title={preset.description}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        <form className="discover-coords-form" onSubmit={handleSearchNearby}>
          <div className="discover-coords-inputs">
            <div className="discover-field">
              <label htmlFor="discover-lat-input">Latitude</label>
              <input
                id="discover-lat-input"
                type="number"
                step="any"
                value={lat}
                onChange={(e) => onLatChange?.(e.target.value)}
                placeholder="25.2893"
                required
              />
            </div>
            <div className="discover-field">
              <label htmlFor="discover-lng-input">Longitude</label>
              <input
                id="discover-lng-input"
                type="number"
                step="any"
                value={lng}
                onChange={(e) => onLngChange?.(e.target.value)}
                placeholder="83.0064"
                required
              />
            </div>
          </div>

          <div className="discover-search-actions">
            <button
              type="submit"
              className="discover-btn discover-btn--primary"
              disabled={isLoadingRooms}
            >
              {isLoadingRooms && roomListMode === 'nearby'
                ? 'Searching 30 km...'
                : 'Find Rooms Within 30 km'}
            </button>
            <button
              type="button"
              className="discover-btn discover-btn--secondary"
              onClick={handleBrowseAll}
              disabled={isLoadingRooms}
            >
              {isLoadingRooms && roomListMode === 'all'
                ? 'Loading...'
                : 'Browse All Active'}
            </button>
          </div>
        </form>

        {gpsNotice && (
          <p className={`discover-notice discover-notice--${gpsNotice.type}`}>
            {gpsNotice.text}
          </p>
        )}
      </section>

      {/* Geofence / Join / API Error Banner */}
      {actionError && (
        <div className="discover-error-alert" role="alert">
          <div className="discover-error-alert__content">
            <strong>Unable to complete action:</strong> {actionError}
          </div>
          {onDismissError && (
            <button
              type="button"
              className="discover-error-alert__dismiss"
              onClick={onDismissError}
              aria-label="Dismiss error"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Results Section */}
      <section className="discover-results" aria-label="Available Rooms">
        <div className="discover-results__header">
          <div className="discover-location-card__heading">
            <span className="discover-step-badge">2</span>
            <h3>
              {roomListMode === 'all'
                ? `All Active Rooms (${rooms.length})`
                : `Rooms Within 30 km (${rooms.length})`}
            </h3>
          </div>
          <span className="discover-results__hint">
            Joining verifies your coordinates against the room&apos;s geofence.
          </span>
        </div>

        {isLoadingRooms ? (
          <div className="discover-empty-card">
            <span className="discover-spinner" />
            <p>Scanning for geo-rooms...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="discover-empty-card">
            <p className="discover-empty-card__title">
              {roomListMode === 'all'
                ? 'No active rooms exist yet.'
                : 'No rooms found within 30 km of these coordinates.'}
            </p>
            <p className="discover-empty-card__sub">
              Try detecting your GPS, selecting a preset location, or clicking{' '}
              <strong>Browse All Active</strong> to view all rooms.
            </p>
            {onNavigateCreateRoom && (
              <button
                type="button"
                className="discover-empty-card__create-btn"
                onClick={onNavigateCreateRoom}
              >
                + Create Geofenced Room Here
              </button>
            )}
          </div>
        ) : (
          <div className="discover-grid">
            {rooms.map((room) => {
              const isThisJoining =
                isJoiningRoom && String(joiningRoomId) === String(room.id);

              return (
                <article
                  key={room.id}
                  className={`discover-room-card ${room.is_member ? 'discover-room-card--joined' : ''}`}
                >
                  <div className="discover-room-card__top">
                    <h4 className="discover-room-card__title">
                      <span className="discover-room-card__hash">#</span>
                      {room.name}
                    </h4>
                    <span className="discover-room-card__distance">
                      {room.distance_km != null
                        ? `${room.distance_km} km away`
                        : `${room.radius_km || 30} km radius`}
                    </span>
                  </div>

                  {room.description && (
                    <p className="discover-room-card__desc">{room.description}</p>
                  )}

                  <div className="discover-room-card__meta">
                    <span>Room ID: {room.id}</span>
                    <span>Geofence: {room.radius_km || 30} km</span>
                  </div>

                  <div className="discover-room-card__actions">
                    {room.is_member ? (
                      <>
                        <span className="discover-joined-pill">Already Joined</span>
                        <button
                          type="button"
                          className="discover-btn discover-btn--open"
                          onClick={() => onOpenJoinedRoom?.(room)}
                        >
                          Open Chat →
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="discover-btn discover-btn--join"
                        onClick={() => onJoinRoom?.(room.id, lat, lng)}
                        disabled={isJoiningRoom}
                      >
                        {isThisJoining ? 'Joining...' : 'Join Room'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default DiscoverRoomsView;
