import React, { useState, useEffect } from 'react';
import { getBrowserLocation, LOCATION_PRESETS } from '../utils/geolocation';
import './CreateRoomView.css';

const RADIUS_PRESETS = [1, 5, 15, 30];

/**
 * CreateRoomView Component (/rooms/new)
 * Allows authenticated users to create a new geofenced chat room
 * pre-filled with their current/selected coordinates.
 */
export const CreateRoomView = ({
  initialLat = '25.2893',
  initialLng = '83.0064',
  onLatChange,
  onLngChange,
  onCreateRoom,
  isCreating = false,
  actionError = null,
  onDismissError,
  onBackToChats,
  onNavigateDiscover,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [radius, setRadius] = useState('30');
  const [latitude, setLatitude] = useState(String(initialLat || '25.2893'));
  const [longitude, setLongitude] = useState(String(initialLng || '83.0064'));

  useEffect(() => {
    if (initialLat) setLatitude(String(initialLat));
  }, [initialLat]);

  useEffect(() => {
    if (initialLng) setLongitude(String(initialLng));
  }, [initialLng]);

  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsNotice, setGpsNotice] = useState(null);
  const [localError, setLocalError] = useState(null);

  const handleUseCurrentLocation = async () => {
    setIsDetectingGps(true);
    setGpsNotice(null);
    setLocalError(null);
    try {
      const pos = await getBrowserLocation();
      const latStr = String(pos.lat);
      const lngStr = String(pos.lng);
      setLatitude(latStr);
      setLongitude(lngStr);
      onLatChange?.(latStr);
      onLngChange?.(lngStr);
      setGpsNotice({
        type: 'success',
        text: `Current location applied: ${pos.lat}, ${pos.lng} (±${pos.accuracy}m)`,
      });
    } catch (err) {
      setGpsNotice({ type: 'error', text: err.message });
    } finally {
      setIsDetectingGps(false);
    }
  };

  const handleApplyPreset = (preset) => {
    const latStr = String(preset.lat);
    const lngStr = String(preset.lng);
    setLatitude(latStr);
    setLongitude(lngStr);
    onLatChange?.(latStr);
    onLngChange?.(lngStr);
    setGpsNotice({ type: 'info', text: `Coordinates set to ${preset.name}` });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    onDismissError?.();

    const cleanName = name.trim();
    if (!cleanName) {
      setLocalError('Please enter a room name.');
      return;
    }

    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    if (
      latitude === '' ||
      longitude === '' ||
      !Number.isFinite(latNum) ||
      !Number.isFinite(lngNum) ||
      latNum < -90 ||
      latNum > 90 ||
      lngNum < -180 ||
      lngNum > 180
    ) {
      setLocalError('Coordinates must be valid numbers (lat: -90..90, lng: -180..180).');
      return;
    }

    const radiusNum = Number(radius);
    if (!Number.isFinite(radiusNum) || radiusNum <= 0 || radiusNum > 500) {
      setLocalError('Geofence radius must be greater than 0 and at most 500 km.');
      return;
    }

    await onCreateRoom?.({
      name: cleanName,
      description: description.trim(),
      latitude: latNum,
      longitude: lngNum,
      radius: radiusNum,
    });
  };

  const displayedError = localError || actionError;

  return (
    <div className="create-room-view">
      <div className="create-room-header">
        <div>
          <h2 className="create-room-header__title">Create New Geofenced Room</h2>
          <p className="create-room-header__subtitle">
            Set a location center and radius. You will automatically join as the room creator.
          </p>
        </div>
        <div className="create-room-header__actions">
          {onNavigateDiscover && (
            <button
              type="button"
              className="create-room-nav-btn"
              onClick={onNavigateDiscover}
            >
              Discover Rooms
            </button>
          )}
          <button
            type="button"
            className="create-room-nav-btn"
            onClick={onBackToChats}
          >
            ← Back to My Chats
          </button>
        </div>
      </div>

      <section className="create-room-card" aria-label="Create New Room Form">
        {displayedError && (
          <div className="create-room-alert create-room-alert--error" role="alert">
            <span>{displayedError}</span>
            <button
              type="button"
              className="create-room-alert__dismiss"
              onClick={() => {
                setLocalError(null);
                onDismissError?.();
              }}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        <form className="create-room-form" onSubmit={handleSubmit} noValidate>
          <div className="create-room-field">
            <label htmlFor="create-room-name" className="create-room-label">
              Room Name <span className="create-room-required">*</span>
            </label>
            <input
              id="create-room-name"
              type="text"
              className="create-room-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Assi Ghat Sunset Chat"
              maxLength={120}
              disabled={isCreating}
              required
            />
          </div>

          <div className="create-room-field">
            <label htmlFor="create-room-desc" className="create-room-label">
              Description <span className="create-room-optional">(optional)</span>
            </label>
            <textarea
              id="create-room-desc"
              className="create-room-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this local room about?"
              maxLength={500}
              disabled={isCreating}
            />
          </div>

          <div className="create-room-field">
            <div className="create-room-label-row">
              <label htmlFor="create-room-radius" className="create-room-label">
                Geofence Radius (km) <span className="create-room-required">*</span>
              </label>
              <div className="create-room-chips">
                {RADIUS_PRESETS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`create-room-chip ${Number(radius) === r ? 'create-room-chip--active' : ''}`}
                    onClick={() => setRadius(String(r))}
                    disabled={isCreating}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </div>
            <input
              id="create-room-radius"
              type="number"
              step="0.5"
              min="0.1"
              max="500"
              className="create-room-input create-room-input--mono"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              disabled={isCreating}
              required
            />
          </div>

          <div className="create-room-geo-box">
            <div className="create-room-geo-box__top">
              <h3 className="create-room-geo-box__title">Room Center Coordinates</h3>
              <button
                type="button"
                className="create-room-gps-btn"
                onClick={handleUseCurrentLocation}
                disabled={isDetectingGps || isCreating}
              >
                {isDetectingGps ? 'Detecting GPS...' : 'Use Current Location'}
              </button>
            </div>

            <div className="create-room-presets">
              <span className="create-room-presets__label">Presets:</span>
              <div className="create-room-chips">
                {LOCATION_PRESETS.map((preset) => {
                  const isActive =
                    String(preset.lat) === String(latitude) &&
                    String(preset.lng) === String(longitude);
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      className={`create-room-chip ${isActive ? 'create-room-chip--active' : ''}`}
                      onClick={() => handleApplyPreset(preset)}
                      disabled={isCreating}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="create-room-coords-grid">
              <div className="create-room-field">
                <label htmlFor="create-room-lat" className="create-room-label">
                  Latitude
                </label>
                <input
                  id="create-room-lat"
                  type="number"
                  step="any"
                  className="create-room-input create-room-input--mono"
                  value={latitude}
                  onChange={(e) => {
                    setLatitude(e.target.value);
                    onLatChange?.(e.target.value);
                  }}
                  disabled={isCreating}
                  required
                />
              </div>
              <div className="create-room-field">
                <label htmlFor="create-room-lng" className="create-room-label">
                  Longitude
                </label>
                <input
                  id="create-room-lng"
                  type="number"
                  step="any"
                  className="create-room-input create-room-input--mono"
                  value={longitude}
                  onChange={(e) => {
                    setLongitude(e.target.value);
                    onLngChange?.(e.target.value);
                  }}
                  disabled={isCreating}
                  required
                />
              </div>
            </div>

            {gpsNotice && (
              <p className={`create-room-notice create-room-notice--${gpsNotice.type}`}>
                {gpsNotice.text}
              </p>
            )}
          </div>

          <div className="create-room-actions">
            <button
              type="button"
              className="create-room-btn create-room-btn--secondary"
              onClick={onBackToChats}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="create-room-btn create-room-btn--primary"
              disabled={isCreating}
            >
              {isCreating ? 'Creating Room...' : 'Create & Open Room'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default CreateRoomView;
