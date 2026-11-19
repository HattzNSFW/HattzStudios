-- 22_0011_precheck_after_failure.sql — after the driver re-applies 0011 (expected to FAIL on the
-- mismatch from 21), assert that the failed migration rolled back completely and then clean up.
\set ON_ERROR_STOP 1

\echo === [HARD] failed 0011 left the database unchanged (no partial DDL) ===
do $$
begin
  if (select count(*) from public.profile_public_snapshots) <> 1 then
    raise exception 'post-failure: mismatched snapshot disappeared (unexpected rollback of data)';
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'uq_profile_publications_identity_version'
      and conrelid = 'public.profile_publications'::regclass
  ) then
    raise exception 'post-failure: candidate key exists despite the failed migration (partial apply)';
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'fk_profile_public_snapshots_publication_identity'
      and conrelid = 'public.profile_public_snapshots'::regclass
  ) then
    raise exception 'post-failure: identity FK exists despite the failed migration (partial apply)';
  end if;
  raise notice 'post-failure: failed migration rolled back cleanly: OK';
end
$$;

\echo === cleanup mismatched data so 0011 can be re-applied successfully ===
truncate public.profile_public_snapshots, public.profile_publications, public.profiles restart identity cascade;
