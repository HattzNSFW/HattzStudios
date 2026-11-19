-- 72_slug_integrity.sql — slug integrity verification (§7).
--
-- Enforced by the migrations and proven here in runtime:
--   * Global uniqueness of the CURRENT slug (case-insensitive) — partial unique index
--     `ux_profile_slugs_slug_current ON (lower(slug)) WHERE is_current = true` (0002).
--   * One CURRENT slug per profile (rule 1) — partial unique index
--     `ux_profile_slugs_current_per_profile ON (profile_id) WHERE is_current = true` (0013).
--
-- Still PENDING (no approved business rule -> NOT implemented; Owner decision):
--   * history policy for retired slugs (rule 2);
--   * protection of `reserved` slugs (rule 4);
--   * input normalization algorithm (rule 8) — the DB already only ACCEPTS canonical form
--     (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, length 3..48); the transform of raw user input is app-side.
--
-- Every enforced expectation is a HARD failure (only `unique_violation` counts as the expected
-- rejection). All mutations run in a transaction that is ROLLED BACK, so the seed state is intact.
\set ON_ERROR_STOP 1

begin;

\echo === [INFO] slug index definitions ===
select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'profile_slugs'
order by indexname;

\echo === [HARD] both partial unique indexes exist (rules 1 and global uniqueness) ===
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'profile_slugs'
      and indexname = 'ux_profile_slugs_slug_current'
      and indexdef ilike '%unique%lower(slug)%where%is_current = true%'
  ) then
    raise exception 'slug: global current-slug unique index missing/changed';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'profile_slugs'
      and indexname = 'ux_profile_slugs_current_per_profile'
      and indexdef ilike '%unique%profile_id%where%is_current = true%'
  ) then
    raise exception 'slug: one-current-slug-per-profile unique index missing/changed';
  end if;
  raise notice 'slug: partial unique indexes for global + per-profile current slug: OK';
end
$$;

\echo === [HARD] global current-slug uniqueness is enforced ===
do $$
begin
  begin
    insert into public.profile_slugs (profile_id, slug, is_current)
    values ('22222222-2222-2222-2222-222222222222', 'alice-public', true);
    raise exception 'slug: a second current row with the same lower(slug) was ACCEPTED';
  exception
    when unique_violation then
      raise notice 'slug: duplicate current slug rejected (global uniqueness enforced): OK';
  end;
end
$$;

\echo === [HARD] one current slug per profile is enforced (rule 1, 0013) ===
do $$
begin
  begin
    insert into public.profile_slugs (profile_id, slug, is_current)
    values ('44444444-4444-4444-4444-444444444444', 'dave-alias', true);
    raise exception 'slug: a second current slug for profile Dave was ACCEPTED';
  exception
    when unique_violation then
      raise notice 'slug: second current slug for the same profile rejected (rule 1 enforced): OK';
  end;
end
$$;

\echo === [HARD] atomic swap (retire old + activate new in one transaction) keeps exactly one current ===
do $$
begin
  update public.profile_slugs set is_current = false, retired_at = now()
    where profile_id = '44444444-4444-4444-4444-444444444444' and is_current = true;
  insert into public.profile_slugs (profile_id, slug, is_current)
    values ('44444444-4444-4444-4444-444444444444', 'dave-new', true);
  if (select count(*) from public.profile_slugs
      where profile_id = '44444444-4444-4444-4444-444444444444' and is_current) <> 1 then
    raise exception 'slug: swap did not end with exactly one current slug';
  end if;
  raise notice 'slug: atomic swap leaves exactly one current slug: OK';
end
$$;

\echo === [INFO/PENDING] reserved slugs are NOT protected by a defined rule (rule 4) ===
do $$
begin
  insert into public.profile_slugs (profile_id, slug, is_current, reserved)
  values ('22222222-2222-2222-2222-222222222222', 'alice-public', false, true);
  raise notice 'slug PENDING: a reserved row reusing an existing current slug was ACCEPTED (reserved protection not defined by an approved rule)';
end
$$;

rollback;

\echo === [HARD] rollback restored the seed slug state ===
do $$
begin
  if (select count(*) from public.profile_slugs where slug in ('alice-public', 'dave-alias', 'dave-new')) <> 1 then
    raise exception 'slug cleanup: unexpected slug rows remain';
  end if;
  raise notice 'slug: seed state restored: OK';
end
$$;
