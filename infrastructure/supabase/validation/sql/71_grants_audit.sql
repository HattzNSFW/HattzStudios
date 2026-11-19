-- 71_grants_audit.sql — effective privilege audit (not just table_privileges).
-- Runs as owner hattz_pg_admin. Covers table-level, column-level, schema, function (execute),
-- role inheritance, and view reloptions/projections. Any unexpected privilege is a HARD failure.
-- NOTE: this inspects the catalog as a superuser; it is a grant audit, NOT a proof that RLS works.
-- RLS effectiveness is proven separately by 70_access_matrix.sql running as the real roles.
\set ON_ERROR_STOP 1

\echo === [INFO] table-level grants to anon/authenticated/PUBLIC ===
select table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated', 'PUBLIC') and table_schema = 'public'
order by 1, 2, 3;

\echo === [INFO] column-level grants to anon/authenticated/PUBLIC ===
select table_schema, table_name, column_name, privilege_type
from information_schema.column_privileges
where grantee in ('anon', 'authenticated', 'PUBLIC') and table_schema = 'public'
order by 1, 2, 3, 4;

\echo === [HARD] no table-level write privilege for anon/authenticated ===
do $$
declare r record;
begin
  for r in
    select grantee, table_schema, table_name, privilege_type
    from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated', 'PUBLIC') and table_schema = 'public'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
  loop
    raise exception 'unexpected table write grant: % % % %', r.grantee, r.table_schema, r.table_name, r.privilege_type;
  end loop;
  raise notice 'grants: no table-level write grants: OK';
end
$$;

\echo === [HARD] no column-level write/reference privilege for anon/authenticated ===
do $$
declare r record;
begin
  for r in
    select grantee, table_schema, table_name, column_name, privilege_type
    from information_schema.column_privileges
    where grantee in ('anon', 'authenticated', 'PUBLIC') and table_schema = 'public'
      and privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')
  loop
    raise exception 'unexpected column write grant: % % % % %', r.grantee, r.table_schema, r.table_name, r.column_name, r.privilege_type;
  end loop;
  raise notice 'grants: no column-level write grants: OK';
end
$$;

\echo === [HARD] table-level SELECT grants are exactly the two public views ===
do $$
declare
  diff int;
begin
  with actual as (
    select table_schema, table_name from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type = 'SELECT' and table_schema = 'public'
  ),
  expected(table_schema, table_name) as (
    values ('public', 'v_share_published_profiles'), ('public', 'v_share_public_media')
  )
  select count(*) into diff
  from (
    (select * from actual except select * from expected)
    union all
    (select * from expected except select * from actual)
  ) d;
  if diff <> 0 then
    raise exception 'grants: table-level SELECT grant set diverges from expected (% differing rows)', diff;
  end if;
  raise notice 'grants: table-level SELECT = the two public views: OK';
end
$$;

\echo === [HARD] column-level SELECT grants are exactly the expected set ===
do $$
declare
  diff int;
begin
  with actual as (
    select table_name, column_name from information_schema.column_privileges
    where grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type = 'SELECT' and table_schema = 'public'
      -- view columns are audited separately by the explicit-projection check below
      and table_name not in ('v_share_published_profiles', 'v_share_public_media')
  ),
  expected(table_name, column_name) as (
    values
      ('profile_slugs', 'profile_id'), ('profile_slugs', 'slug'), ('profile_slugs', 'is_current'),
      ('profile_publications', 'id'), ('profile_publications', 'state'),
      ('profile_publications', 'published_at'), ('profile_publications', 'is_publicly_visible'),
      ('profile_public_snapshots', 'publication_id'), ('profile_public_snapshots', 'profile_id'),
      ('profile_public_snapshots', 'version'), ('profile_public_snapshots', 'visibility'),
      ('profile_public_snapshots', 'seo_title'), ('profile_public_snapshots', 'seo_description'),
      ('profile_public_snapshots', 'content'),
      ('media_assets', 'id'), ('media_assets', 'kind'), ('media_assets', 'mime_type'),
      ('media_assets', 'width'), ('media_assets', 'height'), ('media_assets', 'status'),
      ('media_assets', 'is_public'),
      ('media_variants', 'asset_id'), ('media_variants', 'variant'), ('media_variants', 'format'),
      ('media_variants', 'width'), ('media_variants', 'height')
  )
  select count(*) into diff
  from (
    (select * from actual except select * from expected)
    union all
    (select * from expected except select * from actual)
  ) d;
  if diff <> 0 then
    raise exception 'grants: column SELECT set diverges from expected (% differing rows)', diff;
  end if;
  raise notice 'grants: column-level SELECT set exact: OK';
end
$$;

\echo === [HARD] no USAGE on admin/audit schemas for public roles ===
do $$
begin
  if has_schema_privilege('anon', 'hattz_admin', 'USAGE')
     or has_schema_privilege('authenticated', 'hattz_admin', 'USAGE')
     or has_schema_privilege('public', 'hattz_admin', 'USAGE') then
    raise exception 'grants: hattz_admin USAGE leaked to a public role';
  end if;
  if has_schema_privilege('anon', 'hattz_audit', 'USAGE')
     or has_schema_privilege('authenticated', 'hattz_audit', 'USAGE')
     or has_schema_privilege('public', 'hattz_audit', 'USAGE') then
    raise exception 'grants: hattz_audit USAGE leaked to a public role';
  end if;
  raise notice 'grants: admin/audit schemas not usable by public roles: OK';
end
$$;

\echo === [HARD] internal functions are not executable by public roles ===
do $$
declare
  fn text;
  r text;
begin
  foreach fn in array array[
    'public.validate_publishable_snapshot_content(jsonb)',
    'public.enforce_publishable_snapshot()',
    'public.sync_publication_visibility()',
    'public.sync_snapshot_parent_visibility()'
  ] loop
    foreach r in array array['anon', 'authenticated', 'public'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        raise exception 'grants: % can execute internal function %', r, fn;
      end if;
    end loop;
  end loop;
  raise notice 'grants: internal functions not executable by public roles: OK';
end
$$;

\echo === [HARD] public roles are not superusers and have no privileged memberships ===
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if (select rolsuper from pg_roles where rolname = r) then
      raise exception 'grants: % is a superuser', r;
    end if;
    if pg_has_role(r, 'service_role', 'MEMBER') then
      raise exception 'grants: % is a member of service_role', r;
    end if;
    if pg_has_role(r, 'postgres', 'MEMBER') then
      raise exception 'grants: % is a member of postgres', r;
    end if;
    if pg_has_role(r, 'hattz_pg_admin', 'MEMBER') then
      raise exception 'grants: % is a member of hattz_pg_admin', r;
    end if;
  end loop;
  raise notice 'grants: no privileged memberships: OK';
end
$$;

\echo === [HARD] public views are security_invoker + security_barrier ===
do $$
declare
  v text;
  opts text[];
begin
  foreach v in array array['v_share_published_profiles', 'v_share_public_media'] loop
    select c.reloptions into opts from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v;
    if opts is null
       or not (opts @> array['security_invoker=true', 'security_barrier=true']) then
      raise exception 'grants: view % missing security_invoker/security_barrier (options: %)', v, coalesce(opts::text, '<none>');
    end if;
  end loop;
  raise notice 'grants: public views are security_invoker + security_barrier: OK';
end
$$;

\echo === [HARD] public views expose exactly the expected columns (explicit projection) ===
do $$
declare
  diff int;
begin
  with actual as (
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name in ('v_share_published_profiles', 'v_share_public_media')
  ),
  expected(table_name, column_name) as (
    values
      ('v_share_published_profiles', 'slug'), ('v_share_published_profiles', 'profile_version'),
      ('v_share_published_profiles', 'published_at'), ('v_share_published_profiles', 'seo_title'),
      ('v_share_published_profiles', 'seo_description'), ('v_share_published_profiles', 'content'),
      ('v_share_public_media', 'asset_id'), ('v_share_public_media', 'kind'),
      ('v_share_public_media', 'mime_type'), ('v_share_public_media', 'width'),
      ('v_share_public_media', 'height'), ('v_share_public_media', 'variant'),
      ('v_share_public_media', 'format'), ('v_share_public_media', 'variant_width'),
      ('v_share_public_media', 'variant_height')
  )
  select count(*) into diff
  from (
    (select * from actual except select * from expected)
    union all
    (select * from expected except select * from actual)
  ) d;
  if diff <> 0 then
    raise exception 'grants: public view projection diverges from expected (% differing rows)', diff;
  end if;
  raise notice 'grants: public view projections exact: OK';
end
$$;

\echo === [HARD] the derived flag column is exposed read-only ===
do $$
begin
  if not has_column_privilege('anon', 'public.profile_publications', 'is_publicly_visible', 'SELECT') then
    raise exception 'grants: anon must be able to SELECT is_publicly_visible (policy dependency)';
  end if;
  if has_column_privilege('anon', 'public.profile_publications', 'is_publicly_visible', 'UPDATE') then
    raise exception 'grants: anon must NOT be able to UPDATE is_publicly_visible';
  end if;
  raise notice 'grants: is_publicly_visible is read-only for public roles: OK';
end
$$;

\echo === 71_grants_audit: all grant expectations met ===
