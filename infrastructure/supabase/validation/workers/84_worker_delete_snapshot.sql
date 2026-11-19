-- 84_worker_delete_snapshot.sql — concurrency worker: DELETE a snapshot (exercises the AFTER DELETE
-- branch of sync_snapshot_parent_visibility) while holding its locks.
--
-- Required psql vars: app, worker, note, snapid, delay
\set ON_ERROR_STOP 1
set application_name = :'app';
begin;
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'begin', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
delete from public.profile_public_snapshots where id = :'snapid';
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'locked', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
select pg_sleep(:delay::float);
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'end', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
commit;
