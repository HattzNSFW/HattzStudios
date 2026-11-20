# 90_concurrency.ps1 — corrected concurrency driver (round 5).
#
# Fixes the false-positive flaw of the previous round-4 driver:
#   * every worker process exit code is checked;
#   * stdout and stderr are redirected to SEPARATE files per worker;
#   * overlap is PROVEN (polling pg_stat_activity + trace intervals), not assumed;
#   * final publication.state AND snapshot.visibility are compared to the scenario targets;
#   * the derived flag is compared to BOTH the expected value and the recomputed predicate;
#   * the run fails (and the whole script exits non-zero) on any failure/timeout/wrong state.
#
# Scenarios (all six originals are preserved, plus INSERT / DELETE / publication_id-change):
#   S1 both-hidden   S2 both-visible   S3 draft+vispub   S4 pub+visunpub
#   S5 state-draft   S6 vis-unpub      S7 insert-snapshot  S8 delete-snapshot  S9 move-publication
# Each scenario runs $Runs times with the two operations launched in ALTERNATING order.
#
# Run as the owner role (hattz_pg_admin). Exit code 0 = every run passed.
[CmdletBinding()]
param(
  [string]$Database          = 'hattz_phase2b_validation_6',
  [string]$PgHost      = '127.0.0.1',
  [int]   $Port        = 55432,
  [string]$User        = 'hattz_pg_admin',
  [string]$LogDir      = 'C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\logs\phase2b_validation_6',
  [int]   $Runs        = 3,
  [string]$Delay       = '2.0',
  [int]   $TimeoutSec  = 60,
  [string]$PsqlPath    = '',
  [string]$PgPassFile  = ''
)

$ErrorActionPreference = 'Continue'
if (-not $PsqlPath) {
  if ($env:HATTZ_PSQL_PATH) { $PsqlPath = $env:HATTZ_PSQL_PATH }
  else { $PsqlPath = 'C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\pgsql\pgsql\bin\psql.exe' }
}
if (-not $PgPassFile) {
  if ($env:PGPASSFILE) { $PgPassFile = $env:PGPASSFILE }
  else { $PgPassFile = 'C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\run\pgpass.conf' }
}
if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
  Write-Output "FATAL: psql não encontrado: $PsqlPath"; exit 4
}
if (-not (Test-Path -LiteralPath $PgPassFile -PathType Leaf)) {
  Write-Output 'FATAL: arquivo PGPASSFILE não encontrado.'; exit 4
}
# Credenciais ficam somente neste arquivo; seu conteúdo nunca é gravado em logs.
$env:PGPASSFILE = $PgPassFile
$psql = $PsqlPath
$WorkersDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'workers'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$ALICE = '11111111-1111-1111-1111-111111111111'
$PUB1  = 'a1111111-0000-0000-0000-000000000001'
$PUB5  = 'a5555555-0000-0000-0000-000000000005'
$SNAP1 = 'c1111111-0000-0000-0000-000000000001'
$CONTENT = '{"schemaVersion":1,"profile":{"displayName":"Alice"},"sections":[]}'

$script:failures = @()
function Fail([string]$msg) { $script:failures += $msg; Write-Output "  FAIL: $msg" }

function Q([string]$sql) {
  return ((& $psql -h $PgHost -p $Port -U $User -d $Database -tAc $sql 2>$null | Out-String).Trim())
}
function Exec([string]$sql) {
  # Write SQL to a temp file and use -f: PowerShell 5.1 mangles inline -c arguments that contain
  # double quotes (e.g. JSON literals), which would silently corrupt the statement.
  $tmp = Join-Path $LogDir '90_conc_exec_tmp.sql'
  [System.IO.File]::WriteAllText($tmp, $sql, (New-Object System.Text.UTF8Encoding($false)))
  $out = & $psql -h $PgHost -p $Port -U $User -d $Database -v ON_ERROR_STOP=1 -f $tmp 2>&1
  return @{ code = $LASTEXITCODE; out = (($out | Out-String).Trim()) }
}

# --- reset helpers -----------------------------------------------------------------------------
function Reset-Alice([string]$state, [string]$vis) {
  return @"
delete from public.profile_public_snapshots where id='$SNAP1';
delete from public.profile_publications where id='$PUB5';
insert into public.profile_publications (id, profile_id, version, state) values ('$PUB1','$ALICE',1,'$state')
  on conflict (id) do update set profile_id=excluded.profile_id, version=excluded.version, state=excluded.state;
insert into public.profile_public_snapshots (id, publication_id, profile_id, version, visibility, content)
  values ('$SNAP1','$PUB1','$ALICE',1,'$vis','$CONTENT'::jsonb);
"@
}
function Reset-AliceNoSnap([string]$state) {
  return @"
delete from public.profile_public_snapshots where id='$SNAP1';
delete from public.profile_publications where id='$PUB5';
insert into public.profile_publications (id, profile_id, version, state) values ('$PUB1','$ALICE',1,'$state')
  on conflict (id) do update set profile_id=excluded.profile_id, version=excluded.version, state=excluded.state;
"@
}
function Reset-Move() {
  return @"
delete from public.profile_public_snapshots where id='$SNAP1';
delete from public.profile_publications where id='$PUB5';
insert into public.profile_publications (id, profile_id, version, state) values ('$PUB1','$ALICE',1,'published')
  on conflict (id) do update set profile_id=excluded.profile_id, version=excluded.version, state=excluded.state;
insert into public.profile_publications (id, profile_id, version, state) values ('$PUB5','$ALICE',2,'published')
  on conflict (id) do update set profile_id=excluded.profile_id, version=excluded.version, state=excluded.state;
insert into public.profile_public_snapshots (id, publication_id, profile_id, version, visibility, content)
  values ('$SNAP1','$PUB1','$ALICE',1,'public','$CONTENT'::jsonb);
"@
}

# --- scenarios ---------------------------------------------------------------------------------
$scenarios = @(
  @{ key='S1'; name='both-hidden';  reset=(Reset-Alice 'published' 'public');      start='t';
     ops=@( @{ role='A'; file='81_worker_state.sql'; vars=@{ st='draft';     pub=$PUB1 } },
            @{ role='B'; file='82_worker_vis.sql';   vars=@{ vis='unpublished'; snap=$SNAP1 } } );
     expect=@{ pub=$PUB1; state='draft'; snapPresent=$true; vis='unpublished'; snapPub=$PUB1; flags=@{ $PUB1='f' } } },

  @{ key='S2'; name='both-visible'; reset=(Reset-Alice 'draft' 'unpublished');    start='f';
     ops=@( @{ role='A'; file='81_worker_state.sql'; vars=@{ st='published'; pub=$PUB1 } },
            @{ role='B'; file='82_worker_vis.sql';   vars=@{ vis='public';      snap=$SNAP1 } } );
     expect=@{ pub=$PUB1; state='published'; snapPresent=$true; vis='public'; snapPub=$PUB1; flags=@{ $PUB1='t' } } },

  @{ key='S3'; name='draft-vispub'; reset=(Reset-Alice 'draft' 'unpublished');    start='f';
     ops=@( @{ role='A'; file='81_worker_state.sql'; vars=@{ st='draft';     pub=$PUB1 } },
            @{ role='B'; file='82_worker_vis.sql';   vars=@{ vis='public';      snap=$SNAP1 } } );
     expect=@{ pub=$PUB1; state='draft'; snapPresent=$true; vis='public'; snapPub=$PUB1; flags=@{ $PUB1='f' } } },

  @{ key='S4'; name='pub-visunpub'; reset=(Reset-Alice 'draft' 'unpublished');    start='f';
     ops=@( @{ role='A'; file='81_worker_state.sql'; vars=@{ st='published'; pub=$PUB1 } },
            @{ role='B'; file='82_worker_vis.sql';   vars=@{ vis='unpublished'; snap=$SNAP1 } } );
     expect=@{ pub=$PUB1; state='published'; snapPresent=$true; vis='unpublished'; snapPub=$PUB1; flags=@{ $PUB1='f' } } },

  @{ key='S5'; name='state-draft';  reset=(Reset-Alice 'published' 'public');      start='t';
     ops=@( @{ role='A'; file='81_worker_state.sql'; vars=@{ st='draft';     pub=$PUB1 } },
            @{ role='B'; file='82_worker_vis.sql';   vars=@{ vis='public';      snap=$SNAP1 } } );
     expect=@{ pub=$PUB1; state='draft'; snapPresent=$true; vis='public'; snapPub=$PUB1; flags=@{ $PUB1='f' } } },

  @{ key='S6'; name='vis-unpub';    reset=(Reset-Alice 'published' 'public');      start='t';
     ops=@( @{ role='A'; file='81_worker_state.sql'; vars=@{ st='published'; pub=$PUB1 } },
            @{ role='B'; file='82_worker_vis.sql';   vars=@{ vis='unpublished'; snap=$SNAP1 } } );
     expect=@{ pub=$PUB1; state='published'; snapPresent=$true; vis='unpublished'; snapPub=$PUB1; flags=@{ $PUB1='f' } } },

  @{ key='S7'; name='insert-snapshot'; reset=(Reset-AliceNoSnap 'draft');          start='f';
     ops=@( @{ role='A'; file='83_worker_insert_snapshot.sql'; vars=@{ snapid=$SNAP1; pub=$PUB1; profile=$ALICE; version='1'; vis='public' } },
            @{ role='B'; file='81_worker_state.sql';           vars=@{ st='published'; pub=$PUB1 } } );
     expect=@{ pub=$PUB1; state='published'; snapPresent=$true; vis='public'; snapPub=$PUB1; flags=@{ $PUB1='t' } } },

  @{ key='S8'; name='delete-snapshot'; reset=(Reset-Alice 'published' 'public');   start='t';
     ops=@( @{ role='A'; file='84_worker_delete_snapshot.sql'; vars=@{ snapid=$SNAP1 } },
            @{ role='B'; file='81_worker_state.sql';           vars=@{ st='draft'; pub=$PUB1 } } );
     expect=@{ pub=$PUB1; state='draft'; snapPresent=$false; flags=@{ $PUB1='f' } } },

  @{ key='S9'; name='move-publication'; reset=(Reset-Move);                         start='t';
     ops=@( @{ role='A'; file='85_worker_move_publication.sql'; vars=@{ snapid=$SNAP1; newpub=$PUB5; version='2' } },
            @{ role='B'; file='81_worker_state.sql';            vars=@{ st='draft'; pub=$PUB1 } } );
     expect=@{ pub=$PUB1; state='draft'; snapPresent=$true; vis='public'; snapPub=$PUB5; flags=@{ $PUB1='f'; $PUB5='t' } } }
)

# --- trace table -------------------------------------------------------------------------------
$setup = @(
  "create schema if not exists validation",
  "drop table if exists validation.conc_trace",
  "create table validation.conc_trace (id bigserial primary key, worker text, phase text, ts timestamptz, pid int, app text, note text)"
)
foreach ($s in $setup) {
  $r = Exec $s
  if ($r.code -ne 0) { Fail "trace setup failed: $($r.out)"; Write-Output "FATAL: trace setup failed"; exit 2 }
}

function Start-Worker([hashtable]$op, [string]$app, [string]$note, [string]$tag) {
  $argList = @('-h',$PgHost,'-p',$Port,'-U',$User,'-d',$Database,'-v','ON_ERROR_STOP=1',
               '-v',"app=$app",'-v',"worker=$($op.role)",'-v',"note=$note",'-v',"delay=$Delay")
  foreach ($k in $op.vars.Keys) { $argList += @('-v', "$k=$($op.vars[$k])") }
  $argList += @('-f', (Join-Path $WorkersDir $op.file))
  # Start-Process -PassThru does NOT expose ExitCode reliably when output is redirected
  # (observed: null after WaitForExit+Refresh), so use the .NET Process API which does.
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName               = $psql
  $psi.UseShellExecute        = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true
  $psi.CreateNoWindow         = $true
  $psi.Arguments = (($argList | ForEach-Object { '"' + ([string]$_ -replace '"','\"') + '"' }) -join ' ')
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  [void]$proc.Start()
  Add-Member -InputObject $proc -NotePropertyName OutFile -NotePropertyValue (Join-Path $LogDir "90_conc_${note}_$tag.out")
  Add-Member -InputObject $proc -NotePropertyName ErrFile -NotePropertyValue (Join-Path $LogDir "90_conc_${note}_$tag.err")
  Add-Member -InputObject $proc -NotePropertyName Tag -NotePropertyValue $tag
  return $proc
}

$summary = @()
Write-Output "=== concurrency driver: $($scenarios.Count) scenarios x $Runs runs = $($scenarios.Count * $Runs) runs ==="

foreach ($s in $scenarios) {
  for ($run = 1; $run -le $Runs; $run++) {
    $note = "$($s.key)_r$run"
    $app1 = "conc_$($s.key)_A_$run"
    $app2 = "conc_$($s.key)_B_$run"

    # reset + assert start state
    $rr = Exec $s.reset
    if ($rr.code -ne 0) { Fail "$note reset failed: $($rr.out)"; continue }
    $startFlag = Q "select case when is_publicly_visible then 't' else 'f' end from public.profile_publications where id='$PUB1'"
    if ($startFlag -ne $s.start) { Fail "$note start flag expected $($s.start) got '$startFlag'"; continue }

    [void](Exec "truncate validation.conc_trace")

    # alternate launch order: odd runs A->B, even runs B->A
    $first = 0; $second = 1
    $order = 'A,B'
    if ($run % 2 -eq 0) { $first = 1; $second = 0; $order = 'B,A' }

    $tagFirst  = if ($first  -eq 0) { 'opA' } else { 'opB' }
    $tagSecond = if ($second -eq 0) { 'opA' } else { 'opB' }
    $appFirst  = if ($first  -eq 0) { $app1 } else { $app2 }
    $appSecond = if ($second -eq 0) { $app1 } else { $app2 }

    $p1 = Start-Worker $s.ops[$first]  $appFirst  $note $tagFirst
    Start-Sleep -Milliseconds 50
    $p2 = Start-Worker $s.ops[$second] $appSecond $note $tagSecond

    # Poll pg_stat_activity while both run. A single combined query per sample avoids the race of
    # three separate psql calls (a transaction can commit between them); we keep the maxima seen.
    $maxConc = 0; $maxBoth = 0; $lockSeen = $false; $timedOut = $false; $samples = @(); $nSamples = 0
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((-not $p1.HasExited) -or (-not $p2.HasExited)) {
      if ((Get-Date) -gt $deadline) { $timedOut = $true; break }
      $m = Q "select count(*) filter (where backend_xid is not null)||'|'||count(*) filter (where wait_event_type='Lock')||'|'||count(*)||'|'||coalesce(string_agg(application_name||':'||state||':'||coalesce(wait_event_type,'-')||':'||coalesce(wait_event,'-'), '  ' order by application_name),'') from pg_stat_activity where application_name in ('$app1','$app2')"
      $mp = $m -split '\|', 4
      $conc = 0; $lw = 0; $both = 0; $sample = ''
      if ($mp.Count -ge 3) { $conc = [int]$mp[0]; $lw = [int]$mp[1]; $both = [int]$mp[2] }
      if ($mp.Count -ge 4) { $sample = $mp[3] }
      $nSamples++
      if ($sample -ne '') { $samples += "$(Get-Date -Format HH:mm:ss.fff) conc=$conc lock=$lw both=$both $sample" }
      if ($conc -gt $maxConc) { $maxConc = $conc }
      if ($both -gt $maxBoth) { $maxBoth = $both }
      if ($lw -gt 0) { $lockSeen = $true }
      Start-Sleep -Milliseconds 50
    }
    # finalize both processes: capture exit code and write stdout/stderr to separate files
    foreach ($p in @($p1, $p2)) {
      if (-not $p.HasExited) { try { $p.Kill() } catch {} }
      try { $p.WaitForExit() } catch {}
      $outText = ''; $errText = ''
      try { $outText = $p.StandardOutput.ReadToEnd() } catch {}
      try { $errText = $p.StandardError.ReadToEnd() } catch {}
      [System.IO.File]::WriteAllText($p.OutFile, $outText, (New-Object System.Text.UTF8Encoding($false)))
      [System.IO.File]::WriteAllText($p.ErrFile, $errText, (New-Object System.Text.UTF8Encoding($false)))
    }
    $samples | Out-File -Encoding utf8 (Join-Path $LogDir "90_conc_${note}_activity.log")

    $ea = $p1.ExitCode
    $eb = $p2.ExitCode
    $exitOk = ($ea -eq 0) -and ($eb -eq 0)
    if (-not $exitOk) { Fail "$note worker exit codes non-zero (first=$ea second=$eb)" }
    if ($timedOut)    { Fail "$note timed out after ${TimeoutSec}s" }
    if ($nSamples -lt 1) { Fail "$note no pg_stat_activity samples were taken" }

    # prove overlap from trace intervals (deterministic evidence, independent of sampling)
    $trace = Q "select worker||'|'||extract(epoch from min(ts) filter (where phase='begin'))::text||'|'||extract(epoch from max(ts) filter (where phase='end'))::text||'|'||count(*)::text from validation.conc_trace where note='$note' group by worker order by worker"
    $trace | Out-File -Encoding utf8 (Join-Path $LogDir "90_conc_${note}_trace.log")
    $iv = @{}
    foreach ($line in ($trace -split "`n")) {
      if ($line.Trim() -eq '') { continue }
      $parts = $line.Trim() -split '\|'
      $iv[$parts[0]] = @{ b = [double]$parts[1]; e = [double]$parts[2]; n = [int]$parts[3] }
    }
    $overlap = $false
    if ($iv.ContainsKey('A') -and $iv.ContainsKey('B')) {
      $overlap = ($iv['A'].b -lt $iv['B'].e) -and ($iv['B'].b -lt $iv['A'].e)
    }
    $rowsOk = ($iv.ContainsKey('A') -and $iv['A'].n -ge 3 -and $iv.ContainsKey('B') -and $iv['B'].n -ge 3)
    if (-not $overlap)  { Fail "$note could not prove trace-interval overlap" }
    if (-not $rowsOk)   { Fail "$note incomplete trace rows (A=$($iv['A'].n) B=$($iv['B'].n))" }
    if ($maxBoth -lt 2) { Fail "$note concurrent backends never observed together (maxBoth=$maxBoth)" }
    if ($maxConc -lt 2) { Fail "$note max concurrent worker transactions (backend_xid) = $maxConc (expected >=2)" }

    # final state / visibility / flag vs targets
    $st = $s.expect
    $finalState = Q "select state from public.profile_publications where id='$($st.pub)'"
    $snapRow = Q "select visibility||'|'||publication_id from public.profile_public_snapshots where id='$SNAP1'"
    $snapPresent = ($snapRow -ne '')
    $finalVis = ''
    $snapPub = ''
    if ($snapPresent) { $sp = $snapRow -split '\|'; $finalVis = $sp[0]; $snapPub = $sp[1] }

    $stateOk = ($finalState -eq $st.state)
    if (-not $stateOk) { Fail "$note final state expected '$($st.state)' got '$finalState'" }

    $visOk = $true
    if ($st.snapPresent) {
      if (-not $snapPresent) { $visOk = $false; Fail "$note expected snapshot present but it is missing" }
      elseif ($finalVis -ne $st.vis) { $visOk = $false; Fail "$note final visibility expected '$($st.vis)' got '$finalVis'" }
      elseif ($snapPub -ne $st.snapPub) { $visOk = $false; Fail "$note snapshot publication_id expected '$($st.snapPub)' got '$snapPub'" }
    } else {
      if ($snapPresent) { $visOk = $false; Fail "$note expected snapshot absent but found ($snapRow)" }
    }

    $flagOk = $true
    foreach ($pub in $st.flags.Keys) {
      $f = Q "select case when is_publicly_visible then 't' else 'f' end from public.profile_publications where id='$pub'"
      if ($f -ne $st.flags[$pub]) { $flagOk = $false; Fail "$note flag for $pub expected $($st.flags[$pub]) got '$f'" }
    }

    # global invariant: flag == predicate for every publication
    $mism = Q "select count(*) from public.profile_publications pub where pub.is_publicly_visible is distinct from ((pub.state='published') and exists (select 1 from public.profile_public_snapshots s where s.publication_id=pub.id and s.visibility='public'))"
    $invOk = ($mism -eq '0')
    if (-not $invOk) { Fail "$note global flag/predicate invariant violated ($mism mismatch(es))" }

    $pred = Q "select case when (pub.state='published' and s.visibility='public') then 't' else 'f' end from public.profile_publications pub join public.profile_public_snapshots s on s.publication_id=pub.id where pub.id='$($st.pub)'"
    if ($pred -eq '') { $pred = 'n/a' }

    $result = if ($exitOk -and $overlap -and $rowsOk -and ($maxBoth -ge 2) -and ($maxConc -ge 2) -and $stateOk -and $visOk -and $flagOk -and $invOk -and (-not $timedOut)) { 'PASS' } else { 'FAIL' }
    $line = "$note order=$order exitA=$ea exitB=$eb overlap=$overlap maxBoth=$maxBoth maxConc=$maxConc lockWait=$lockSeen state=$finalState vis=$finalVis pred=$pred snapPub=$snapPub result=$result"
    $summary += $line
    Write-Output $line
  }
}

# --- restore the seed baseline and re-check the invariant --------------------------------------
[void](Exec (Reset-Alice 'published' 'public'))
$baseline = Q "select count(*) from public.profile_publications pub where pub.is_publicly_visible is distinct from ((pub.state='published') and exists (select 1 from public.profile_public_snapshots s where s.publication_id=pub.id and s.visibility='public'))"
if ($baseline -ne '0') { Fail "post-run baseline invariant violated ($baseline mismatch(es))" }

$summary | Out-File -Encoding utf8 (Join-Path $LogDir '90_concurrency_summary.log')

$bad = ($summary | Select-String 'result=FAIL').Count
Write-Output "=== concurrency: $($summary.Count) runs, $bad FAIL, $($script:failures.Count) failure(s) ==="
foreach ($f in $script:failures) { Write-Output "  - $f" }

if ($script:failures.Count -gt 0) { exit 1 }
Write-Output '=== concurrency: ALL RUNS PASSED ==='
exit 0
