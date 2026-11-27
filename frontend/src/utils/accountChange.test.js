import assert from 'node:assert';
import { buildUsernameAvailabilityApiUrl, buildUserProfileApiUrl } from '../config/env.js';

console.log('--- Testing accountChange (Username Availability & Profile) ---');

// 1. buildUsernameAvailabilityApiUrl
{
  const url1 = buildUsernameAvailabilityApiUrl('silent_falcon');
  assert(url1.includes('/api/accounts/username-availability/?username=silent_falcon'));

  // Strips leading @ and whitespace
  const url2 = buildUsernameAvailabilityApiUrl('  @Falcon_42  ');
  assert(url2.includes('/api/accounts/username-availability/?username=Falcon_42'));

  // Handles null / undefined
  const url3 = buildUsernameAvailabilityApiUrl(null);
  assert(url3.includes('/api/accounts/username-availability/?username='));

  console.log('✓ buildUsernameAvailabilityApiUrl tests passed');
}

// 2. buildUserProfileApiUrl
{
  const profileUrl = buildUserProfileApiUrl();
  assert(profileUrl.endsWith('/api/accounts/profile/'));
  console.log('✓ buildUserProfileApiUrl tests passed');
}

// 3. Username format regex validation
{
  const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

  const validUsernames = ['abc', 'user_123', 'SilentFalcon_42', 'JohnDoe', 'a'.repeat(30)];
  for (const u of validUsernames) {
    assert.strictEqual(USERNAME_REGEX.test(u), true, `Expected valid: ${u}`);
  }

  const invalidUsernames = [
    '',
    'ab', // too short (<3)
    'a'.repeat(31), // too long (>30)
    'user-name', // hyphen not allowed
    'user name', // spaces not allowed
    'user@name', // special characters not allowed
    'user.name', // dot not allowed
  ];
  for (const u of invalidUsernames) {
    assert.strictEqual(USERNAME_REGEX.test(u), false, `Expected invalid: ${u}`);
  }

  console.log('✓ Username format validation tests passed');
}

// 4. Availability status mapping logic
{
  function resolveAvailabilityStatus({ input, currentUsername, apiResult }) {
    const clean = String(input ?? '').trim().replace(/^@/, '');
    const current = String(currentUsername ?? '').trim().toLowerCase();

    if (!clean) return { valid: false, type: 'error', message: 'Username cannot be empty' };
    if (clean.toLowerCase() === current) return { valid: true, type: 'current', message: 'Current username' };
    if (clean.length < 3 || clean.length > 30) return { valid: false, type: 'error', message: 'Must be 3–30 chars' };
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) return { valid: false, type: 'error', message: 'Letters, numbers, _ only' };

    if (!apiResult) return { valid: false, type: 'checking', message: 'Checking...' };
    const isCurrent = Boolean(apiResult.is_current ?? apiResult.isCurrent);
    const isAvailable = Boolean(apiResult.available ?? apiResult.is_available);
    if (isCurrent) return { valid: true, type: 'current', message: 'Current username' };
    if (isAvailable) return { valid: true, type: 'available', message: 'Available' };
    return { valid: false, type: 'taken', message: apiResult.detail || 'Already taken' };
  }

  // Same as current
  assert.strictEqual(resolveAvailabilityStatus({ input: '@Tester_1', currentUsername: 'Tester_1' }).type, 'current');
  assert.strictEqual(resolveAvailabilityStatus({ input: 'tester_1', currentUsername: 'Tester_1' }).type, 'current');

  // Format errors
  assert.strictEqual(resolveAvailabilityStatus({ input: 'ab', currentUsername: 'Tester_1' }).type, 'error');
  assert.strictEqual(resolveAvailabilityStatus({ input: 'bad-handle', currentUsername: 'Tester_1' }).type, 'error');

  // Available from API
  assert.strictEqual(
    resolveAvailabilityStatus({ input: 'new_handle', currentUsername: 'Tester_1', apiResult: { available: true } }).type,
    'available'
  );

  // Taken from API (via available: false)
  assert.strictEqual(
    resolveAvailabilityStatus({
      input: 'taken_handle',
      currentUsername: 'Tester_1',
      apiResult: { available: false, detail: 'Already taken' },
    }).type,
    'taken'
  );

  // Taken from API (via is_available: false alternate key)
  assert.strictEqual(
    resolveAvailabilityStatus({
      input: 'taken_handle_2',
      currentUsername: 'Tester_1',
      apiResult: { is_available: false, detail: 'Username is already taken.' },
    }).type,
    'taken'
  );

  // Available from API (via is_available: true alternate key)
  assert.strictEqual(
    resolveAvailabilityStatus({
      input: 'cool_handle',
      currentUsername: 'Tester_1',
      apiResult: { is_available: true },
    }).type,
    'available'
  );

  console.log('✓ Availability status mapping tests passed');
}

// 5. Request cancellation & staleness guard logic
{
  let latestRequestedInput = '';

  function handleAvailabilityResponse({ requestedInput, res }) {
    if (requestedInput.toLowerCase() !== latestRequestedInput.toLowerCase()) {
      return null; // Discard stale response
    }
    const isAvailable = Boolean(res?.available ?? res?.is_available);
    const isCurrent = Boolean(res?.is_current ?? res?.isCurrent);
    if (isCurrent) return 'current';
    if (isAvailable) return 'available';
    return 'taken';
  }

  // User typed 'user_a'
  latestRequestedInput = 'user_a';
  // User then quickly typed 'user_ab'
  latestRequestedInput = 'user_ab';

  // Stale response arrives for 'user_a' -> should be discarded
  const staleResult = handleAvailabilityResponse({
    requestedInput: 'user_a',
    res: { available: true },
  });
  assert.strictEqual(staleResult, null);

  // Fresh response arrives for 'user_ab' -> accepted
  const freshResult = handleAvailabilityResponse({
    requestedInput: 'user_ab',
    res: { available: false, detail: 'Already taken' },
  });
  assert.strictEqual(freshResult, 'taken');

  console.log('✓ Request staleness guard tests passed');
}

console.log('All accountChange tests passed successfully!');

