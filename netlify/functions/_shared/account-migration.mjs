import { createHash } from 'node:crypto';
import { artistIdFor } from './artist-identity.mjs';

export const STORES = ['aq-myspace-v1', 'aq-neo-user-state', 'aq-acc-identities-v1', 'aq-mail-v2', 'aq-artist-drafts-v1-production'];
export const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const metadata = user => user.userMetadata || user.user_metadata || {};
export function requireId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new Error('invalid_user_id');
  return id;
}
export function identityProof(user) {
  requireId(user?.id);
  if (!user.email) throw new Error('identity_email_missing');
  return { id: user.id, email: user.email.trim().toLowerCase(), userMetadata: metadata(user),
    roles: user.roles || user.app_metadata?.roles || user.appMetadata?.roles || [],
    createdAt: user.createdAt || user.created_at || null };
}

// Exact identities, path segments, query parameters and composite keys only.
// Human-authored text is not rewritten merely because it mentions an ID.
export function replaceReference(text, mapping) {
  if (mapping[text]) return mapping[text];
  return text.split(/(__|[/?=&.#])/).map(part => mapping[part] || part).join('');
}
const prose = new Set(['body', 'text', 'bio', 'name', 'displayName', 'title', 'description', 'lyrics']);
export function rewrite(value, mapping, field = '') {
  if (typeof value === 'string') return prose.has(field) ? value : replaceReference(value, mapping);
  if (Array.isArray(value)) return value.map(v => rewrite(v, mapping, field));
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value).map(([key, v]) => [replaceReference(key, mapping), rewrite(v, mapping, key)]);
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error('nested_key_collision');
  return Object.fromEntries(entries);
}

export function planMigration(capture, live, target) {
  const oldUserId = capture.identity.id, newUserId = requireId(target.id);
  if (oldUserId === newUserId) throw new Error('same_user_id');
  if (identityProof(target).email !== capture.identity.email) throw new Error('email_mismatch');
  const mapping = { [oldUserId]: newUserId };
  for (const item of live.records) {
    const d = item.data;
    if (d?.ownerId !== oldUserId) continue;
    for (const name of new Set([d.artist, d.publication?.artist, item.key.startsWith('artist-profiles/') && d.name].filter(Boolean))) {
      mapping[artistIdFor(oldUserId, name)] = artistIdFor(newUserId, name);
    }
  }
  const operations = [], conflicts = [], destinations = new Set();
  if (canonical([...identityProof(target).roles].sort()) !== canonical([...capture.identity.roles].sort())) {
    conflicts.push({ key: 'identity.roles', reason: 'restore_roles_manually_before_planning' });
  }
  const byKey = new Map(live.records.map(r => [`${r.store}:${r.key}`, r]));
  for (const before of live.records) {
    let key = replaceReference(before.key, mapping);
    const data = rewrite(before.data, mapping);
    if (before.store === 'aq-myspace-v1' && before.key.startsWith('friendships/') && data.users?.includes(newUserId)) {
      data.users.sort();
      data.id = data.users.join('__');
      key = `friendships/${data.id}.json`;
    }
    const meta = rewrite(before.metadata, mapping);
    if (key === before.key && canonical(data) === canonical(before.data) && canonical(meta) === canonical(before.metadata)) continue;
    const address = `${before.store}:${key}`;
    if (destinations.has(address)) conflicts.push({ key: address, reason: 'multiple_sources' });
    destinations.add(address);
    if (key !== before.key && byKey.has(address)) conflicts.push({ key: address, reason: 'destination_exists' });
    operations.push({ store: before.store, sourceKey: before.key, key, before, data, metadata: meta });
  }
  for (const binary of live.binaries) {
    if (replaceReference(binary.key, mapping) !== binary.key || canonical(rewrite(binary.metadata, mapping)) !== canonical(binary.metadata)) {
      conflicts.push({ key: `${binary.store}:${binary.key}`, reason: 'binary_reference_requires_adapter' });
    }
  }
  // A pre-existing target account may have allocated an ACC ID or created a profile.
  // Never merge or erase these silently, even if their contents happen to match.
  for (const record of live.records) {
    if (canonical(rewrite(record.data, { [newUserId]: '__TARGET__' })) !== canonical(record.data) || replaceReference(record.key, { [newUserId]: '__TARGET__' }) !== record.key) {
      conflicts.push({ key: `${record.store}:${record.key}`, reason: 'target_has_data' });
    }
  }
  const desiredMetadata = rewrite(capture.identity.userMetadata, mapping);
  const profile = live.records.find(r => r.store === 'aq-myspace-v1' && r.key === `profiles/${oldUserId}.json`);
  const mail = desiredMetadata.aquerty_mail || profile?.data?.aquertyMail;
  if (!mail) throw new Error('aquerty_mail_missing_resolve_before_deletion');
  desiredMetadata.aquerty_mail = mail;
  const currentMetadata = metadata(target);
  for (const [key, value] of Object.entries(currentMetadata)) {
    if (key in desiredMetadata && value !== '' && value !== null && canonical(value) !== canonical(desiredMetadata[key])) {
      conflicts.push({ key: `identity.user_metadata.${key}`, reason: 'metadata_collision' });
    }
  }
  const messages = live.messages.filter(m => m.sender_id === oldUserId || m.recipient_id === oldUserId);
  if (live.messages.some(m => m.sender_id === newUserId || m.recipient_id === newUserId)) conflicts.push({ key: 'myspace_messages', reason: 'target_has_messages' });
  // Materialize destination copies before switching any shared references.
  operations.sort((a, b) => Number(a.key === a.sourceKey) - Number(b.key === b.sourceKey));
  const plan = { oldUserId, newUserId, mapping, operations, messages, conflicts,
    targetBefore: identityProof(target), targetMetadata: { ...currentMetadata, ...desiredMetadata },
    inventoryDigest: digest(live), retiredKeys: operations.filter(o => o.key !== o.sourceKey).map(o => ({ store: o.store, key: o.sourceKey })) };
  return { ...plan, hash: digest(plan) };
}

export function report(plan) {
  return { oldUserId: plan.oldUserId, newUserId: plan.newUserId, planHash: plan.hash,
    conflicts: plan.conflicts, operations: plan.operations.map(o => ({ store: o.store, from: o.sourceKey, to: o.key })),
    messages: plan.messages.length, identityFields: Object.keys(plan.targetMetadata), retainedOldKeys: plan.retiredKeys,
    steps: plan.operations.length + 2 };
}

export async function applyBlob(store, op) {
  const source = await store.getWithMetadata(op.sourceKey, { type: 'json' });
  const current = op.key === op.sourceKey ? source : await store.getWithMetadata(op.key, { type: 'json' });
  // Safe retry after a write succeeded but the journal write did not.
  if (current && canonical(current.data) === canonical(op.data) && canonical(current.metadata) === canonical(op.metadata)) return;
  if (!source || source.etag !== op.before.etag) throw new Error('source_changed');
  if (op.key !== op.sourceKey && current) throw new Error('destination_exists');
  const result = await store.setJSON(op.key, op.data, { metadata: op.metadata,
    ...(op.key === op.sourceKey ? { onlyIfMatch: source.etag } : { onlyIfNew: true }) });
  if (!result.modified) throw new Error('concurrent_write');
}
