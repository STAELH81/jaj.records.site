-- Install once through the Supabase SQL editor as database owner.
-- This migration is dormant until the operator explicitly enables maintenance.
begin;
create table if not exists public.aq_account_migration_control (
  singleton boolean primary key default true check (singleton),
  maintenance boolean not null default false
);
insert into public.aq_account_migration_control(singleton) values (true) on conflict do nothing;
alter table public.aq_account_migration_control enable row level security;
revoke all on public.aq_account_migration_control from public, anon, authenticated;

create or replace function public.aq_migration_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if (select maintenance from public.aq_account_migration_control where singleton)
     and coalesce(current_setting('aq.account_migration', true), '') <> 'on' then
    raise exception 'account_migration_maintenance';
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;
drop trigger if exists aq_account_migration_guard on public.myspace_messages;
create trigger aq_account_migration_guard before insert or update or delete
on public.myspace_messages for each row execute function public.aq_migration_guard();

create or replace function public.aq_migration_snapshot() returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if (select maintenance from public.aq_account_migration_control where singleton) is distinct from true then
    raise exception 'database_maintenance_required';
  end if;
  -- New user-indexed tables/columns require a reviewed adapter.
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and column_name ~ '(user_?id|owner_?id|sender_?id|recipient_?id|author_?id)$'
    and not (table_name = 'myspace_messages' and column_name in ('sender_id','recipient_id'))) then
    raise exception 'unregistered_user_columns';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(m) order by m.id::text), '[]'::jsonb) from public.myspace_messages m);
end $$;

create or replace function public.aq_migration_messages(old_id text, new_id text, expected jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare actual jsonb; desired jsonb; changed integer;
begin
  if old_id = new_id or coalesce(old_id, '') = '' or coalesce(new_id, '') = '' or jsonb_typeof(expected) is distinct from 'array' then
    raise exception 'invalid_migration';
  end if;
  lock table public.myspace_messages in exclusive mode;
  if (select maintenance from public.aq_account_migration_control where singleton) is distinct from true then
    raise exception 'database_maintenance_required';
  end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.id::text), '[]'::jsonb) into actual
  from public.myspace_messages m
  where m.sender_id::text in (old_id,new_id) or m.recipient_id::text in (old_id,new_id);
  select coalesce(jsonb_agg(value || jsonb_build_object(
    'sender_id', case when value->>'sender_id' = old_id then new_id else value->>'sender_id' end,
    'recipient_id', case when value->>'recipient_id' = old_id then new_id else value->>'recipient_id' end)
    order by value->>'id'), '[]'::jsonb) into desired from jsonb_array_elements(expected);
  if actual = desired then return jsonb_build_object('alreadyApplied',true); end if;
  if actual <> expected then raise exception 'messages_changed_or_target_not_empty'; end if;
  perform set_config('aq.account_migration','on',true);
  -- jsonb_populate_record casts to the actual column type (text or uuid).
  update public.myspace_messages m set
    sender_id = (jsonb_populate_record(null::public.myspace_messages, d.value)).sender_id,
    recipient_id = (jsonb_populate_record(null::public.myspace_messages, d.value)).recipient_id
  from jsonb_array_elements(desired) d(value) where m.id::text = d.value->>'id';
  get diagnostics changed = row_count;
  if changed <> jsonb_array_length(expected) then raise exception 'message_count_mismatch'; end if;
  return jsonb_build_object('updated',changed);
end $$;
revoke all on function public.aq_migration_guard() from public, anon, authenticated;
revoke all on function public.aq_migration_snapshot() from public, anon, authenticated;
revoke all on function public.aq_migration_messages(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.aq_migration_snapshot() to service_role;
grant execute on function public.aq_migration_messages(text,text,jsonb) to service_role;
commit;
