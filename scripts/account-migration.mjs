// Operator client: never logs credentials or private snapshot contents.
import { writeFile } from 'node:fs/promises';
const [action, oldUserId, newUserId, argument] = process.argv.slice(2);
if (!['capture', 'export', 'dry-run', 'apply', 'verify'].includes(action) || !oldUserId) {
  throw new Error('Usage: node scripts/account-migration.mjs capture|export|dry-run|apply|verify oldUserId [newUserId] [planHash|backupPath]');
}
const base = new URL(process.env.AQ_MIGRATION_SITE_URL || '');
if (base.protocol !== 'https:') throw new Error('HTTPS required');
const secret = process.env.AQ_ACCOUNT_MIGRATION_SECRET;
if (!secret || secret.length < 32) throw new Error('AQ_ACCOUNT_MIGRATION_SECRET required');
async function call() {
  const response = await fetch(new URL('/api/admin/account-migration', base), {
    method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, oldUserId, newUserId: action === 'export' ? undefined : newUserId, planHash: argument }),
    signal: AbortSignal.timeout(65000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}
let result = await call();
if (action === 'export') {
  if (!newUserId) throw new Error('Export requires an absolute backup file path as the third argument');
  const { isAbsolute } = await import('node:path');
  if (!isAbsolute(newUserId)) throw new Error('Backup path must be absolute and outside the repository/publish directory');
  await writeFile(newUserId, JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
  console.log('Private backup saved; keep it outside the published site and source control.');
} else if (action === 'apply') {
  console.log(JSON.stringify(result));
  while (!result.complete) {
    result = await call();
    console.log(JSON.stringify(result));
  }
} else console.log(JSON.stringify(result, null, 2));
