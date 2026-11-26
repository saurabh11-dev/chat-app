/**
 * Geolocation utility for GeoChat.
 * Provides browser GPS coordinate retrieval and test location presets.
 */

export const LOCATION_PRESETS = [
  {
    name: 'Assi Ghat (Varanasi)',
    lat: 25.2893,
    lng: 83.0064,
    description: 'Assi Ghat Hangout center (Room #1)',
  },
  {
    name: 'BHU Campus (Varanasi)',
    lat: 25.2677,
    lng: 82.9913,
    description: 'BHU Campus Connect (~2.8 km from Assi Ghat)',
  },
  {
    name: 'Sarnath (Varanasi)',
    lat: 25.3716,
    lng: 83.0252,
    description: 'Sarnath Tech Circle (~9.3 km from Assi Ghat)',
  },
  {
    name: 'Lucknow (Hazratganj)',
    lat: 26.8467,
    lng: 80.9462,
    description: 'Lucknow Metro Hub (~280 km from Varanasi)',
  },
];

/**
 * Retrieves the device's current GPS position via the HTML5 Geolocation API.
 *
 * @param {PositionOptions} [options]
 * @returns {Promise<{ lat: number, lng: number, accuracy: number }>}
 */
export function getBrowserLocation(options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      return reject(new Error('HTML5 Geolocation is not supported by your browser or environment.'));
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => {
        let msg = 'Failed to obtain GPS coordinates.';
        switch (err.code) {
          case 1: // PERMISSION_DENIED
            msg = 'Location permission denied by user. Please allow location access or choose a preset.';
            break;
          case 2: // POSITION_UNAVAILABLE
            msg = 'Location information is currently unavailable.';
            break;
          case 3: // TIMEOUT
            msg = 'Location request timed out.';
            break;
        }
        const error = new Error(msg);
        error.code = err.code;
        reject(error);
      },
      options
    );
  });
}

/**
 * Validates and normalizes latitude and longitude coordinates.
 * Returns { valid: true, lat: number, lng: number } or { valid: false, error: string }
 *
 * @param {number|string} lat
 * @param {number|string} lng
 * @returns {{ valid: boolean, lat?: number, lng?: number, error?: string }}
 */
export function validateCoordinates(lat, lng) {
  const cleanLat = lat != null ? String(lat).trim() : '';
  const cleanLng = lng != null ? String(lng).trim() : '';

  if (!cleanLat || !cleanLng) {
    return {
      valid: false,
      error: 'Please enter both latitude and longitude or select a preset location.',
    };
  }

  const numLat = Number(cleanLat);
  const numLng = Number(cleanLng);

  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
    return {
      valid: false,
      error: 'Latitude and longitude must be valid finite numbers.',
    };
  }

  if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
    return {
      valid: false,
      error: 'Coordinates out of valid range (latitude: -90..90, longitude: -180..180).',
    };
  }

  return {
    valid: true,
    lat: Number(numLat.toFixed(6)),
    lng: Number(numLng.toFixed(6)),
  };
}

/**
 * Normalizes rooms payload into a plain Array<object>.
 * Safely handles plain arrays `[...]`, paginated `{ results: [...] }`, and `{ data: [...] }`.
 *
 * @param {any} data
 * @returns {Array<object>}
 */
export function normalizeRoomsResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

