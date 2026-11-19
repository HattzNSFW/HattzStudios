-- 60_matrix_transitions.sql — publication/snapshot transition matrix as owner hattz_pg_admin.
-- Exercises the 0010 maintenance triggers and the 0011 identity FK. Every expectation is a HARD
-- failure. The seed state is restored at the end so the access matrix (70) sees the expected rows.
\set ON_ERROR_STOP 1

create or replace function pg_temp.assert_flag(p_pub uuid, p_expected boolean, p_label text)
returns void
language plpgsql
as $$
declare
  actual boolean;
  pred boolean;
begin
  select pub.is_publicly_visible into actual
  from public.profile_publications pub where pub.id = p_pub;
  select (pub.state = 'published' and exists (
      select 1 from public.profile_public_snapshots s
      where s.publication_id = pub.id and s.visibility = 'public'))
    into pred
  from public.profile_publications pub where pub.id = p_pub;
  if actual is distinct from p_expected then
    raise exception '%: flag expected %, got %', p_label, p_expected, actual;
  end if;
  if actual is distinct from pred then
    raise exception '%: flag % diverges from predicate %', p_label, actual, pred;
  end if;
  raise notice '%: flag=% matches predicate: OK', p_label, actual;
end
$$;

create or replace function pg_temp.expect_fk(p_sql text, p_label text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    raise exception '%: operation was ACCEPTED but should have been rejected by the identity FK', p_label;
  exception
    when foreign_key_violation then
      raise notice '%: rejected by identity FK: OK', p_label;
  end;
end
$$;

\echo === T0 initial matrix (expect Alice visible only) ===
select p.display_name, pub.id as pub_id, pub.state, s.visibility, pub.is_publicly_visible
from public.profile_publications pub
join public.profiles p on p.id = pub.profile_id
left join public.profile_public_snapshots s on s.publication_id = pub.id
order by p.display_name;
select pg_temp.assert_flag('a1111111-0000-0000-0000-000000000001', true, 'T0 Alice');
select pg_temp.assert_flag('a2222222-0000-0000-0000-000000000002', false, 'T0 Bob');
select pg_temp.assert_flag('a3333333-0000-0000-0000-000000000003', false, 'T0 Carol');
select pg_temp.assert_flag('a4444444-0000-0000-0000-000000000004', false, 'T0 Dave');

\echo === T1 unpublish Alice -> expect f ===
update public.profile_publications set state = 'draft' where id = 'a1111111-0000-0000-0000-000000000001';
select pg_temp.assert_flag('a1111111-0000-0000-0000-000000000001', false, 'T1 Alice');

\echo === T2 republish Alice -> expect t ===
update public.profile_publications set state = 'published' where id = 'a1111111-0000-0000-0000-000000000001';
select pg_temp.assert_flag('a1111111-0000-0000-0000-000000000001', true, 'T2 Alice');

\echo === T3 snapshot public -> unpublished -> expect f ===
update public.profile_public_snapshots set visibility = 'unpublished' where id = 'c1111111-0000-0000-0000-000000000001';
select pg_temp.assert_flag('a1111111-0000-0000-0000-000000000001', false, 'T3 Alice');

\echo === T4 snapshot unpublished -> public -> expect t ===
update public.profile_public_snapshots set visibility = 'public' where id = 'c1111111-0000-0000-0000-000000000001';
select pg_temp.assert_flag('a1111111-0000-0000-0000-000000000001', true, 'T4 Alice');

\echo === T5 delete snapshot -> expect f ===
delete from public.profile_public_snapshots where id = 'c1111111-0000-0000-0000-000000000001';
select pg_temp.assert_flag('a1111111-0000-0000-0000-000000000001', false, 'T5 Alice');

\echo === T6 re-insert snapshot -> expect t (backfill via snapshot trigger) ===
insert into public.profile_public_snapshots (id, publication_id, profile_id, version, visibility, seo_title, seo_description, og_image_asset_id, content)
values ('c1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 'public', 'Alice', 'desc', 'b1111111-0000-0000-0000-000000000001',
  '{"schemaVersion":1,"profile":{"displayName":"Alice"},"sections":[]}'::jsonb);
select pg_temp.assert_flag('a1111111-0000-0000-0000-000000000001', true, 'T6 Alice');

\echo === T7 CROSS-PROFILE move (Alice snapshot -> Dave publication) -> expect identity FK rejection ===
select pg_temp.expect_fk(
  $sql$update public.profile_public_snapshots set publication_id = 'a4444444-0000-0000-0000-000000000004'
      where id = 'c1111111-0000-0000-0000-000000000001'$sql$,
  'T7 cross-profile move');
select pg_temp.assert_flag('a1111111-0000-0000-0000-000000000001', true, 'T7 Alice unchanged');
select pg_temp.assert_flag('a4444444-0000-0000-0000-000000000004', false, 'T7 Dave unchanged');

\echo === T8 SAME-PROFILE move to a new publication version (Alice v1 -> v2) -> expect success ===
insert into public.profile_publications (id, profile_id, version, state, published_at)
values ('a5555555-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 2, 'published', now());
update public.profile_public_snapshots
  set publication_id = 'a5555555-0000-0000-0000-000000000005', version = 2
  where id = 'c1111111-0000-0000-0000-000000000001';
select pg_temp.assert_flag('a1111111-0000-0000-0000-000000000001', false, 'T8 Alice v1 (now empty)');
select pg_temp.assert_flag('a5555555-0000-0000-0000-000000000005', true, 'T8 Alice v2');

\echo === T8b revert same-profile move (Alice v2 -> v1) -> expect success ===
update public.profile_public_snapshots
  set publication_id = 'a1111111-0000-0000-0000-000000000001', version = 1
  where id = 'c1111111-0000-0000-0000-000000000001';
delete from public.profile_publications where id = 'a5555555-0000-0000-0000-000000000005';
select pg_temp.assert_flag('a1111111-0000-0000-0000-000000000001', true, 'T8b Alice v1');

\echo === T9 DELETE publication WITH snapshot -> expect identity FK restrict rejection ===
select pg_temp.expect_fk(
  $sql$delete from public.profile_publications where id = 'a1111111-0000-0000-0000-000000000001'$sql$,
  'T9 delete publication with snapshot');

\echo === T10 DELETE publication WITHOUT snapshot (Dave a4) -> expect success ===
delete from public.profile_publications where id = 'a4444444-0000-0000-0000-000000000004';
do $$
begin
  if (select count(*) from public.profile_publications where id = 'a4444444-0000-0000-0000-000000000004') <> 0 then
    raise exception 'T10 FAIL: Dave publication was not deleted';
  end if;
  raise notice 'T10 OK: publication without snapshot deleted';
end
$$;

\echo === T12 restore Dave publication for later tests ===
insert into public.profile_publications (id, profile_id, version, state, published_at)
values ('a4444444-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 1, 'published', now())
on conflict (id) do nothing;
select pg_temp.assert_flag('a4444444-0000-0000-0000-000000000004', false, 'T12 Dave (no snapshot)');

\echo === T13 INSERT snapshot for a published publication without one (Dave) -> expect t ===
insert into public.profile_public_snapshots (id, publication_id, profile_id, version, visibility, content)
values ('c4444444-0000-0000-0000-000000000004', 'a4444444-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 1, 'public',
  '{"schemaVersion":1,"profile":{"displayName":"Dave"},"sections":[]}'::jsonb);
select pg_temp.assert_flag('a4444444-0000-0000-0000-000000000004', true, 'T13 Dave');

\echo === T14 UPDATE that snapshot visibility -> unpublished -> expect f ===
update public.profile_public_snapshots set visibility = 'unpublished' where id = 'c4444444-0000-0000-0000-000000000004';
select pg_temp.assert_flag('a4444444-0000-0000-0000-000000000004', false, 'T14 Dave');

\echo === T15 DELETE that snapshot -> expect f and Dave back to no snapshot ===
delete from public.profile_public_snapshots where id = 'c4444444-0000-0000-0000-000000000004';
select pg_temp.assert_flag('a4444444-0000-0000-0000-000000000004', false, 'T15 Dave');
do $$
begin
  if (select count(*) from public.profile_public_snapshots where id = 'c4444444-0000-0000-0000-000000000004') <> 0 then
    raise exception 'T15 FAIL: Dave snapshot still present';
  end if;
  raise notice 'T15 OK: Dave back to no snapshot';
end
$$;

\echo === T11 final flag vs predicate equivalence (expect 0 mismatches) ===
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
    raise exception 'T11 FAIL: % flag/predicate mismatch(es)', bad;
  end if;
  raise notice 'T11 OK: flag invariant holds (0 mismatches)';
end
$$;

\echo === RESTORE seed state for the access matrix ===
update public.profile_publications set state = 'published' where id = 'a1111111-0000-0000-0000-000000000001';
update public.profile_public_snapshots set visibility = 'public' where id = 'c1111111-0000-0000-0000-000000000001';
update public.profile_publications set state = 'published' where id = 'a2222222-0000-0000-0000-000000000002';
update public.profile_public_snapshots set visibility = 'unpublished' where id = 'c2222222-0000-0000-0000-000000000002';
update public.profile_publications set state = 'draft' where id = 'a3333333-0000-0000-0000-000000000003';
update public.profile_public_snapshots set visibility = 'public' where id = 'c3333333-0000-0000-0000-000000000003';
update public.profile_publications set state = 'published' where id = 'a4444444-0000-0000-0000-000000000004';
select pg_temp.assert_flag('a1111111-0000-0000-0000-000000000001', true, 'restore Alice');
select pg_temp.assert_flag('a2222222-0000-0000-0000-000000000002', false, 'restore Bob');
select pg_temp.assert_flag('a3333333-0000-0000-0000-000000000003', false, 'restore Carol');
select pg_temp.assert_flag('a4444444-0000-0000-0000-000000000004', false, 'restore Dave');
