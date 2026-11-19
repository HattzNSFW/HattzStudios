-- 00_preflight.sql — environment preflight for the local disposable validation database.
-- Informational plus hard assertions that the non-superuser stand-in roles exist.
\set ON_ERROR_STOP 1

\echo === VERSION ===
select version();

\echo === SERVER SETTINGS ===
show server_encoding;
show port;
show data_directory;
show client_encoding;
show timezone;

\echo === DATABASES (prior rounds must be preserved; the new round DB may or may not exist yet) ===
select oid, datname, pg_get_userbyid(datdba) as owner, pg_encoding_to_char(encoding) as encoding,
       datcollate, datctype
from pg_database
order by 1;

\echo === ROLES (local stand-ins, NOT equivalent to Supabase Auth/JWT) ===
select rolname, rolsuper, rolbypassrls, rolcanlogin, rolinherit
from pg_roles
where rolname in ('hattz_pg_admin', 'postgres', 'service_role', 'anon', 'authenticated')
order by 1;

\echo === HARD ASSERTIONS: required stand-in roles exist ===
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'preflight: role "anon" is missing';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'preflight: role "authenticated" is missing';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'preflight: role "service_role" is missing';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hattz_pg_admin') then
    raise exception 'preflight: role "hattz_pg_admin" is missing';
  end if;
  raise notice 'preflight: required stand-in roles present: OK';
end
$$;
