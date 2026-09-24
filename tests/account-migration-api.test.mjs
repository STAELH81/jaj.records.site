import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

test('protected API capture → dry-run → interrupted apply → resume → full verification', async () => {
  const stores = new Map();
  let version = 0, failProgress = false;
  function getStore({ name }) {
    if (!stores.has(name)) stores.set(name, new Map());
    const rows = stores.get(name);
    return {
      list: async () => ({ blobs: [...rows.keys()].map(key => ({ key })) }),
      get: async key => structuredClone(rows.get(key)?.data ?? null),
      getMetadata: async key => { const r = rows.get(key); return r && { etag: r.etag, metadata: r.metadata }; },
      getWithMetadata: async key => structuredClone(rows.get(key) ?? null),
      setJSON: async (key, data, opts = {}) => {
        if (failProgress && key.startsWith('progress/') && data.next === 1) { failProgress = false; throw new Error('simulated_failure'); }
        const existing = rows.get(key);
        if ((opts.onlyIfNew && existing) || (opts.onlyIfMatch && existing?.etag !== opts.onlyIfMatch)) return { modified: false };
        rows.set(key, { data: structuredClone(data), etag: String(++version), metadata: opts.metadata || {} });
        return { modified: true };
      },
    };
  }
  const old = 'old-user-123', next = 'new-user-123';
  const identities = new Map([[old, { id: old, email: 'cha@example.test', userMetadata: { aquerty_mail: 'cha@aquerty.fr' } }]]);
  const updates = [];
  const admin = {
    getUser: async id => { if (!identities.has(id)) throw Object.assign(new Error('not_found'), { status: 404 }); return structuredClone(identities.get(id)); },
    updateUser: async (id, attrs) => { updates.push(id); identities.get(id).userMetadata = attrs.user_metadata; },
  };
  let messages = [{ id: '1', sender_id: old, recipient_id: 'peer-user-123', body: 'private', read_at: null }];
  mock.module('@netlify/blobs', { namedExports: { getStore, listStores: async () => ({ stores: [...stores.keys()] }) } });
  mock.module('@netlify/identity', { namedExports: { admin } });
  mock.module('@supabase/supabase-js', { namedExports: { createClient: () => ({ rpc: async (name, args) => {
    if (name === 'aq_migration_messages') messages = messages.map(m => ({ ...m, sender_id: m.sender_id === args.old_id ? args.new_id : m.sender_id, recipient_id: m.recipient_id === args.old_id ? args.new_id : m.recipient_id }));
    return { data: structuredClone(messages), error: null };
  } }) } });
  const secret = 'a'.repeat(40);
  globalThis.Netlify = { env: { get: name => ({ AQ_ACCOUNT_MIGRATION_SECRET: secret, AQ_ACCOUNT_MIGRATION_MAINTENANCE: 'true' })[name] } };
  const handler = (await import('../netlify/functions/account-migration.mts')).default;
  const context = { deploy: { context: 'production' }, site: { id: 'test-site' }, requestId: 'request' };
  const call = async (body, token = secret, ctx = context) => {
    const response = await handler(new Request('https://example.test/api/admin/account-migration', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ oldUserId: old, newUserId: next, ...body }) }), ctx);
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await call({ action: 'capture' }, 'wrong')).status, 401);
    assert.equal((await call({ action: 'capture' }, secret, { ...context, deploy: { context: 'deploy-preview' } })).status, 409);
    await getStore({ name: 'aq-myspace-v1' }).setJSON(`profiles/${old}.json`, { userId: old, bio: 'keep', aquertyMail: 'cha@aquerty.fr' });
    assert.equal((await call({ action: 'capture' })).body.captured, true);
    assert.equal((await call({ action: 'capture', oldUserId: 'other-user-123' })).body.error, 'another_account_migration_active');
    assert.equal(updates.length, 0);
    const backup = (await call({ action: 'export' })).body;
    assert.equal(backup.identity.id, old);
    assert.equal((await call({ action: 'capture' })).body.error, 'capture_already_exists_do_not_overwrite');
    // Simulate the operator's manual recreation, not an API operation.
    identities.delete(old);
    identities.set(next, { id: next, email: 'cha@example.test', userMetadata: {} });
    const dry = await call({ action: 'dry-run' });
    assert.equal(dry.status, 200, JSON.stringify(dry.body));
    assert.deepEqual(dry.body.conflicts, []);
    assert.equal(updates.length, 0);
    assert.equal((await call({ action: 'apply', planHash: 'wrong' })).status, 409);
    failProgress = true;
    assert.equal((await call({ action: 'apply', planHash: dry.body.planHash })).body.error, 'simulated_failure');
    let result;
    for (let i = 0; i < 5; i++) {
      result = await call({ action: 'apply', planHash: dry.body.planHash });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      if (result.body.complete) break;
    }
    assert.equal(result.body.complete, true);
    assert.deepEqual(updates, [next]);
    assert.equal((await call({ action: 'verify', planHash: dry.body.planHash })).body.verified, true);
    assert.ok(await getStore({ name: 'aq-myspace-v1' }).get(`profiles/${old}.json`), 'old data is retained');
    await getStore({ name: 'aq-myspace-v1' }).setJSON('unexpected.json', { userId: old });
    assert.equal((await call({ action: 'verify', planHash: dry.body.planHash })).body.error, 'blob_verification_failed');
  } finally { delete globalThis.Netlify; mock.restoreAll(); }
});
