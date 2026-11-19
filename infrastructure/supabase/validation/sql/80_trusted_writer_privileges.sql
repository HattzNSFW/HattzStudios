-- 80_trusted_writer_privileges.sql — §4 investigation: what privileges does the trusted server-side
-- writer actually need for the 0010 SECURITY INVOKER triggers, and can those triggers be bypassed?
--
-- Method: assume the trusted-writer role (service_role, BYPASSRLS) with the MINIMUM grants and
-- exercise every trigger path. Then run negative controls that remove one required privilege at a
-- time and prove the trigger fails loudly (no silent bypass, no SECURITY DEFINER shortcut).
-- Everything runs inside one transaction that is ROLLED BACK, so the disposable DB ACL state is
-- left unchanged.
--
-- LIMITATION: service_role here is a LOCAL stand-in with BYPASSRLS. It is NOT equivalent to the
-- Supabase `service_role` (Auth/JWT/PostgREST/Storage). This proves the trigger privilege model,
-- not real-Supabase behaviour.
\set ON_ERROR_STOP 1

-- Snapshot the migration-defined ACL for service_role BEFORE any test mutation, so P10 can prove
-- the temporary grants were rolled back to exactly this baseline (migration 0012 now provisions
-- the minimum grants, so "no grants at all" is no longer the expected post-rollback state).
drop table if exists pg_temp._acl_baseline;
create table pg_temp._acl_baseline as
select (coalesce(c.table_name, '') || '|' || coalesce(c.column_name, '') || '|' || c.privilege_type) as entry
from (
  select table_name, column_name, privilege_type
  from information_schema.column_privileges
  where grantee = 'service_role' and table_schema = 'public'
    and table_name in ('profile_publications', 'profile_public_snapshots')
  union all
  select table_name, null::text as column_name, privilege_type
  from information_schema.role_table_grants
  where grantee = 'service_role' and table_schema = 'public'
    and table_name in ('profile_publications', 'profile_public_snapshots')
) c;

begin;

-- Start from a clean slate for the two tables, then grant the minimum.
revoke all on public.profile_publications from service_role;
revoke all on public.profile_public_snapshots from service_role;
grant usage on schema public to service_role;

-- Minimum privilege set derived from the trigger bodies:
--   sync_publication_visibility (BEFORE on publications): SELECT on profile_public_snapshots
--     (only evaluated when state -> 'published', because the predicate is `(state='published') AND EXISTS(...)`)
--   sync_snapshot_parent_visibility (AFTER on snapshots): SELECT + UPDATE on profile_publications
--   plus the writer's own DML on the table it writes.
grant select on public.profile_public_snapshots to service_role;
grant select, update on public.profile_publications to service_role;
grant insert, update, delete on public.profile_publications to service_role;
grant insert, update, delete on public.profile_public_snapshots to service_role;

\echo === P0 negative control: BEFORE trigger needs invoker SELECT on snapshots when state -> published ===
-- The BEFORE trigger body is `(new.state = 'published') and exists(select ... snapshots ...)`.
-- SQL `AND` short-circuits, so the snapshot subquery is only evaluated when the new state is
-- 'published'. The control therefore transitions the state TO 'published' to force the read.
revoke select on public.profile_public_snapshots from service_role;
set role service_role;
do $$
begin
  begin
    update public.profile_publications set state = 'published' where id = 'a1111111-0000-0000-0000-000000000001';
    raise exception 'P0 FAIL: publication update ran without the required snapshot SELECT (trigger privilege bypassed)';
  exception
    when insufficient_privilege then
      raise notice 'P0 OK: BEFORE trigger correctly requires invoker SELECT on snapshots (state -> published)';
  end;
end
$$;
reset role;
grant select on public.profile_public_snapshots to service_role;

\echo === P0c documented short-circuit: state -> draft does NOT evaluate the snapshot EXISTS ===
-- This is correct semantics, not a bypass: (false AND x) = false, so the derived flag is false
-- regardless of snapshots and no snapshot row is read. Asserted explicitly so the harness proves
-- the privilege requirement is real yet scoped.
revoke select on public.profile_public_snapshots from service_role;
set role service_role;
do $$
begin
  begin
    update public.profile_publications set state = 'draft' where id = 'a1111111-0000-0000-0000-000000000001';
    raise notice 'P0c OK: state -> draft did not read snapshots (AND short-circuit); flag false regardless';
  exception
    when insufficient_privilege then
      raise exception 'P0c UNEXPECTED: state -> draft evaluated the snapshot subquery';
  end;
end
$$;
reset role;
grant select on public.profile_public_snapshots to service_role;

\echo === P0b negative control: AFTER trigger needs invoker UPDATE on publications ===
revoke update on public.profile_publications from service_role;
set role service_role;
do $$
begin
  begin
    update public.profile_public_snapshots set visibility = 'unpublished' where id = 'c1111111-0000-0000-0000-000000000001';
    raise exception 'P0b FAIL: snapshot update ran without the required publication UPDATE (trigger privilege bypassed)';
  exception
    when insufficient_privilege then
      raise notice 'P0b OK: AFTER trigger correctly requires invoker UPDATE on publications';
  end;
end
$$;
reset role;
grant update on public.profile_publications to service_role;

\echo === positive path as the minimally-privileged trusted writer ===
set role service_role;
select current_user, current_setting('is_superuser') as is_superuser,
       (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls;

create or replace view pg_temp.alice_flag as
select pub.is_publicly_visible as flag,
       (pub.state = 'published' and s.visibility = 'public') as pred,
       pub.state, s.visibility
from public.profile_publications pub
join public.profile_public_snapshots s on s.publication_id = pub.id
where pub.id = 'a1111111-0000-0000-0000-000000000001';

create or replace function pg_temp.assert_alice(p_expected boolean, p_label text)
returns void language plpgsql as $$
declare
  flag boolean;
  pred boolean;
begin
  select pub.is_publicly_visible, (pub.state = 'published' and s.visibility = 'public')
    into flag, pred
  from public.profile_publications pub
  join public.profile_public_snapshots s on s.publication_id = pub.id
  where pub.id = 'a1111111-0000-0000-0000-000000000001';
  if flag is distinct from p_expected then
    raise exception '%: flag expected %, got %', p_label, p_expected, flag;
  end if;
  if flag is distinct from pred then
    raise exception '%: flag % diverges from predicate %', p_label, flag, pred;
  end if;
  raise notice '%: flag=% predicate=%: OK', p_label, flag, pred;
end
$$;

\echo === P1 reset to published+public -> expect t ===
update public.profile_publications set state = 'published' where id = 'a1111111-0000-0000-0000-000000000001';
update public.profile_public_snapshots set visibility = 'public' where id = 'c1111111-0000-0000-0000-000000000001';
select pg_temp.assert_alice(true, 'P1');

\echo === P2 state -> draft -> expect f ===
update public.profile_publications set state = 'draft' where id = 'a1111111-0000-0000-0000-000000000001';
select pg_temp.assert_alice(false, 'P2');

\echo === P3 state -> published -> expect t ===
update public.profile_publications set state = 'published' where id = 'a1111111-0000-0000-0000-000000000001';
select pg_temp.assert_alice(true, 'P3');

\echo === P4 visibility -> unpublished -> expect f ===
update public.profile_public_snapshots set visibility = 'unpublished' where id = 'c1111111-0000-0000-0000-000000000001';
select pg_temp.assert_alice(false, 'P4');

\echo === P5 TAMPER: force flag=true while predicate=false -> expect trigger overrides to f ===
update public.profile_publications set is_publicly_visible = true where id = 'a1111111-0000-0000-0000-000000000001';
select pg_temp.assert_alice(false, 'P5');

\echo === P6 visibility -> public then force flag=false -> expect trigger overrides to t ===
update public.profile_public_snapshots set visibility = 'public' where id = 'c1111111-0000-0000-0000-000000000001';
update public.profile_publications set is_publicly_visible = false where id = 'a1111111-0000-0000-0000-000000000001';
select pg_temp.assert_alice(true, 'P6');

\echo === P7 INSERT/DELETE snapshot path for Dave (published, no snapshot) ===
update public.profile_publications set state = 'published' where id = 'a4444444-0000-0000-0000-000000000004';
insert into public.profile_public_snapshots (id, publication_id, profile_id, version, visibility, content)
values ('c4444444-0000-0000-0000-000000000004', 'a4444444-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 1, 'public',
  '{"schemaVersion":1,"profile":{"displayName":"Dave"},"sections":[]}'::jsonb);
do $$
begin
  if (select is_publicly_visible from public.profile_publications where id = 'a4444444-0000-0000-0000-000000000004') is not true then
    raise exception 'P7 FAIL: Dave flag should be true after inserting a public snapshot';
  end if;
  raise notice 'P7 OK: INSERT snapshot recomputed Dave flag to true';
end
$$;
delete from public.profile_public_snapshots where id = 'c4444444-0000-0000-0000-000000000004';
do $$
begin
  if (select is_publicly_visible from public.profile_publications where id = 'a4444444-0000-0000-0000-000000000004') is not false then
    raise exception 'P7 FAIL: Dave flag should be false after deleting the snapshot';
  end if;
  raise notice 'P7 OK: DELETE snapshot recomputed Dave flag to false';
end
$$;

\echo === P8 same-profile publication_id change recomputes both parents ===
insert into public.profile_publications (id, profile_id, version, state, published_at)
values ('a5555555-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 2, 'published', now());
update public.profile_public_snapshots
  set publication_id = 'a5555555-0000-0000-0000-000000000005', version = 2
  where id = 'c1111111-0000-0000-0000-000000000001';
do $$
begin
  if (select is_publicly_visible from public.profile_publications where id = 'a1111111-0000-0000-0000-000000000001') is not false then
    raise exception 'P8 FAIL: old parent flag should be false';
  end if;
  if (select is_publicly_visible from public.profile_publications where id = 'a5555555-0000-0000-0000-000000000005') is not true then
    raise exception 'P8 FAIL: new parent flag should be true';
  end if;
  raise notice 'P8 OK: publication_id change recomputed both parents';
end
$$;

\echo === P9 invariant across all publications (expect 0 mismatches) ===
do $$
declare
  bad int;
begin
  select count(*) into bad
  from public.profile_publications pub
  where pub.is_publicly_visible is distinct from (
    (pub.state = 'published') and exists (
      select 1 from public.profile_public_snapshots s
      where s.publication_id = pub.id and s.visibility = 'public'));
  if bad <> 0 then
    raise exception 'P9 FAIL: % flag/predicate mismatch(es)', bad;
  end if;
  raise notice 'P9 OK: flag invariant holds under the minimally-privileged trusted writer';
end
$$;

reset role;
rollback;

\echo === P10 grants rolled back to the migration baseline? (0012 ACL restored) ===
select c.relname, c.relacl::text as acl
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('profile_publications', 'profile_public_snapshots')
order by 1;
do $$
declare
  diff int;
begin
  with actual as (
    select (coalesce(c.table_name, '') || '|' || coalesce(c.column_name, '') || '|' || c.privilege_type) as entry
    from (
      select table_name, column_name, privilege_type
      from information_schema.column_privileges
      where grantee = 'service_role' and table_schema = 'public'
        and table_name in ('profile_publications', 'profile_public_snapshots')
      union all
      select table_name, null::text as column_name, privilege_type
      from information_schema.role_table_grants
      where grantee = 'service_role' and table_schema = 'public'
        and table_name in ('profile_publications', 'profile_public_snapshots')
    ) c
  )
  select count(*) into diff
  from (
    (select * from actual except select * from pg_temp._acl_baseline)
    union all
    (select * from pg_temp._acl_baseline except select * from actual)
  ) d;
  if diff <> 0 then
    raise exception 'P10 FAIL: % ACL difference(s) vs the migration baseline after rollback', diff;
  end if;
  raise notice 'P10 OK: ACL restored to the migration baseline after rollback';
end
$$;
drop table if exists pg_temp._acl_baseline;
