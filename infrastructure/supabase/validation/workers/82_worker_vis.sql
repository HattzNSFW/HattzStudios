-- 82_worker_vis.sql — concurrency worker: change snapshot VISIBILITY inside a transaction,
-- hold the row lock via pg_sleep, then commit. See 81_worker_state.sql for the trace protocol.
--
-- Required psql vars: app, worker, note, vis, snap, delay
\set ON_ERROR_STOP 1
set application_name = :'app';
begin;
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'begin', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
update public.profile_public_snapshots set visibility = :'vis'::public.profile_visibility where id = :'snap';
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'locked', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
select pg_sleep(:delay::float);
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'end', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
commit;
