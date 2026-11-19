-- 21_0011_precheck_setup.sql — simulate a pre-0011 database that already contains an
-- identity-inconsistent snapshot, so the migration's diagnostic pre-check can be exercised.
--
-- The identity constraints are dropped (FK first, then the candidate key it depends on) and a
-- deliberately mismatched row is inserted. The driver then re-applies 0011 and MUST observe a
-- non-zero exit; the failed migration must roll back cleanly (verified by
-- 22_0011_precheck_after_failure.sql).
\set ON_ERROR_STOP 1

\echo === drop identity constraints to emulate a legacy (pre-0011) schema ===
alter table public.profile_public_snapshots
  drop constraint if exists fk_profile_public_snapshots_publication_identity;
alter table public.profile_publications
  drop constraint if exists uq_profile_publications_identity_version;

\echo === reset + seed a mismatched identity ===
truncate public.profile_public_snapshots, public.profile_publications, public.profiles restart identity cascade;

insert into public.profiles (id, technical_id, display_name, status) values
  ('11111111-1111-1111-1111-111111111111', 'tech-alice', 'Alice', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'tech-bob', 'Bob', 'active');
insert into public.profile_publications (id, profile_id, version, state) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 'published');

-- Mismatched: the publication belongs to Alice, but the snapshot carries Bob's profile_id/version.
insert into public.profile_public_snapshots
  (publication_id, profile_id, version, visibility, content)
values
  ('a1111111-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 2, 'public',
   '{"schemaVersion":1,"profile":{"displayName":"Bob"},"sections":[]}'::jsonb);

\echo === [HARD] preconditions for the pre-check test ===
do $$
begin
  if (select count(*) from public.profile_public_snapshots) <> 1 then
    raise exception 'precheck setup: expected exactly 1 mismatched snapshot';
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'uq_profile_publications_identity_version'
      and conrelid = 'public.profile_publications'::regclass
  ) then
    raise exception 'precheck setup: candidate key still present';
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'fk_profile_public_snapshots_publication_identity'
      and conrelid = 'public.profile_public_snapshots'::regclass
  ) then
    raise exception 'precheck setup: identity FK still present';
  end if;
  raise notice 'precheck setup: legacy-like state with 1 mismatched snapshot ready: OK';
end
$$;
