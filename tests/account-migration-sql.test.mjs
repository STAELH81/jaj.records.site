import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Supabase transaction, freeze, permissions, collision checks and retries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.myspace_messages(id uuid primary key, sender_id uuid, recipient_id uuid, body text, read_at timestamptz);
      insert into myspace_messages values ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'preserve me', null);`);
    await db.exec(await readFile(new URL('../ops/account-migration.sql', import.meta.url), 'utf8'));
    await assert.rejects(db.query('select aq_migration_snapshot()'), /database_maintenance_required/);
    await db.exec('update aq_account_migration_control set maintenance = true');
    await assert.rejects(db.exec("update myspace_messages set body = 'lost'"), /account_migration_maintenance/);
    await assert.rejects(db.exec('delete from myspace_messages'), /account_migration_maintenance/);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select aq_migration_snapshot()'), /permission denied/);
    await db.exec('reset role');
    const snapshot = (await db.query('select aq_migration_snapshot() as value')).rows[0].value;
    const args = ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', JSON.stringify(snapshot)];
    await assert.rejects(db.query('select aq_migration_messages($1,$2,$3)', [args[0], args[1], '[]']), /messages_changed/);
    await db.exec('set role service_role');
    await db.query('select aq_migration_messages($1,$2,$3)', args);
    const retried = (await db.query('select aq_migration_messages($1,$2,$3) as value', args)).rows[0].value;
    assert.equal(retried.alreadyApplied, true);
    await db.exec('reset role');
    const row = (await db.query('select * from myspace_messages')).rows[0];
    assert.equal(row.sender_id, args[1]);
    assert.equal(row.body, 'preserve me');
    assert.equal(row.read_at, null);
    await assert.rejects(db.exec("update myspace_messages set body = 'still frozen'"), /account_migration_maintenance/);
    await db.exec('create table other_data(user_id uuid)');
    await assert.rejects(db.query('select aq_migration_snapshot()'), /unregistered_user_columns/);
  } finally { await db.close(); }
});
