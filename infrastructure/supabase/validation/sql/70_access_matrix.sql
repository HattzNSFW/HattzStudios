-- 70_access_matrix.sql — effective access matrix for a public role (anon or authenticated).
-- Run as: psql -v role=anon   OR   psql -v role=authenticated
-- Executes as a NON-superuser, NON-owner role so RLS/FORCE RLS and grants truly apply.
-- Every denial is a HARD expectation: if a protected read/write is NOT denied, the script fails.
\set ON_ERROR_STOP 1
set role :"role";

\echo === ACTING ROLE ===
select current_user, session_user, current_setting('is_superuser') as is_superuser;

\echo === A1 public view v_share_published_profiles (expect exactly Alice; no recursion) ===
select slug, profile_version, seo_title from public.v_share_published_profiles order by slug;
do $$
declare n int;
begin
  select count(*) into n from public.v_share_published_profiles;
  if n <> 1 then raise exception 'A1 FAIL: v_share_published_profiles expected 1 row, got %', n; end if;
  if not exists (select 1 from public.v_share_published_profiles where slug = 'alice-public') then
    raise exception 'A1 FAIL: expected slug alice-public';
  end if;
  raise notice 'A1 OK: public profile view returns exactly Alice';
end
$$;

\echo === A2 direct read profile_publications (expect exactly Alice) ===
select id, state from public.profile_publications;
do $$
declare n int;
begin
  select count(*) into n from public.profile_publications;
  if n <> 1 then raise exception 'A2 FAIL: profile_publications expected 1 row, got %', n; end if;
  if not exists (select 1 from public.profile_publications where id = 'a1111111-0000-0000-0000-000000000001') then
    raise exception 'A2 FAIL: expected Alice publication';
  end if;
  raise notice 'A2 OK: direct publication read limited to Alice';
end
$$;

\echo === A3 direct read profile_public_snapshots (expect exactly Alice public snapshot) ===
select publication_id, visibility, version from public.profile_public_snapshots;
do $$
declare n int;
begin
  select count(*) into n from public.profile_public_snapshots;
  if n <> 1 then raise exception 'A3 FAIL: profile_public_snapshots expected 1 row, got %', n; end if;
  -- NOTE: `id` is deliberately NOT granted to public roles, so the check must use a granted
  -- column (publication_id); referencing `id` here would raise "permission denied for table".
  if not exists (select 1 from public.profile_public_snapshots where publication_id = 'a1111111-0000-0000-0000-000000000001') then
    raise exception 'A3 FAIL: expected Alice snapshot';
  end if;
  raise notice 'A3 OK: direct snapshot read limited to Alice public snapshot';
end
$$;

\echo === A4 direct read profile_slugs (expect exactly alice-public current) ===
select slug, is_current from public.profile_slugs;
do $$
declare n int;
begin
  select count(*) into n from public.profile_slugs;
  if n <> 1 then raise exception 'A4 FAIL: profile_slugs expected 1 row, got %', n; end if;
  if not exists (select 1 from public.profile_slugs where slug = 'alice-public') then
    raise exception 'A4 FAIL: expected alice-public';
  end if;
  raise notice 'A4 OK: direct slug read limited to the current public slug';
end
$$;

\echo === A5 public media view (expect exactly m1) ===
select asset_id, kind, variant from public.v_share_public_media order by asset_id;
do $$
declare n int;
begin
  select count(*) into n from public.v_share_public_media;
  if n <> 1 then raise exception 'A5 FAIL: v_share_public_media expected 1 row, got %', n; end if;
  raise notice 'A5 OK: public media view returns exactly the public active asset';
end
$$;

\echo === A6 direct read media_assets (expect exactly m1 + m4: public AND active) ===
select id, is_public, status from public.media_assets order by id;
do $$
declare n int;
begin
  select count(*) into n from public.media_assets;
  if n <> 2 then raise exception 'A6 FAIL: media_assets expected 2 rows, got %', n; end if;
  raise notice 'A6 OK: direct media read limited to public+active assets';
end
$$;

\echo === A7 direct read media_variants (expect exactly m1 variant) ===
select asset_id, variant from public.media_variants order by asset_id;
do $$
declare n int;
begin
  select count(*) into n from public.media_variants;
  if n <> 1 then raise exception 'A7 FAIL: media_variants expected 1 row, got %', n; end if;
  raise notice 'A7 OK: direct variant read limited to public active asset';
end
$$;

\echo === A8 private/protected reads must be DENIED ===
do $$
begin
  begin
    perform count(*) from public.profiles;
    raise exception 'READ_profiles was NOT denied';
  exception when insufficient_privilege then raise notice 'READ_profiles: denied (OK)'; end;
  begin
    perform count(*) from hattz_admin.admin_accounts;
    raise exception 'READ_admin_accounts was NOT denied';
  exception when insufficient_privilege then raise notice 'READ_admin_accounts: denied (OK)'; end;
  begin
    perform count(*) from hattz_audit.audit_logs;
    raise exception 'READ_audit_logs was NOT denied';
  exception when insufficient_privilege then raise notice 'READ_audit_logs: denied (OK)'; end;
  begin
    perform count(*) from public.profile_storage_usage;
    raise exception 'READ_profile_storage_usage was NOT denied';
  exception when insufficient_privilege then raise notice 'READ_profile_storage_usage: denied (OK)'; end;
  begin
    perform count(*) from public.user_role_assignments;
    raise exception 'READ_user_role_assignments was NOT denied';
  exception when insufficient_privilege then raise notice 'READ_user_role_assignments: denied (OK)'; end;
  begin
    perform count(*) from public.sync_operations;
    raise exception 'READ_sync_operations was NOT denied';
  exception when insufficient_privilege then raise notice 'READ_sync_operations: denied (OK)'; end;
end
$$;

\echo === A9 write attempts must be DENIED (incl. the derived flag) ===
do $$
begin
  begin
    insert into public.profile_publications (profile_id, version, state)
      values ('11111111-1111-1111-1111-111111111111', 999, 'published');
    raise exception 'WRITE_ins_publication was NOT denied';
  exception when insufficient_privilege then raise notice 'WRITE_ins_publication: denied (OK)'; end;
  begin
    update public.profile_publications set is_publicly_visible = true where id = 'a2222222-0000-0000-0000-000000000002';
    raise exception 'WRITE_derived_flag was NOT denied';
  exception when insufficient_privilege then raise notice 'WRITE_derived_flag: denied (OK)'; end;
  begin
    update public.profile_publications set state = 'published' where id = 'a3333333-0000-0000-0000-000000000003';
    raise exception 'WRITE_state was NOT denied';
  exception when insufficient_privilege then raise notice 'WRITE_state: denied (OK)'; end;
  begin
    delete from public.profile_publications where id = 'a2222222-0000-0000-0000-000000000002';
    raise exception 'WRITE_del_publication was NOT denied';
  exception when insufficient_privilege then raise notice 'WRITE_del_publication: denied (OK)'; end;
  begin
    insert into public.profile_public_snapshots (publication_id, profile_id, version, visibility, content)
      values ('a2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 2, 'public', '{}'::jsonb);
    raise exception 'WRITE_ins_snapshot was NOT denied';
  exception when insufficient_privilege then raise notice 'WRITE_ins_snapshot: denied (OK)'; end;
  begin
    update public.profile_public_snapshots set visibility = 'public' where id = 'c2222222-0000-0000-0000-000000000002';
    raise exception 'WRITE_upd_snapshot_visibility was NOT denied';
  exception when insufficient_privilege then raise notice 'WRITE_upd_snapshot_visibility: denied (OK)'; end;
  begin
    delete from public.profile_public_snapshots where id = 'c2222222-0000-0000-0000-000000000002';
    raise exception 'WRITE_del_snapshot was NOT denied';
  exception when insufficient_privilege then raise notice 'WRITE_del_snapshot: denied (OK)'; end;
  begin
    update public.profile_slugs set is_current = false where slug = 'alice-public';
    raise exception 'WRITE_upd_slug was NOT denied';
  exception when insufficient_privilege then raise notice 'WRITE_upd_slug: denied (OK)'; end;
  begin
    update public.media_assets set is_public = true where id = 'b3333333-0000-0000-0000-000000000003';
    raise exception 'WRITE_upd_media was NOT denied';
  exception when insufficient_privilege then raise notice 'WRITE_upd_media: denied (OK)'; end;
end
$$;

\echo === A10 internal functions must NOT be executable ===
do $$
begin
  begin
    perform public.sync_publication_visibility();
    raise exception 'EXEC_sync_publication_visibility was NOT denied';
  exception when insufficient_privilege then raise notice 'EXEC_sync_publication_visibility: denied (OK)'; end;
  begin
    perform public.sync_snapshot_parent_visibility();
    raise exception 'EXEC_sync_snapshot_parent_visibility was NOT denied';
  exception when insufficient_privilege then raise notice 'EXEC_sync_snapshot_parent_visibility: denied (OK)'; end;
  begin
    perform public.validate_publishable_snapshot_content('{}'::jsonb);
    raise exception 'EXEC_validate_content was NOT denied';
  exception when insufficient_privilege then raise notice 'EXEC_validate_content: denied (OK)'; end;
end
$$;

\echo === A11 all access-matrix expectations met for role :role ===
reset role;
