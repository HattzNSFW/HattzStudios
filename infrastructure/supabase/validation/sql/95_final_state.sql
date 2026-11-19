-- 95_final_state.sql — end-of-run snapshot: databases (prior rounds must be preserved), domain
-- object counts, RLS/force-RLS, policy count, the derived-flag invariant and the final matrix.
\set ON_ERROR_STOP 1

\echo === DATABASES (validation DBs must all still exist; prior rounds untouched) ===
select oid, datname, pg_get_userbyid(datdba) as owner, pg_encoding_to_char(encoding) as encoding
from pg_database
order by 1;

\echo === DOMAIN OBJECTS / RLS ===
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public','hattz_admin','hattz_audit') and c.relkind = 'r') as tables,
  (select count(*) from pg_policies) as policies,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public','hattz_admin','hattz_audit') and c.relkind = 'r'
       and c.relrowsecurity) as rls_enabled,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public','hattz_admin','hattz_audit') and c.relkind = 'r'
       and c.relforcerowsecurity) as force_rls;

\echo === SEED COUNTS ===
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.profile_slugs) as slugs,
  (select count(*) from public.profile_publications) as publications,
  (select count(*) from public.profile_public_snapshots) as snapshots;

\echo === [HARD] derived flag invariant (expect 0 mismatches) ===
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
    raise exception '95_final_state: % flag/predicate mismatch(es)', bad;
  end if;
  raise notice '95_final_state: derived flag invariant holds: OK';
end
$$;

\echo === [HARD] identity constraints present (0011) ===
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profile_public_snapshots'::regclass
      and conname = 'fk_profile_public_snapshots_publication_identity') then
    raise exception '95_final_state: composite identity FK missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profile_publications'::regclass
      and conname = 'uq_profile_publications_identity_version') then
    raise exception '95_final_state: identity candidate key missing';
  end if;
  raise notice '95_final_state: 0011 identity constraints present: OK';
end
$$;

\echo === [HARD] slug constraints present (0002 global + 0013 per-profile) ===
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'profile_slugs'
      and indexname = 'ux_profile_slugs_slug_current'
      and indexdef ilike '%unique%lower(slug)%where%is_current = true%') then
    raise exception '95_final_state: global current-slug unique index missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'profile_slugs'
      and indexname = 'ux_profile_slugs_current_per_profile'
      and indexdef ilike '%unique%profile_id%where%is_current = true%') then
    raise exception '95_final_state: one-current-slug-per-profile unique index missing';
  end if;
  raise notice '95_final_state: slug integrity indexes present: OK';
end
$$;

\echo === [HARD] trusted-writer grants present (0012) ===
do $$
begin
  if not has_column_privilege('service_role', 'public.profile_publications', 'is_publicly_visible', 'UPDATE') then
    raise exception '95_final_state: 0012 grant UPDATE(publications.is_publicly_visible) missing';
  end if;
  if not has_column_privilege('service_role', 'public.profile_public_snapshots', 'visibility', 'SELECT') then
    raise exception '95_final_state: 0012 grant SELECT(snapshots.visibility) missing';
  end if;
  if not has_table_privilege('service_role', 'public.profile_public_snapshots', 'DELETE') then
    raise exception '95_final_state: 0012 grant DELETE(snapshots) missing';
  end if;
  raise notice '95_final_state: 0012 trusted-writer grants present: OK';
end
$$;

\echo === FINAL MATRIX ===
select p.display_name, pub.state, s.visibility, pub.is_publicly_visible,
       (pub.state = 'published' and s.visibility = 'public') as predicate
from public.profile_publications pub
join public.profiles p on p.id = pub.profile_id
left join public.profile_public_snapshots s on s.publication_id = pub.id
order by p.display_name;
