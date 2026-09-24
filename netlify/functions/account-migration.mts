import { getStore, listStores } from '@netlify/blobs';
import { admin } from '@netlify/identity';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import type { Config, Context } from '@netlify/functions';
import { STORES, requireId, identityProof, metadata, canonical, digest, planMigration, report, applyBlob } from './_shared/account-migration.mjs';

declare const Netlify: any;
const JOURNAL = 'aq-account-migration-v1';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const storeFor = (name: string) => getStore({ name, consistency: 'strong' });
function authorized(request: Request) {
  const secret = Netlify.env.get('AQ_ACCOUNT_MIGRATION_SECRET') || '';
  const provided = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const suppliedBytes = Buffer.from(provided), expectedBytes = Buffer.from(expected);
  return secret.length >= 32 && suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

export default async (request: Request, context: Context) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  if (context.deploy.context !== 'production' || Netlify.env.get('AQ_ACCOUNT_MIGRATION_MAINTENANCE') !== 'true') {
    return json({ error: 'production_maintenance_required' }, 409);
  }
  const journal = storeFor(JOURNAL);
  let lock: any;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: 'request_too_large' }, 413);
    const body = JSON.parse(raw);
    const oldUserId = requireId(body.oldUserId);
    const key = `captures/${oldUserId}.json`;
    const sb = createClient(Netlify.env.get('SUPABASE_URL'), Netlify.env.get('SUPABASE_SECRET_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const rpc = async (name: string, args = {}) => {
      const { data, error } = await sb.rpc(name, args);
      if (error) throw new Error('supabase_migration_rpc_failed');
      return data;
    };
    // A durable global lease serializes ALL accounts/plans, including failed retries.
    // Netlify terminates synchronous functions before this 120-second lease expires.
    const previous = await journal.getWithMetadata('lock.json', { type: 'json' });
    if (previous && previous.data.until > Date.now()) return json({ error: 'migration_busy_retry_later' }, 409);
    const acquired = await journal.setJSON('lock.json', { until: Date.now() + 120000, request: context.requestId }, previous ? { onlyIfMatch: previous.etag } : { onlyIfNew: true });
    if (!acquired.modified) return json({ error: 'migration_busy_retry_later' }, 409);
    lock = await journal.getWithMetadata('lock.json', { type: 'json' });
    // Keep a durable session across requests; different accounts must not interleave.
    const active: any = await journal.get('active.json', { type: 'json' });
    if (active && active.oldUserId !== oldUserId) throw new Error('another_account_migration_active');
    if (!active) {
      if (body.action !== 'capture') throw new Error('active_capture_required');
      const reserved = await journal.setJSON('active.json', { oldUserId, siteId: context.site.id }, { onlyIfNew: true });
      if (!reserved.modified) throw new Error('another_account_migration_active');
    }
    const started = Date.now();
    const snapshot = async () => {
      const discovered = await listStores(); // SDK automatically consumes all pages.
      const unknown = discovered.stores.filter(name => !STORES.includes(name) && name !== JOURNAL && name !== 'aq-mail-preview-v2' && !name.startsWith('aq-artist-drafts-v1-preview-'));
      if (unknown.length) throw new Error('unregistered_stores_review_required');
      const records: any[] = [], binaries: any[] = [];
      let size = 0;
      for (const name of STORES) {
        const store = storeFor(name);
        const { blobs } = await store.list();
        for (const blob of blobs) {
          if (Date.now() - started > 40000) throw new Error('inventory_too_large_use_offline_adapter');
          if (!blob.key.endsWith('.json')) {
            // Audio chunks have random asset IDs, unchanged by account migration.
            // Unknown binary layouts fail closed instead of being silently omitted.
            if (name !== 'aq-artist-drafts-v1-production' || !/^audio\/[a-zA-Z0-9-]+\/\d+$/.test(blob.key)) throw new Error('unknown_binary_layout');
            const meta = await store.getMetadata(blob.key);
            if (!meta) throw new Error('inventory_changed');
            binaries.push({ store: name, key: blob.key, ...meta });
            continue;
          }
          const item = await store.getWithMetadata(blob.key, { type: 'json' });
          if (!item) throw new Error('inventory_changed');
          const record = { store: name, key: blob.key, ...item };
          size += Buffer.byteLength(JSON.stringify(record));
          if (size > 4 * 1024 * 1024) throw new Error('inventory_too_large_use_offline_adapter');
          records.push(record);
        }
      }
      const messages = await rpc('aq_migration_snapshot');
      if (Buffer.byteLength(JSON.stringify(messages)) + size > 4 * 1024 * 1024) throw new Error('inventory_too_large_use_offline_adapter');
      records.sort((a, b) => `${a.store}:${a.key}`.localeCompare(`${b.store}:${b.key}`));
      binaries.sort((a, b) => `${a.store}:${a.key}`.localeCompare(`${b.store}:${b.key}`));
      return { records, binaries, messages };
    };
    if (body.action === 'capture') {
      const identity = identityProof(await admin.getUser(oldUserId));
      const inventory = await snapshot();
      const profile = inventory.records.find(r => r.store === 'aq-myspace-v1' && r.key === `profiles/${oldUserId}.json`);
      if (!identity.userMetadata.aquerty_mail && !profile?.data?.aquertyMail) throw new Error('aquerty_mail_missing_resolve_before_deletion');
      const capture = { version: 1, siteId: context.site.id, createdAt: new Date().toISOString(), identity, inventory };
      const saved = await journal.setJSON(key, capture, { onlyIfNew: true });
      if (!saved.modified) throw new Error('capture_already_exists_do_not_overwrite');
      const readback = await journal.get(key, { type: 'json' });
      if (digest(readback) !== digest(capture)) throw new Error('backup_verification_failed');
      return json({ captured: true, oldUserId, captureHash: digest(capture), records: inventory.records.length, messages: inventory.messages.length });
    }
    const capture: any = await journal.get(key, { type: 'json' });
    if (!capture || capture.siteId !== context.site.id) throw new Error('verified_capture_required');
    if (body.action === 'export') {
      // Includes private data: operator must store this outside the published site.
      return json(capture);
    }
    const newUserId = requireId(body.newUserId);
    if (newUserId === oldUserId) throw new Error('same_user_id');
    const planKey = `plans/${oldUserId}/${newUserId}.json`;
    const stateKey = `progress/${oldUserId}/${newUserId}.json`;
    const target = await admin.getUser(newUserId);
    if (identityProof(target).email !== capture.identity.email) throw new Error('email_mismatch');
    // The old identity may only be absent via a real 404, never an auth/network error.
    try {
      const old = await admin.getUser(oldUserId);
      if (canonical(identityProof(old)) !== canonical(capture.identity)) throw new Error('old_identity_changed');
    } catch (error: any) {
      if (error.status !== 404) throw error;
    }
    if (body.action === 'dry-run') {
      const live = await snapshot();
      if (digest(live) !== digest(capture.inventory)) throw new Error('inventory_changed_since_capture');
      const plan = planMigration(capture, live, target);
      const saved = await journal.setJSON(planKey, plan, { onlyIfNew: true });
      const existing: any = saved.modified ? plan : await journal.get(planKey, { type: 'json' });
      if (existing.hash !== plan.hash) throw new Error('plan_already_exists_with_different_content');
      return json(report(plan));
    }
    const plan: any = await journal.get(planKey, { type: 'json' });
    if (!plan || body.planHash !== plan.hash || plan.conflicts.length) throw new Error('approved_conflict_free_plan_required');
    const withoutMetadata = ({ userMetadata, ...proof }: any) => proof;
    if (canonical(withoutMetadata(identityProof(target))) !== canonical(withoutMetadata(plan.targetBefore))) throw new Error('target_identity_changed');
    let state: any = await journal.getWithMetadata(stateKey, { type: 'json' });
    const index = state?.data?.next || 0;
    if (body.action === 'apply') {
      if (!state) {
        if (digest(await snapshot()) !== plan.inventoryDigest) throw new Error('stale_plan');
        if (canonical(identityProof(target)) !== canonical(plan.targetBefore)) throw new Error('target_identity_changed');
        const initialized = await journal.setJSON(stateKey, { next: 0 }, { onlyIfNew: true });
        if (!initialized.modified) throw new Error('journal_conflict');
        state = await journal.getWithMetadata(stateKey, { type: 'json' });
      }
      // One operation per request: bounded execution, durable progress and safe retries.
      if (index < plan.operations.length) {
        const op = plan.operations[index];
        await applyBlob(storeFor(op.store), op);
      } else if (index === plan.operations.length) {
        await rpc('aq_migration_messages', { old_id: oldUserId, new_id: newUserId, expected: plan.messages });
      } else if (index === plan.operations.length + 1) {
        if (canonical(metadata(target)) !== canonical(plan.targetMetadata)) {
          if (canonical(identityProof(target)) !== canonical(plan.targetBefore)) throw new Error('target_identity_changed');
          await admin.updateUser(newUserId, { user_metadata: plan.targetMetadata });
        }
      } else return json({ complete: true, next: index, verificationRequired: true });
      const result = await journal.setJSON(stateKey, { next: index + 1, updatedAt: new Date().toISOString() }, state ? { onlyIfMatch: state.etag } : { onlyIfNew: true });
      if (!result.modified) throw new Error('journal_conflict');
      return json({ next: index + 1, complete: index + 1 === plan.operations.length + 2, verificationRequired: true });
    }
    if (body.action === 'verify') {
      if (index !== plan.operations.length + 2) throw new Error('migration_incomplete');
      const live = await snapshot();
      // Compare the WHOLE inventory, allowing only the approved writes and retained originals.
      const expected = new Map(capture.inventory.records.map((r: any) => [`${r.store}:${r.key}`, { ...r }]));
      for (const op of plan.operations) expected.set(`${op.store}:${op.key}`, { store: op.store, key: op.key, data: op.data, metadata: op.metadata });
      const strip = (r: any) => ({ store: r.store, key: r.key, data: r.data, metadata: r.metadata });
      if (live.records.length !== expected.size || live.records.some(r => canonical(strip(r)) !== canonical(strip(expected.get(`${r.store}:${r.key}`) || {})))) throw new Error('blob_verification_failed');
      if (canonical(live.binaries) !== canonical(capture.inventory.binaries)) throw new Error('binary_verification_failed');
      const expectedMessages = capture.inventory.messages.map((m: any) => ({ ...m, sender_id: m.sender_id === oldUserId ? newUserId : m.sender_id, recipient_id: m.recipient_id === oldUserId ? newUserId : m.recipient_id }));
      if (canonical(live.messages) !== canonical(expectedMessages)) throw new Error('message_verification_failed');
      if (canonical(metadata(target)) !== canonical(plan.targetMetadata)) throw new Error('identity_verification_failed');
      await journal.setJSON(`verified/${oldUserId}/${newUserId}.json`, { planHash: plan.hash, verifiedAt: new Date().toISOString(), retainedOldKeys: plan.retiredKeys });
      return json({ verified: true, retainedOldKeys: plan.retiredKeys, maintenanceMustRemainEnabledUntilManualCleanup: true });
    }
    return json({ error: 'unknown_action' }, 400);
  } catch (error: any) {
    // Do not expose SDK errors, tokens, email addresses or message content.
    const message = String(error?.message || 'migration_failed');
    return json({ error: /^[a-z_]+$/.test(message) ? message : 'migration_failed', retryOnlySamePlan: true }, 409);
  } finally {
    if (lock) await journal.setJSON('lock.json', { until: 0 }, { onlyIfMatch: lock.etag });
  }
};

export const config: Config = { path: '/api/admin/account-migration' };
