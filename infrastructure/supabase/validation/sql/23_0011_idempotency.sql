-- 23_0011_idempotency.sql — assert the identity constraints exist exactly once (by definition,
-- not by name). The driver runs this BEFORE and AFTER re-applying 0011 to prove the migration is
-- genuinely idempotent (no duplicate constraints, no error on re-application).
\set ON_ERROR_STOP 1

do $$
declare
  u int;
  f int;
begin
  select count(*) into u
  from pg_constraint con
  where con.conrelid = 'public.profile_publications'::regclass
    and con.contype = 'u'
    and (
      select array_agg(a.attname::text order by a.attname::text)
      from unnest(con.conkey) as k(attnum)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
    ) = array['id', 'profile_id', 'version'];

  select count(*) into f
  from pg_constraint con
  where con.conrelid = 'public.profile_public_snapshots'::regclass
    and con.contype = 'f'
    and con.confrelid = 'public.profile_publications'::regclass
    and (
      select array_agg(a.attname::text order by a.attname::text)
      from unnest(con.conkey) as k(attnum)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
    ) = array['profile_id', 'publication_id', 'version'];

  if u <> 1 then
    raise exception 'idempotency: expected exactly 1 candidate key, found %', u;
  end if;
  if f <> 1 then
    raise exception 'idempotency: expected exactly 1 identity FK, found %', f;
  end if;
  raise notice '0011 idempotency: candidate key = 1, identity FK = 1: OK';
end
$$;
