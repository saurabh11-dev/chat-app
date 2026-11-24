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
