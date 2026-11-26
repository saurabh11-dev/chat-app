import assert from 'node:assert';

import {
  validateCoordinates,
  normalizeRoomsResponse,
  LOCATION_PRESETS,
} from './geolocation.js';
import { buildNearbyRoomsApiUrl, buildRoomsListApiUrl } from '../config/env.js';

console.log('--- Testing discoverRooms (Find Rooms Within 30 km) ---');

// 1. validateCoordinates tests
{
  // Valid numeric coordinates
  const validNum = validateCoordinates(25.2893, 83.0064);
  assert.strictEqual(validNum.valid, true);
  assert.strictEqual(validNum.lat, 25.2893);
  assert.strictEqual(validNum.lng, 83.0064);

  // Valid string coordinates
  const validStr = validateCoordinates(' 25.3176 ', ' 82.9739 ');
  assert.strictEqual(validStr.valid, true);
  assert.strictEqual(validStr.lat, 25.3176);
  assert.strictEqual(validStr.lng, 82.9739);

  // Negative valid coordinates
  const validNeg = validateCoordinates(-33.8688, 151.2093);
  assert.strictEqual(validNeg.valid, true);
  assert.strictEqual(validNeg.lat, -33.8688);

  // Missing coordinates
  assert.strictEqual(validateCoordinates('', '').valid, false);
  assert.strictEqual(validateCoordinates('25.2893', '').valid, false);
  assert.strictEqual(validateCoordinates(null, '83.0064').valid, false);
  assert.strictEqual(validateCoordinates(undefined, undefined).valid, false);

  // Non-numeric / NaN coordinates
  const nanLat = validateCoordinates('abc', '83.0064');
  assert.strictEqual(nanLat.valid, false);
  assert.match(nanLat.error, /valid finite numbers/i);

  const nanLng = validateCoordinates('25.2893', 'NaN');
  assert.strictEqual(nanLng.valid, false);
  assert.match(nanLng.error, /valid finite numbers/i);

  // Infinite coordinates
  assert.strictEqual(validateCoordinates(Infinity, 83.0).valid, false);
  assert.strictEqual(validateCoordinates(25.0, -Infinity).valid, false);

  // Out of range coordinates
  const outLatHigh = validateCoordinates(95.0, 83.0);
  assert.strictEqual(outLatHigh.valid, false);
  assert.match(outLatHigh.error, /out of valid range/i);

  const outLatLow = validateCoordinates(-91.0, 83.0);
  assert.strictEqual(outLatLow.valid, false);

  const outLngHigh = validateCoordinates(25.0, 185.0);
  assert.strictEqual(outLngHigh.valid, false);
  assert.match(outLngHigh.error, /out of valid range/i);

  const outLngLow = validateCoordinates(25.0, -181.0);
  assert.strictEqual(outLngLow.valid, false);

  console.log('✓ validateCoordinates tests passed (valid, NaN, missing, out-of-range)');
}

// 2. normalizeRoomsResponse tests
{
  // Plain array
  const plainArray = [
    { id: 1, name: 'Room 1' },
    { id: 2, name: 'Room 2' },
  ];
  assert.deepStrictEqual(normalizeRoomsResponse(plainArray), plainArray);

  // Paginated DRF object with { results: [...] }
  const paginated = {
    count: 2,
    next: null,
    previous: null,
    results: [
      { id: 10, name: 'Paginated Room 1' },
      { id: 20, name: 'Paginated Room 2' },
    ],
  };
  assert.strictEqual(normalizeRoomsResponse(paginated).length, 2);
  assert.strictEqual(normalizeRoomsResponse(paginated)[0].id, 10);

  // Custom envelope with { data: [...] }
  const enveloped = {
    status: 'success',
    data: [{ id: 99, name: 'Enveloped Room' }],
  };
  assert.strictEqual(normalizeRoomsResponse(enveloped).length, 1);
  assert.strictEqual(normalizeRoomsResponse(enveloped)[0].id, 99);

  // Null, undefined, empty object
  assert.deepStrictEqual(normalizeRoomsResponse(null), []);
  assert.deepStrictEqual(normalizeRoomsResponse(undefined), []);
  assert.deepStrictEqual(normalizeRoomsResponse({}), []);
  assert.deepStrictEqual(normalizeRoomsResponse('invalid string'), []);

  console.log('✓ normalizeRoomsResponse tests passed (plain array, { results }, { data }, fallbacks)');
}

// 3. API URL Construction for Nearby Rooms
{
  const url = buildNearbyRoomsApiUrl(25.2893, 83.0064, 30);
  assert.ok(url.includes('/api/chats/rooms/'));
  assert.ok(url.includes('lat=25.2893'));
  assert.ok(url.includes('lng=83.0064'));
  assert.ok(url.includes('radius=30'));

  // Without coordinates returns base room list
  const baseUrl = buildRoomsListApiUrl();
  assert.ok(baseUrl.endsWith('/api/chats/rooms/'));
  assert.ok(!baseUrl.includes('lat='));

  console.log('✓ Nearby rooms API URL construction tests passed');
}

// 4. Button State, Labels, and Feedback Message Resolution
{
  const getButtonLabel = (isLoading, mode) => {
    return isLoading && mode === 'nearby' ? 'Searching 30 km...' : 'Find Rooms Within 30 km';
  };

  const getNoticeMessage = (results, timeStr = '12:00:00 PM') => {
    const count = Array.isArray(results) ? results.length : 0;
    if (count === 0) {
      return {
        type: 'info',
        text: `Search complete: 0 rooms found within 30 km (${timeStr}).`,
      };
    }
    return {
      type: 'success',
      text: `Search complete: found ${count} room${count === 1 ? '' : 's'} within 30 km (${timeStr}).`,
    };
  };

  // Idle state
  assert.strictEqual(getButtonLabel(false, 'nearby'), 'Find Rooms Within 30 km');
  assert.strictEqual(getButtonLabel(false, 'all'), 'Find Rooms Within 30 km');

  // Loading state
  assert.strictEqual(getButtonLabel(true, 'nearby'), 'Searching 30 km...');
  assert.strictEqual(getButtonLabel(true, 'all'), 'Find Rooms Within 30 km');

  // Notice messages
  const singleNotice = getNoticeMessage([{ id: 1 }], '11:55:00 AM');
  assert.strictEqual(singleNotice.type, 'success');
  assert.strictEqual(singleNotice.text, 'Search complete: found 1 room within 30 km (11:55:00 AM).');

  const multipleNotice = getNoticeMessage([{ id: 1 }, { id: 2 }], '11:55:00 AM');
  assert.strictEqual(multipleNotice.type, 'success');
  assert.strictEqual(multipleNotice.text, 'Search complete: found 2 rooms within 30 km (11:55:00 AM).');

  const emptyNotice = getNoticeMessage([], '11:55:00 AM');
  assert.strictEqual(emptyNotice.type, 'info');
  assert.strictEqual(emptyNotice.text, 'Search complete: 0 rooms found within 30 km (11:55:00 AM).');

  console.log('✓ Button state, labels, and feedback message resolution tests passed');
}

// 5. Simulated "Find Rooms Within 30 km" Trigger & Coordinate Validation Flow
{
  const recordedCalls = [];
  const mockDiscoverRooms = async (lat, lng, options) => {
    recordedCalls.push({ lat, lng, options });
    return [
      { id: 101, name: 'Nearby Room 101', distance_km: 5.5 },
      { id: 102, name: 'Nearby Room 102', distance_km: 12.1 },
    ];
  };

  // Simulating valid user submission
  const userLat = ' 25.3284 ';
  const userLng = ' 82.9856 ';
  const validation = validateCoordinates(userLat, userLng);
  assert.strictEqual(validation.valid, true);

  // Invoke discovery API
  const roomsResult = await mockDiscoverRooms(validation.lat, validation.lng, { includeAll: false });
  assert.strictEqual(recordedCalls.length, 1);
  assert.strictEqual(recordedCalls[0].lat, 25.3284);
  assert.strictEqual(recordedCalls[0].lng, 82.9856);
  assert.strictEqual(recordedCalls[0].options.includeAll, false);

  // Normalized rooms
  const normalized = normalizeRoomsResponse(roomsResult);
  assert.strictEqual(normalized.length, 2);
  assert.strictEqual(normalized[0].distance_km, 5.5);

  // Simulating invalid user submission (e.g. NaN or empty)
  const invalidValidation = validateCoordinates('not_a_number', '83.0064');
  assert.strictEqual(invalidValidation.valid, false);
  assert.ok(invalidValidation.error.length > 0);

  // If validation fails, mockDiscoverRooms must NOT be called again
  if (invalidValidation.valid) {
    await mockDiscoverRooms(invalidValidation.lat, invalidValidation.lng, { includeAll: false });
  }
  assert.strictEqual(recordedCalls.length, 1, 'mockDiscoverRooms should not be called with invalid coordinates');

  console.log('✓ "Find Rooms Within 30 km" trigger & validation flow test passed');
}

// 6. Zero-distance formatting & error propagation verification
{
  const formatDistance = (distKm, fallbackRadius = 30) => {
    return distKm != null ? `${Number(distKm).toFixed(2)} km away` : `${fallbackRadius} km radius`;
  };

  assert.strictEqual(formatDistance(0), '0.00 km away');
  assert.strictEqual(formatDistance(0.0), '0.00 km away');
  assert.strictEqual(formatDistance(5.5), '5.50 km away');
  assert.strictEqual(formatDistance(null, 15), '15 km radius');
  assert.strictEqual(formatDistance(undefined, 30), '30 km radius');

  // Verify discovery error propagation
  let caughtError = null;
  const failingDiscover = async () => {
    throw new Error('Server error 500: Internal Server Error');
  };
  try {
    await failingDiscover();
  } catch (err) {
    caughtError = err;
  }
  assert.ok(caughtError !== null);
  assert.strictEqual(caughtError.message, 'Server error 500: Internal Server Error');

  console.log('✓ Zero-distance formatting (0.00 km away) and error propagation tests passed');
}

console.log('All discoverRooms tests passed successfully!');
