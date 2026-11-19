-- 40_verify_0010_triggers.sql — structural verification of migration 0010 (derived visibility flag
-- and the SECURITY INVOKER triggers that maintain it). Runtime behaviour is exercised in
-- 80_trusted_writer_privileges.sql.
\set ON_ERROR_STOP 1

\echo === [INFO] derived column ===
select table_schema, table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profile_publications'
  and column_name = 'is_publicly_visible';

\echo === [INFO] triggers on publications/snapshots ===
select c.relname as table_name, t.tgname, p.proname, t.tgenabled, pg_get_triggerdef(t.oid) as def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and c.relname in ('profile_publications', 'profile_public_snapshots')
  and not t.tgisinternal
order by 1, 2;

\echo === [HARD] derived column is boolean NOT NULL default false ===
do $$
declare
  r record;
begin
  select a.attnotnull, t.typname, pg_get_expr(d.adbin, d.adrelid) as def
    into r
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.profile_publications'::regclass
    and a.attname = 'is_publicly_visible';
  if r is null then
    raise exception '0010: column is_publicly_visible is missing';
  end if;
  if not r.attnotnull then
    raise exception '0010: is_publicly_visible must be NOT NULL';
  end if;
  if r.typname <> 'bool' then
    raise exception '0010: is_publicly_visible must be boolean, got %', r.typname;
  end if;
  if r.def is distinct from 'false' then
    raise exception '0010: is_publicly_visible default should be false, got %', coalesce(r.def, '<none>');
  end if;
  raise notice '0010: derived column shape: OK';
end
$$;

\echo === [HARD] both maintenance triggers exist with the expected timing/events ===
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profile_publications'::regclass
      and tgname = 'trg_sync_publication_visibility'
      and tgtype & 2 = 2          -- BEFORE
      and tgtype & 4 = 4          -- INSERT
      and tgtype & 16 = 16        -- UPDATE
  ) then
    raise exception '0010: BEFORE INSERT/UPDATE trigger trg_sync_publication_visibility missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profile_public_snapshots'::regclass
      and tgname = 'trg_sync_snapshot_parent_visibility'
      and tgtype & 1 = 1          -- ROW
      and tgtype & 2 = 0          -- AFTER (not BEFORE)
      and tgtype & 4 = 4          -- INSERT
      and tgtype & 8 = 8          -- DELETE
      and tgtype & 16 = 16        -- UPDATE
  ) then
    raise exception '0010: AFTER trigger trg_sync_snapshot_parent_visibility missing';
  end if;
  raise notice '0010: maintenance triggers present: OK';
end
$$;

\echo === [HARD] trigger functions are SECURITY INVOKER with a fixed search_path ===
do $$
declare
  r record;
begin
  for r in
    select p.proname, p.prosecdef, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('sync_publication_visibility', 'sync_snapshot_parent_visibility')
    order by 1
  loop
    if r.prosecdef then
      raise exception '0010: % must be SECURITY INVOKER, not SECURITY DEFINER', r.proname;
    end if;
    if r.proconfig is null or not exists (
      select 1 from unnest(r.proconfig) as c where c like 'search_path=%'
    ) then
      raise exception '0010: % must set search_path', r.proname;
    end if;
  end loop;
  raise notice '0010: trigger functions are SECURITY INVOKER with search_path: OK';
end
$$;

\echo === [HARD] internal functions are not executable by anon/authenticated/public ===
do $$
begin
  if has_function_privilege('anon', 'public.sync_publication_visibility()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sync_publication_visibility()', 'EXECUTE')
     or has_function_privilege('public', 'public.sync_publication_visibility()', 'EXECUTE') then
    raise exception '0010: sync_publication_visibility is executable by a public role';
  end if;
  if has_function_privilege('anon', 'public.sync_snapshot_parent_visibility()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sync_snapshot_parent_visibility()', 'EXECUTE')
     or has_function_privilege('public', 'public.sync_snapshot_parent_visibility()', 'EXECUTE') then
    raise exception '0010: sync_snapshot_parent_visibility is executable by a public role';
  end if;
  if not has_function_privilege('service_role', 'public.sync_publication_visibility()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.sync_snapshot_parent_visibility()', 'EXECUTE') then
    raise exception '0010: trusted writer service_role must be able to execute the trigger functions';
  end if;
  raise notice '0010: function execute privileges: OK';
end
$$;

\echo === [HARD] public publication policy is self-sufficient USING (is_publicly_visible) ===
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profile_publications'
      and policyname = 'share_select_published_publications'
      and cmd = 'SELECT'
      and qual = 'is_publicly_visible'
  ) then
    raise exception '0010: share_select_published_publications must be USING (is_publicly_visible)';
  end if;
  raise notice '0010: self-sufficient publication policy: OK';
end
$$;
