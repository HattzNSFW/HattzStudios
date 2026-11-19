-- 82_trusted_writer_grants.sql — §4 verification that migration 0012 provisions EXACTLY the
-- minimum trusted-writer privileges proven by the investigation in 80_trusted_writer_privileges.sql,
-- and that the writer can exercise every documented write path with them.
--
-- 80 proves the *model* with temporary grants (clean slate + rollback). This step proves the
-- *migration*: the catalog shows the applied grants, the minimally-privileged `service_role`
-- (local stand-in, BYPASSRLS) can run every write path, and removing any single applied grant
-- makes the corresponding operation fail loudly (no silent bypass, no SECURITY DEFINER shortcut).
-- Everything runs in one transaction that is ROLLED BACK; the 0012 ACL state is unchanged after.
--
-- LIMITATION: service_role here is a LOCAL stand-in with BYPASSRLS; it is NOT equivalent to the
-- Supabase `service_role` (Auth/JWT/PostgREST/Storage). This proves the migration/trigger privilege
-- model, not real-Supabase behaviour.
\set ON_ERROR_STOP 1

begin;

\echo === G1 [HARD] migration 0012 granted the minimum set to service_role ===
do $$
declare
  missing text[] := array[]::text[];
begin
  if not has_schema_privilege('service_role', 'public', 'USAGE') then missing := missing || 'schema public USAGE'; end if;
  -- trigger-required cross-table privileges
  if not has_column_privilege('service_role', 'public.profile_public_snapshots', 'publication_id', 'SELECT') then missing := missing || 'snapshots SELECT(publication_id)'; end if;
  if not has_column_privilege('service_role', 'public.profile_public_snapshots', 'visibility', 'SELECT') then missing := missing || 'snapshots SELECT(visibility)'; end if;
  if not has_column_privilege('service_role', 'public.profile_publications', 'state', 'SELECT') then missing := missing || 'publications SELECT(state)'; end if;
  if not has_column_privilege('service_role', 'public.profile_publications', 'is_publicly_visible', 'UPDATE') then missing := missing || 'publications UPDATE(is_publicly_visible)'; end if;
  -- writer DML
  if not has_column_privilege('service_role', 'public.profile_publications', 'state', 'UPDATE') then missing := missing || 'publications UPDATE(state)'; end if;
  if not has_column_privilege('service_role', 'public.profile_publications', 'profile_id', 'INSERT') then missing := missing || 'publications INSERT(profile_id)'; end if;
  if not has_table_privilege('service_role', 'public.profile_publications', 'DELETE') then missing := missing || 'publications DELETE'; end if;
  if not has_column_privilege('service_role', 'public.profile_public_snapshots', 'content', 'INSERT') then missing := missing || 'snapshots INSERT(content)'; end if;
  if not has_column_privilege('service_role', 'public.profile_public_snapshots', 'visibility', 'UPDATE') then missing := missing || 'snapshots UPDATE(visibility)'; end if;
  if not has_table_privilege('service_role', 'public.profile_public_snapshots', 'DELETE') then missing := missing || 'snapshots DELETE'; end if;

  if array_length(missing, 1) is not null then
    raise exception '0012 grants missing: %', array_to_string(missing, ', ');
  end if;
  raise notice 'G1 OK: 0012 minimum grants present for service_role';
end
$$;

\echo === G2 [HARD] 0012 did not over-grant: no privileges on unrelated domain tables ===
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'media_assets', 'media_variants', 'roles', 'user_role_assignments'] loop
    if has_table_privilege('service_role', 'public.' || t, 'SELECT')
       or has_table_privilege('service_role', 'public.' || t, 'INSERT')
       or has_table_privilege('service_role', 'public.' || t, 'UPDATE')
       or has_table_privilege('service_role', 'public.' || t, 'DELETE') then
      raise exception 'G2 FAIL: 0012 over-granted on public.%', t;
    end if;
  end loop;
  raise notice 'G2 OK: 0012 grants are scoped to the two writer tables';
end
$$;

\echo === W1..W9 trusted writer: every documented write path under the applied grants ===
set role service_role;
select current_user, (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls;

\echo === W1 INSERT publication (Carol v2, draft) ===
insert into public.profile_publications (id, profile_id, version, state, published_at)
values ('a3333333-0000-0000-0000-000000000033', '33333333-3333-3333-3333-333333333333', 2, 'draft', null);

\echo === W2 INSERT snapshot + publish -> derived flag true ===
insert into public.profile_public_snapshots (id, publication_id, profile_id, version, visibility, content)
values ('c3333333-0000-0000-0000-000000000033', 'a3333333-0000-0000-0000-000000000033', '33333333-3333-3333-3333-333333333333', 2, 'public',
  '{"schemaVersion":1,"profile":{"displayName":"Carol"},"sections":[]}'::jsonb);
update public.profile_publications set state = 'published' where id = 'a3333333-0000-0000-0000-000000000033';
do $$ begin
  if (select is_publicly_visible from public.profile_publications where id='a3333333-0000-0000-0000-000000000033') is not true then
    raise exception 'W2 FAIL: derived flag should be true after publish + public snapshot';
  end if;
  raise notice 'W2 OK: publish recomputed the derived flag to true';
end $$;

\echo === W3 UPDATE snapshot visibility -> unpublished -> flag false ===
update public.profile_public_snapshots set visibility = 'unpublished' where id = 'c3333333-0000-0000-0000-000000000033';
do $$ begin
  if (select is_publicly_visible from public.profile_publications where id='a3333333-0000-0000-0000-000000000033') is not false then
    raise exception 'W3 FAIL: derived flag should be false after snapshot unpublished';
  end if;
  raise notice 'W3 OK: snapshot visibility change recomputed the derived flag to false';
end $$;

\echo === W4 UPDATE snapshot visibility -> public -> flag true ===
update public.profile_public_snapshots set visibility = 'public' where id = 'c3333333-0000-0000-0000-000000000033';
do $$ begin
  if (select is_publicly_visible from public.profile_publications where id='a3333333-0000-0000-0000-000000000033') is not true then
    raise exception 'W4 FAIL: derived flag should be true again';
  end if;
  raise notice 'W4 OK: snapshot visibility change recomputed the derived flag to true';
end $$;

\echo === W5 UPDATE snapshot content (valid) ===
update public.profile_public_snapshots
  set content = '{"schemaVersion":1,"profile":{"displayName":"Carol2"},"sections":[]}'::jsonb
  where id = 'c3333333-0000-0000-0000-000000000033';

\echo === W6 DELETE snapshot -> flag false ===
delete from public.profile_public_snapshots where id = 'c3333333-0000-0000-0000-000000000033';
do $$ begin
  if (select is_publicly_visible from public.profile_publications where id='a3333333-0000-0000-0000-000000000033') is not false then
    raise exception 'W6 FAIL: derived flag should be false after snapshot deletion';
  end if;
  raise notice 'W6 OK: snapshot deletion recomputed the derived flag to false';
end $$;

\echo === W7 DELETE publication without snapshot ===
delete from public.profile_publications where id = 'a3333333-0000-0000-0000-000000000033';

\echo === W8 TAMPER flag while predicate false (Bob) -> trigger overrides ===
update public.profile_publications set is_publicly_visible = true where id = 'a2222222-0000-0000-0000-000000000002';
do $$ begin
  if (select is_publicly_visible from public.profile_publications where id='a2222222-0000-0000-0000-000000000002') is not false then
    raise exception 'W8 FAIL: direct flag manipulation was not overridden by the trigger';
  end if;
  raise notice 'W8 OK: direct is_publicly_visible manipulation is overridden (derived flag authoritative)';
end $$;

\echo === W9 change publication_id (same profile) recomputes both parents ===
insert into public.profile_publications (id, profile_id, version, state, published_at)
values ('a5555555-0000-0000-0000-000000000055', '11111111-1111-1111-1111-111111111111', 2, 'published', now());
update public.profile_public_snapshots set publication_id = 'a5555555-0000-0000-0000-000000000055', version = 2
  where id = 'c1111111-0000-0000-0000-000000000001';
do $$ begin
  if (select is_publicly_visible from public.profile_publications where id='a1111111-0000-0000-0000-000000000001') is not false then
    raise exception 'W9 FAIL: old parent flag should be false';
  end if;
  if (select is_publicly_visible from public.profile_publications where id='a5555555-0000-0000-0000-000000000055') is not true then
    raise exception 'W9 FAIL: new parent flag should be true';
  end if;
  raise notice 'W9 OK: publication_id change recomputed both parents';
end $$;
update public.profile_public_snapshots set publication_id = 'a1111111-0000-0000-0000-000000000001', version = 1
  where id = 'c1111111-0000-0000-0000-000000000001';
delete from public.profile_publications where id = 'a5555555-0000-0000-0000-000000000055';
reset role;

\echo === N1 [HARD] revoke UPDATE(publications.is_publicly_visible) -> AFTER trigger fails ===
revoke update (is_publicly_visible) on public.profile_publications from service_role;
set role service_role;
do $$
begin
  begin
    update public.profile_public_snapshots set visibility = 'unpublished' where id = 'c1111111-0000-0000-0000-000000000001';
    raise exception 'N1 FAIL: snapshot update ran without UPDATE on the derived flag column';
  exception when insufficient_privilege then
    raise notice 'N1 OK: AFTER trigger requires invoker UPDATE(publications.is_publicly_visible)';
  end;
end
$$;
reset role;
grant update (is_publicly_visible) on public.profile_publications to service_role;

\echo === N2 [HARD] revoke SELECT(snapshots.publication_id,visibility) -> BEFORE trigger fails ===
revoke select (publication_id, visibility) on public.profile_public_snapshots from service_role;
set role service_role;
do $$
begin
  begin
    update public.profile_publications set state = 'published' where id = 'a3333333-0000-0000-0000-000000000003';
    raise exception 'N2 FAIL: publication update ran without the snapshot SELECT required by the BEFORE trigger';
  exception when insufficient_privilege then
    raise notice 'N2 OK: BEFORE trigger requires invoker SELECT(snapshots.publication_id,visibility)';
  end;
end
$$;
reset role;
grant select (publication_id, visibility) on public.profile_public_snapshots to service_role;

\echo === N3 [HARD] revoke UPDATE(publications.state) -> publish/unpublish fails ===
revoke update (state) on public.profile_publications from service_role;
set role service_role;
do $$
begin
  begin
    update public.profile_publications set state = 'unpublished' where id = 'a2222222-0000-0000-0000-000000000002';
    raise exception 'N3 FAIL: state update ran without UPDATE(state)';
  exception when insufficient_privilege then
    raise notice 'N3 OK: writer requires UPDATE(publications.state)';
  end;
end
$$;
reset role;
grant update (state) on public.profile_publications to service_role;

\echo === N4 [HARD] revoke INSERT(snapshots) -> snapshot creation fails ===
revoke insert (id, publication_id, profile_id, version, visibility, content) on public.profile_public_snapshots from service_role;
set role service_role;
do $$
begin
  begin
    insert into public.profile_public_snapshots (id, publication_id, profile_id, version, visibility, content)
    values ('c9999999-0000-0000-0000-000000000009', 'a4444444-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 1, 'public',
      '{"schemaVersion":1,"profile":{"displayName":"x"},"sections":[]}'::jsonb);
    raise exception 'N4 FAIL: snapshot insert ran without INSERT privilege';
  exception when insufficient_privilege then
    raise notice 'N4 OK: writer requires INSERT(snapshots)';
  end;
end
$$;
reset role;
grant insert (id, publication_id, profile_id, version, visibility, seo_title, seo_description, og_image_asset_id, content)
  on public.profile_public_snapshots to service_role;

\echo === N5 [HARD] revoke DELETE(snapshots) -> snapshot deletion fails ===
revoke delete on public.profile_public_snapshots from service_role;
set role service_role;
do $$
begin
  begin
    delete from public.profile_public_snapshots where id = 'c2222222-0000-0000-0000-000000000002';
    raise exception 'N5 FAIL: snapshot delete ran without DELETE privilege';
  exception when insufficient_privilege then
    raise notice 'N5 OK: writer requires DELETE(snapshots)';
  end;
end
$$;
reset role;
grant delete on public.profile_public_snapshots to service_role;

\echo === N6 [HARD] revoke UPDATE(publications) entirely -> AFTER trigger FOR UPDATE fails ===
revoke update on public.profile_publications from service_role;
set role service_role;
do $$
begin
  begin
    update public.profile_public_snapshots set visibility = 'public' where id = 'c1111111-0000-0000-0000-000000000001';
    raise exception 'N6 FAIL: snapshot update ran without any UPDATE on publications';
  exception when insufficient_privilege then
    raise notice 'N6 OK: AFTER trigger FOR UPDATE requires invoker UPDATE(publications)';
  end;
end
$$;
reset role;
grant update (profile_id, version, state, manifest_hash, manifest_ref, published_at, unpublished_at, failure_reason, is_publicly_visible)
  on public.profile_publications to service_role;

\echo === N7 [HARD] public roles remain without write privileges ===
do $$
begin
  if has_table_privilege('anon', 'public.profile_publications', 'INSERT') then raise exception 'N7 FAIL: anon has INSERT'; end if;
  if has_any_column_privilege('anon', 'public.profile_publications', 'UPDATE') then raise exception 'N7 FAIL: anon has column UPDATE'; end if;
  if has_table_privilege('authenticated', 'public.profile_public_snapshots', 'DELETE') then raise exception 'N7 FAIL: authenticated has DELETE'; end if;
  raise notice 'N7 OK: public roles have no write privileges';
end
$$;

\echo === I1 [HARD] derived-flag invariant across all publications ===
do $$
declare bad int;
begin
  select count(*) into bad
  from public.profile_publications pub
  where pub.is_publicly_visible is distinct from (
    (pub.state = 'published') and exists (
      select 1 from public.profile_public_snapshots s
      where s.publication_id = pub.id and s.visibility = 'public'));
  if bad <> 0 then raise exception 'I1 FAIL: % flag/predicate mismatch(es)', bad; end if;
  raise notice 'I1 OK: derived flag invariant holds under the applied 0012 grants';
end
$$;

rollback;

\echo === G3 [HARD] rollback restored data and kept the 0012 ACL ===
do $$
begin
  if (select count(*) from public.profile_publications) <> 4 then
    raise exception 'G3 FAIL: rollback did not restore the seed publication count';
  end if;
  if (select count(*) from public.profile_public_snapshots) <> 3 then
    raise exception 'G3 FAIL: rollback did not restore the seed snapshot count';
  end if;
  if not has_column_privilege('service_role', 'public.profile_publications', 'is_publicly_visible', 'UPDATE') then
    raise exception 'G3 FAIL: 0012 grants were not preserved after rollback';
  end if;
  raise notice 'G3 OK: rollback restored data and preserved the 0012 ACL';
end
$$;

\echo === 82_trusted_writer_grants: all expectations met ===
