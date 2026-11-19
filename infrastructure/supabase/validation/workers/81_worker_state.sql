-- 81_worker_state.sql — concurrency worker: change publication STATE inside a transaction,
-- hold the row lock via pg_sleep, then commit.
--
-- Emits a trace row (begin/locked/end) so the driver can prove the two transactions actually
-- overlapped. `locked` is written immediately after the DML returns, i.e. after the row lock is
-- held; if this worker blocks on another transaction, `locked` is delayed until that lock clears.
--
-- Required psql vars: app, worker, note, st, pub, delay
\set ON_ERROR_STOP 1
set application_name = :'app';
begin;
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'begin', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
update public.profile_publications set state = :'st'::public.publication_state where id = :'pub';
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'locked', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
select pg_sleep(:delay::float);
insert into validation.conc_trace (worker, phase, ts, pid, app, note)
  values (:'worker', 'end', clock_timestamp(), pg_backend_pid(),
          current_setting('application_name'), :'note');
commit;
