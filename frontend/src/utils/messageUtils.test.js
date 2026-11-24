import assert from 'node:assert';
import {
  parseJwt,
  normalizeMessage,
  getMessageKey,
  sortMessagesChronologically,
  mergeMessages,
} from './messageUtils.js';

console.log('--- Testing messageUtils.js ---');

// 1. parseJwt
{
  // Test valid JWT with payload { "user_id": 42, "handle": "Falcon_99" }
  const payload = { user_id: 42, handle: 'Falcon_99' };
  const base64UrlPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `header.${base64UrlPayload}.signature`;
  const decoded = parseJwt(token);
  assert.strictEqual(decoded.user_id, 42);
  assert.strictEqual(decoded.handle, 'Falcon_99');

  // Test invalid token
  assert.strictEqual(parseJwt('invalid'), null);
  assert.strictEqual(parseJwt(''), null);
  assert.strictEqual(parseJwt(null), null);
  console.log('✓ parseJwt tests passed');
}

// 2. normalizeMessage
{
  const restMessage = {
    id: 101,
    room: 1,
    sender_handle: 'AlphaFalcon_10',
    content: 'Hello from REST',
    created_at: '2026-11-24T10:00:00.000Z',
  };
  const normRest = normalizeMessage(restMessage, { handle: 'AlphaFalcon_10', id: 99 });
  assert.strictEqual(normRest.id, 101);
  assert.strictEqual(normRest.room, 1);
  assert.strictEqual(normRest.sender_handle, 'AlphaFalcon_10');
  assert.strictEqual(normRest.content, 'Hello from REST');
  assert.strictEqual(normRest.is_own, true);

  const wsMessage = {
    id: 102,
    room: 1,
    sender_handle: 'BetaEcho_20',
    content: 'Hello from WebSocket',
    created_at: '2026-11-24T10:01:00.000Z',
  };
  const normWs = normalizeMessage(wsMessage, { handle: 'AlphaFalcon_10', id: 99 });
  assert.strictEqual(normWs.id, 102);
  assert.strictEqual(normWs.is_own, false);

  // Fallback field names: sender_username, message, timestamp
  const altMessage = {
    id: '103',
    room_id: '2',
    sender_username: 'GammaUser',
    message: 'Alt content',
    timestamp: '2026-11-24T10:02:00.000Z',
  };
  const normAlt = normalizeMessage(altMessage, null);
  assert.strictEqual(normAlt.id, '103');
  assert.strictEqual(normAlt.room, 2);
  assert.strictEqual(normAlt.sender_handle, 'GammaUser');
  assert.strictEqual(normAlt.content, 'Alt content');
  assert.strictEqual(normAlt.created_at, '2026-11-24T10:02:00.000Z');

  console.log('✓ normalizeMessage tests passed');
}

// 3. sortMessagesChronologically
{
  const unordered = [
    { id: 3, created_at: '2026-11-24T10:05:00.000Z' },
    { id: 1, created_at: '2026-11-24T10:00:00.000Z' },
    { id: 2, created_at: '2026-11-24T10:02:00.000Z' },
  ];
  const sorted = sortMessagesChronologically(unordered);
  assert.strictEqual(sorted[0].id, 1);
  assert.strictEqual(sorted[1].id, 2);
  assert.strictEqual(sorted[2].id, 3);

  // Equal timestamp sorted by id
  const sameTime = [
    { id: 5, created_at: '2026-11-24T10:00:00.000Z' },
    { id: 2, created_at: '2026-11-24T10:00:00.000Z' },
  ];
  const sortedSameTime = sortMessagesChronologically(sameTime);
  assert.strictEqual(sortedSameTime[0].id, 2);
  assert.strictEqual(sortedSameTime[1].id, 5);

  console.log('✓ sortMessagesChronologically tests passed');
}

// 4. mergeMessages
{
  // Test Scenario A: WebSocket message arrives in-flight while HTTP history is pending
  // 1. Initial empty state
  const state0 = [];

  // 2. WebSocket message arrives at 10:02:00
  const liveWsMsg = {
    id: 2,
    room: 1,
    sender_handle: 'UserB',
    content: 'Live message 2',
    created_at: '2026-11-24T10:02:00.000Z',
  };
  const state1 = mergeMessages(state0, liveWsMsg);
  assert.strictEqual(state1.length, 1);
  assert.strictEqual(state1[0].id, 2);

  // 3. HTTP history resolves with messages 1, 2, 3
  const httpHistory = [
    { id: 1, room: 1, sender_handle: 'UserA', content: 'History 1', created_at: '2026-11-24T10:00:00.000Z' },
    { id: 2, room: 1, sender_handle: 'UserB', content: 'Live message 2', created_at: '2026-11-24T10:02:00.000Z' },
    { id: 3, room: 1, sender_handle: 'UserC', content: 'History 3', created_at: '2026-11-24T10:03:00.000Z' },
  ];
  const state2 = mergeMessages(state1, httpHistory);

  // Verify: No duplicate message 2, chronological order preserved: 1, 2, 3
  assert.strictEqual(state2.length, 3);
  assert.strictEqual(state2[0].id, 1);
  assert.strictEqual(state2[1].id, 2);
  assert.strictEqual(state2[2].id, 3);
  console.log('✓ In-flight WebSocket + history merge deduplication passed');

  // Test Scenario B: Reconciling pending optimistic message
  const pendingMsg = {
    id: 'pending-999',
    room: 1,
    sender_handle: 'Me',
    content: 'Sending optimistic...',
    created_at: '2026-11-24T10:05:00.000Z',
    is_pending: true,
  };
  const withPending = mergeMessages(state2, pendingMsg);
  assert.strictEqual(withPending.length, 4);

  // Server confirms with real id=4
  const confirmedMsg = {
    id: 4,
    room: 1,
    sender_handle: 'Me',
    content: 'Sending optimistic...',
    created_at: '2026-11-24T10:05:00.000Z',
  };
  const afterConfirm = mergeMessages(withPending, confirmedMsg);
  assert.strictEqual(afterConfirm.length, 4);
  assert.strictEqual(afterConfirm[3].id, 4);
  assert.strictEqual(afterConfirm[3].is_pending, false);
  console.log('✓ Optimistic message reconciliation passed');

  // Test Scenario C: Fallback composite key deduplication when id is absent
  const noId1 = {
    sender_handle: 'Anon',
    content: 'Message without ID',
    created_at: '2026-11-24T10:10:00.000Z',
  };
  const noId2 = {
    sender_handle: 'Anon',
    content: 'Message without ID',
    created_at: '2026-11-24T10:10:00.000Z',
  };
  const mergedNoId = mergeMessages([noId1], noId2);
  assert.strictEqual(mergedNoId.length, 1);
  console.log('✓ Composite key fallback deduplication passed');
}

console.log('All messageUtils tests passed successfully!');
