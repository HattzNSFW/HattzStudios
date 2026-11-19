-- 83_worker_insert_snapshot.sql — concurrency worker: INSERT a public snapshot for a publication
-- (exercises the AFTER INSERT branch of sync_snapshot_parent_visibility) while holding its locks.
--
-- Required psql vars: app, worker, note, snapid, pub, profile, version, vis, delay
\set ON_ERROR_STOP 1
set application_name = :'app';
begin;
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'begin', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
insert into public.profile_public_snapshots (id, publication_id, profile_id, version, visibility, content)
  values (:'snapid', :'pub', :'profile', :'version'::bigint, :'vis'::public.profile_visibility,
          '{"schemaVersion":1,"profile":{"displayName":"Concurrency"},"sections":[]}'::jsonb);
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'locked', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
select pg_sleep(:delay::float);
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'end', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
commit;
