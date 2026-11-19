-- 20_verify_0011.sql — migration 0011 identity-integrity verification.
--
-- Runs on an EMPTY, freshly migrated database (before the seed) and cleans up after itself.
-- Every expectation is a HARD failure: an improperly accepted write raises an exception, and a
-- rejection is only accepted when it is exactly `foreign_key_violation`. Any other error
-- (including a different constraint violation) propagates and makes psql exit non-zero.
\set ON_ERROR_STOP 1

\echo === [INFO] constraints on publications/snapshots ===
select conrelid::regclass as tbl, conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid in ('public.profile_publications'::regclass, 'public.profile_public_snapshots'::regclass)
  and contype in ('p', 'u', 'f')
order by 1, 2;

\echo === [HARD] candidate key exactly (id, profile_id, version) exists once ===
do $$
declare
  n int;
begin
  select count(*) into n
  from pg_constraint con
  where con.conrelid = 'public.profile_publications'::regclass
    and con.contype = 'u'
    and (
      select array_agg(a.attname::text order by a.attname::text)
      from unnest(con.conkey) as k(attnum)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
    ) = array['id', 'profile_id', 'version'];
  if n <> 1 then
    raise exception '0011: expected exactly 1 unique constraint on (id, profile_id, version), found %', n;
  end if;
  raise notice '0011: candidate key (id, profile_id, version): OK';
end
$$;

\echo === [HARD] composite identity FK is exactly (publication_id, profile_id, version) -> (id, profile_id, version) ===
do $$
declare
  n int;
begin
  select count(*) into n
  from pg_constraint con
  where con.conrelid = 'public.profile_public_snapshots'::regclass
    and con.contype = 'f'
    and con.confrelid = 'public.profile_publications'::regclass
    and (
      select array_agg(a.attname::text order by a.attname::text)
      from unnest(con.conkey) as k(attnum)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
    ) = array['profile_id', 'publication_id', 'version']
    and (
      select array_agg(a.attname::text order by a.attname::text)
      from unnest(con.confkey) as k(attnum)
      join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum
    ) = array['id', 'profile_id', 'version'];
  if n <> 1 then
    raise exception '0011: expected exactly 1 composite identity FK, found %', n;
  end if;
  raise notice '0011: composite identity FK exact match: OK';
end
$$;

\echo === [HARD] legacy single-column FK to publications(id) is gone ===
do $$
declare
  n int;
begin
  select count(*) into n
  from pg_constraint con
  where con.conrelid = 'public.profile_public_snapshots'::regclass
    and con.contype = 'f'
    and con.confrelid = 'public.profile_publications'::regclass
    and (
      select array_agg(a.attname::text order by a.attname::text)
      from unnest(con.conkey) as k(attnum)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
    ) = array['publication_id'];
  if n <> 0 then
    raise exception '0011: single-column publication_id FK still present (% occurrences)', n;
  end if;
  raise notice '0011: legacy single-column FK absent: OK';
end
$$;

\echo === [HARD] identity columns are NOT NULL (composite FK cannot be escaped via NULL) ===
do $$
declare
  r record;
begin
  for r in
    select a.attname, a.attnotnull
    from pg_attribute a
    where a.attrelid = 'public.profile_public_snapshots'::regclass
      and a.attname in ('publication_id', 'profile_id', 'version')
    order by a.attname
  loop
    if not r.attnotnull then
      raise exception '0011: column % is nullable — composite FK could be escaped via a NULL component', r.attname;
    end if;
  end loop;
  raise notice '0011: identity columns NOT NULL: OK';
end
$$;

\echo === RESET fixtures (disposable DB only) ===
truncate public.profile_public_snapshots, public.profile_publications, public.profiles restart identity cascade;

\echo === SETUP identity fixtures (Alice, Bob, Zed; publications for Alice/Bob) ===
insert into public.profiles (id, technical_id, display_name, status) values
  ('11111111-1111-1111-1111-111111111111', 'tech-alice', 'Alice', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'tech-bob', 'Bob', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'tech-zed', 'Zed', 'active');
insert into public.profile_publications (id, profile_id, version, state) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 'published'),
  ('a2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 1, 'published');

\echo === N1 valid identity insert -> HARD expect success ===
insert into public.profile_public_snapshots
  (id, publication_id, profile_id, version, visibility, content)
values
  ('c1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 1, 'public',
   '{"schemaVersion":1,"profile":{"displayName":"Alice"},"sections":[]}'::jsonb);
do $$
begin
  if (select count(*) from public.profile_public_snapshots
      where id = 'c1111111-0000-0000-0000-000000000001') <> 1 then
    raise exception 'N1 FAIL: valid identity insert did not persist';
  end if;
  raise notice 'N1 OK: valid identity insert persisted';
end
$$;

\echo === N2 cross-profile mismatch (Bob pub + Alice profile) -> HARD expect foreign_key_violation only ===
do $$
begin
  begin
    insert into public.profile_public_snapshots
      (publication_id, profile_id, version, visibility, content)
    values
      ('a2222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 1, 'public',
       '{"schemaVersion":1,"profile":{"displayName":"X"},"sections":[]}'::jsonb);
    raise exception 'N2 FAIL: cross-profile snapshot was ACCEPTED (identity FK did not reject)';
  exception
    when foreign_key_violation then
      raise notice 'N2 OK: cross-profile snapshot rejected by identity FK';
  end;
end
$$;

\echo === N3 wrong version (Bob pub v1 + Bob profile v2) -> HARD expect foreign_key_violation only ===
do $$
begin
  begin
    insert into public.profile_public_snapshots
      (publication_id, profile_id, version, visibility, content)
    values
      ('a2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 2, 'public',
       '{"schemaVersion":1,"profile":{"displayName":"X"},"sections":[]}'::jsonb);
    raise exception 'N3 FAIL: wrong-version snapshot was ACCEPTED (identity FK did not reject)';
  exception
    when foreign_key_violation then
      raise notice 'N3 OK: wrong-version snapshot rejected by identity FK';
  end;
end
$$;

\echo === N4 UPDATE snapshot profile_id to another profile -> HARD expect foreign_key_violation only ===
do $$
begin
  begin
    update public.profile_public_snapshots
      set profile_id = '22222222-2222-2222-2222-222222222222'
      where id = 'c1111111-0000-0000-0000-000000000001';
    raise exception 'N4 FAIL: snapshot profile_id change to another profile was ACCEPTED';
  exception
    when foreign_key_violation then
      raise notice 'N4 OK: snapshot profile_id mismatch rejected by identity FK';
  end;
end
$$;

\echo === N5 UPDATE snapshot version to a wrong version -> HARD expect foreign_key_violation only ===
do $$
begin
  begin
    update public.profile_public_snapshots
      set version = 99
      where id = 'c1111111-0000-0000-0000-000000000001';
    raise exception 'N5 FAIL: snapshot version change to an unpublished version was ACCEPTED';
  exception
    when foreign_key_violation then
      raise notice 'N5 OK: snapshot version mismatch rejected by identity FK';
  end;
end
$$;

\echo === N5b UPDATE snapshot publication_id to a different profile publication -> HARD expect foreign_key_violation only ===
do $$
begin
  begin
    update public.profile_public_snapshots
      set publication_id = 'a2222222-0000-0000-0000-000000000002'
      where id = 'c1111111-0000-0000-0000-000000000001';
    raise exception 'N5b FAIL: snapshot publication_id change to another profile was ACCEPTED';
  exception
    when foreign_key_violation then
      raise notice 'N5b OK: snapshot publication_id mismatch rejected by identity FK';
  end;
end
$$;

\echo === N7 publication identity change inconsistent with snapshot (version) -> HARD expect foreign_key_violation only ===
do $$
begin
  begin
    update public.profile_publications set version = 99
      where id = 'a1111111-0000-0000-0000-000000000001';
    raise exception 'N7 FAIL: publication version change that orphans its snapshot was ACCEPTED';
  exception
    when foreign_key_violation then
      raise notice 'N7 OK: publication version change inconsistent with snapshot rejected by identity FK';
  end;
end
$$;

\echo === N7b publication identity change inconsistent with snapshot (profile_id) -> HARD expect foreign_key_violation only ===
do $$
begin
  begin
    update public.profile_publications set profile_id = '33333333-3333-3333-3333-333333333333'
      where id = 'a1111111-0000-0000-0000-000000000001';
    raise exception 'N7b FAIL: publication profile_id change that orphans its snapshot was ACCEPTED';
  exception
    when foreign_key_violation then
      raise notice 'N7b OK: publication profile_id change inconsistent with snapshot rejected by identity FK';
  end;
end
$$;

\echo === N8 NULL identity components -> HARD expect rejection (not_null_violation) ===
do $$
declare
  col text;
  stmt text;
begin
  foreach col in array array['publication_id', 'profile_id', 'version'] loop
    stmt := format(
      'insert into public.profile_public_snapshots (publication_id, profile_id, version, visibility, content) '
      || 'values (%s, %s, %s, %s, %L::jsonb)',
      case when col = 'publication_id' then 'null' else quote_literal('a1111111-0000-0000-0000-000000000001') end,
      case when col = 'profile_id' then 'null' else quote_literal('11111111-1111-1111-1111-111111111111') end,
      case when col = 'version' then 'null' else '1' end,
      quote_literal('public'),
      '{"schemaVersion":1,"profile":{"displayName":"A"},"sections":[]}'
    );
    begin
      execute stmt;
      raise exception 'N8 FAIL: NULL % was ACCEPTED (composite FK escaped via NULL)', col;
    exception
      when not_null_violation then
        raise notice 'N8 OK: NULL % rejected (not_null_violation)', col;
    end;
  end loop;
end
$$;

\echo === N6 identity-preserving UPDATE -> HARD expect success ===
update public.profile_public_snapshots
  set visibility = 'unpublished'
  where id = 'c1111111-0000-0000-0000-000000000001';
do $$
begin
  if (select visibility from public.profile_public_snapshots
      where id = 'c1111111-0000-0000-0000-000000000001') <> 'unpublished' then
    raise exception 'N6 FAIL: identity-preserving update did not persist';
  end if;
  raise notice 'N6 OK: identity-preserving update persisted';
end
$$;

\echo === CLEANUP (leave the DB empty for the seed) ===
truncate public.profile_public_snapshots, public.profile_publications, public.profiles restart identity cascade;
do $$
begin
  if (select count(*) from public.profile_public_snapshots) <> 0 then
    raise exception 'cleanup failed: snapshots remain';
  end if;
  raise notice '20_verify_0011: all identity-integrity expectations met';
end
$$;
