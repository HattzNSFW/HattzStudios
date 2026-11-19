-- 85_worker_move_publication.sql — concurrency worker: change a snapshot's publication_id (and
-- version, keeping the composite identity FK satisfied) so the AFTER UPDATE trigger must recompute
-- BOTH the old and the new parent publication. Holds locks via pg_sleep.
--
-- Required psql vars: app, worker, note, snapid, newpub, version, delay
\set ON_ERROR_STOP 1
set application_name = :'app';
begin;
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'begin', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
update public.profile_public_snapshots
  set publication_id = :'newpub', version = :'version'::bigint
  where id = :'snapid';
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'locked', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
select pg_sleep(:delay::float);
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'end', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
commit;
