import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMigration, rewrite, applyBlob, identityProof } from '../netlify/functions/_shared/account-migration.mjs';
import { artistIdFor } from '../netlify/functions/_shared/artist-identity.mjs';
import { withMigrationMaintenance } from '../netlify/functions/_shared/migration-maintenance.mjs';

const old = 'zzzz-old-id', next = 'aaaa-new-id', peer = 'mmmm-peer-id';
const record = (key, data, store = 'aq-myspace-v1') => ({ store, key, data, metadata: {}, etag: 'v1' });
const identity = identityProof({ id: old, email: 'cha@example.test', userMetadata: { aquerty_mail: 'cha@aquerty.fr' } });
const target = { id: next, email: identity.email };
const capture = { identity };
function inventory(records = []) { return { records, messages: [], binaries: [] }; }

test('all social structures, cloud, metadata and computed artist IDs migrate', () => {
  const artist = artistIdFor(old, 'Cha');
  const records = [
    record(`profiles/${old}.json`, { userId: old, avatar: 'data:image/png;base64,AAAA', bio: 'hello', style: 'blue', topFriendIds: [peer] }),
    record(`profiles/${peer}.json`, { topFriendIds: [old] }),
    record(`friendships/${peer}__${old}.json`, { id: `${peer}__${old}`, users: [peer, old] }),
    record(`friend-requests/${old}/request.json`, { senderId: peer, recipientId: old }),
    record(`profile-comments/${old}/comment.json`, { targetUserId: old, authorId: peer }),
    record('posts/post.json', { authorId: old }), record('comments/post/comment.json', { authorId: old }),
    record(`reactions/post/${old}.json`, { userId: old }), record(`presence/${old}.json`, { userId: old, lastSeenAt: '2026-01-01' }),
    record('forum-requests/request.json', { requesterId: old }), record('topics/topic.json', { approvedBy: old }),
    record('topic-replies/topic/reply.json', { authorId: old }),
    record(`users/${old}.json`, { nested: { favorites: [{ owner: old }], [old]: 'ok' } }, 'aq-neo-user-state'),
    record('ids/123.json', { userId: old }, 'aq-acc-identities-v1'),
    record(`player-libraries/${old}.json`, { playlists: [{ tracks: [{ artistId: artist }] }] }, 'aq-artist-drafts-v1-production'),
    record('drafts/draft.json', { ownerId: old, artist: 'Cha' }, 'aq-artist-drafts-v1-production'),
    record(`artist-profiles/${artist}.json`, { id: artist, name: 'Cha', ownerId: old }, 'aq-artist-drafts-v1-production'),
    record('audio/asset/manifest.json', { ownerId: old }, 'aq-artist-drafts-v1-production'),
  ];
  const plan = planMigration(capture, inventory(records), target);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.operations.length, records.length);
  const friendship = plan.operations.find(o => o.key.startsWith('friendships/'));
  assert.equal(friendship.key, `friendships/${next}__${peer}.json`);
  assert.deepEqual(friendship.data.users, [next, peer]);
  assert.equal(plan.mapping[artist], artistIdFor(next, 'Cha'));
  assert.equal(plan.operations[0].data.avatar, records[0].data.avatar);
  assert.equal(records[0].data.userId, old, 'source snapshot is immutable');
});

test('replacement is bounded and preserves prose and unrelated substrings', () => {
  const result = rewrite({ body: old, bio: old, id: old, url: `/api/profile?userId=${old}`, other: `prefix${old}suffix` }, { [old]: next });
  assert.deepEqual(result, { body: old, bio: old, id: next, url: `/api/profile?userId=${next}`, other: `prefix${old}suffix` });
  assert.throws(() => rewrite({ [old]: 1, [next]: 2 }, { [old]: next }), /nested_key_collision/);
});

test('same IDs, different email, collisions, target messages and role changes block', () => {
  assert.throws(() => planMigration(capture, inventory(), { ...target, id: old }), /same_user_id/);
  assert.throws(() => planMigration(capture, inventory(), { ...target, email: 'different@example.test' }), /email_mismatch/);
  const live = inventory([record(`profiles/${old}.json`, { userId: old }), record(`profiles/${next}.json`, { userId: next })]);
  live.messages = [{ sender_id: next, recipient_id: peer }];
  const plan = planMigration(capture, live, { ...target, roles: ['admin'], userMetadata: { aquerty_mail: 'taken@aquerty.fr' } });
  for (const reason of ['destination_exists', 'target_has_data', 'target_has_messages', 'metadata_collision', 'restore_roles_manually_before_planning']) {
    assert.ok(plan.conflicts.some(c => c.reason === reason), reason);
  }
});

test('conditional writes reject stale data and safely resume a completed copy', async () => {
  const source = record(`profiles/${old}.json`, { userId: old });
  const op = planMigration(capture, inventory([source]), target).operations[0];
  const rows = new Map([[source.key, source]]);
  let writes = 0;
  const store = { getWithMetadata: async key => rows.get(key) || null,
    setJSON: async (key, data, options) => { writes++; assert.equal(options.onlyIfNew, true); rows.set(key, { data, metadata: options.metadata, etag: 'v2' }); return { modified: true }; } };
  await applyBlob(store, op);
  await applyBlob(store, op);
  assert.equal(writes, 1);
  assert.equal(rows.get(source.key).data.userId, old);
  rows.delete(op.key);
  rows.set(source.key, { ...source, etag: 'changed' });
  await assert.rejects(applyBlob(store, op), /source_changed/);
});

test('maintenance blocks GET side effects and forwards normally when disabled', async () => {
  let calls = 0;
  const handler = withMigrationMaintenance(() => { calls++; return new Response('ok'); });
  globalThis.Netlify = { env: { get: () => 'true' } };
  assert.equal((await handler(new Request('https://example.test'))).status, 503);
  assert.equal(calls, 0);
  globalThis.Netlify = { env: { get: () => undefined } };
  assert.equal((await handler(new Request('https://example.test'))).status, 200);
  delete globalThis.Netlify;
});
