# run_validation.ps1 — round-6 local PostgreSQL validation orchestrator.
#
# Applies migrations 0001..0014 in order (ON_ERROR_STOP=1) to a NEW disposable database, then runs
# the in-repo validation harness. Every step's exit code is recorded; the script stops and exits
# non-zero on the first unexpected result. It never touches the prior validation databases.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File infrastructure/supabase/validation/run_validation.ps1 -Recreate
#
# Exit code 0 = all migrations applied and every harness step passed.
[CmdletBinding()]
param(
  [string]$Database         = 'hattz_phase2b_validation_6',
  [string]$PgHost     = '127.0.0.1',
  [int]   $Port       = 55432,
  [string]$User       = 'hattz_pg_admin',
  [string]$LogDir     = 'C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\logs\phase2b_validation_6',
  [int]   $Runs       = 3,
  [string]$Delay      = '2.0',
  [switch]$Recreate
)

$ErrorActionPreference = 'Continue'
$env:PGPASSFILE = 'C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\run\pgpass.conf'
$psql = 'C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\pgsql\pgsql\bin\psql.exe'

$ValidationDir = $PSScriptRoot
$SqlDir   = Join-Path $ValidationDir 'sql'
$WorkersDir = Join-Path $ValidationDir 'workers'
$ConcScript = Join-Path $ValidationDir 'concurrency\90_concurrency.ps1'
$MigrationsDir = Join-Path (Split-Path $ValidationDir -Parent) 'migrations'

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$script:results = @()
function Record([string]$step, [int]$code, [string]$note) {
  $ok = ($code -eq 0)
  $script:results += [pscustomobject]@{ Step = $step; ExitCode = $code; Ok = $ok; Note = $note }
  $tag = if ($ok) { 'OK  ' } else { 'FAIL' }
  Write-Output "[$tag] $step (exit=$code) $note"
}

function Qv([string]$Database, [string]$sql) {
  return ((& $psql -h $PgHost -p $Port -U $User -d $Database -tAc $sql 2>$null | Out-String).Trim())
}
function Run-Sql([string]$Database, [string]$sql, [string]$baseName) {
  $tmp = Join-Path $LogDir "$baseName.sql"
  [System.IO.File]::WriteAllText($tmp, $sql, (New-Object System.Text.UTF8Encoding($false)))
  return (Run-PsqlFile $Database $tmp $baseName $null)
}
function Run-PsqlFile([string]$Database, [string]$file, [string]$baseName, [hashtable]$vars) {
  $argList = @('-h',$PgHost,'-p',$Port,'-U',$User,'-d',$Database,'-v','ON_ERROR_STOP=1')
  if ($vars) { foreach ($k in $vars.Keys) { $argList += @('-v', "$k=$($vars[$k])") } }
  $argList += @('-f', $file)

  # `Start-Process -RedirectStandard*` não propaga o exit code de forma confiável no Windows
  # PowerShell (o objeto retornado pode terminar antes do redirecionamento ser descarregado).
  # Use Process diretamente e leia stdout/stderr de forma assíncrona antes de WaitForExit para
  # evitar deadlock quando o buffer de saída enche.
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $psql
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.Arguments = ($argList | ForEach-Object {
    if ($_ -match '^[\w.\\/:=_-]+$') { [string]$_ } else { '"' + ([string]$_ -replace '"','\"') + '"' }
  }) -join ' '

  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  $stdoutTask = $p.StandardOutput.ReadToEndAsync()
  $stderrTask = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText((Join-Path $LogDir "$baseName.out.log"), $stdoutTask.GetAwaiter().GetResult(), $encoding)
  [System.IO.File]::WriteAllText((Join-Path $LogDir "$baseName.err.log"), $stderrTask.GetAwaiter().GetResult(), $encoding)
  return $p.ExitCode
}
function Run-Step([string]$baseName, [string]$file, [hashtable]$vars) {
  $code = Run-PsqlFile $Database $file $baseName $vars
  [void](Record $baseName $code '')
  return $code
}

Write-Output "=== round-6 validation: db=$Database log=$LogDir ==="

# --- database lifecycle ------------------------------------------------------------------------
$exists = Qv 'postgres' "select 1 from pg_database where datname = '$Database'"
if ($Recreate) {
  if ($exists) {
    $code = Run-Sql 'postgres' "drop database if exists ""$Database"" with (force)" '00_dropdb'
    if ($code -ne 0) { Record '00_dropdb' $code 'drop failed'; exit 2 }
  }
  $exists = ''
}
if (-not $exists) {
  $code = Run-Sql 'postgres' "create database ""$Database""" '00_createdb'
  Record '00_createdb' $code ''
  if ($code -ne 0) { Write-Output 'FATAL: could not create database'; exit 2 }
} else {
  Write-Output "[OK  ] 00_createdb (database already exists, left as-is)"
}

# --- environment preflight (hard assertions on required stand-in roles) ------------------------
$preflight = Join-Path $SqlDir '00_preflight.sql'
$code = Run-PsqlFile $Database $preflight '00_preflight' $null
Record '00_preflight' $code ''
if ($code -ne 0) { Write-Output 'FATAL: preflight failed; stopping.'; $script:results | Export-Csv -NoTypeInformation (Join-Path $LogDir 'results.csv'); exit 2 }

# --- migrations 0001..0014 in order ------------------------------------------------------------
$migrations = Get-ChildItem $MigrationsDir -Filter '*.sql' |
  Where-Object { $_.Name -match '^\d{4}_.*\.sql$' } | Sort-Object Name
foreach ($m in $migrations) {
  $base = "10_migration_$($m.BaseName)"
  $code = Run-PsqlFile $Database $m.FullName $base $null
  Record $base $code ''
  if ($code -ne 0) { Write-Output 'FATAL: migration failed; stopping.'; $script:results | Export-Csv -NoTypeInformation (Join-Path $LogDir 'results.csv'); exit 3 }
}

# --- 0012/0013/0014 idempotency: re-applying additive migrations must succeed as a no-op --------
foreach ($m in $migrations | Where-Object { $_.Name -like '0012_*' -or $_.Name -like '0013_*' -or $_.Name -like '0014_*' }) {
  $base = "99_reapply_$($m.BaseName)"
  $code = Run-PsqlFile $Database $m.FullName $base $null
  Record $base $code ''
  if ($code -ne 0) { Write-Output 'FATAL: idempotent re-apply failed.'; $script:results | Export-Csv -NoTypeInformation (Join-Path $LogDir 'results.csv'); exit 3 }
}

# --- 0011 verification + precheck/idempotency sequence -----------------------------------------
$code = Run-Step '20_verify_0011' (Join-Path $SqlDir '20_verify_0011.sql') $null
if ($code -ne 0) { Write-Output 'FATAL: 20_verify_0011 failed'; $script:results | Export-Csv -NoTypeInformation (Join-Path $LogDir 'results.csv'); exit 3 }

[void](Run-Step '23_0011_idempotency_before' (Join-Path $SqlDir '23_0011_idempotency.sql') $null)
[void](Run-Step '21_0011_precheck_setup'      (Join-Path $SqlDir '21_0011_precheck_setup.sql') $null)

# Re-apply 0011 on the deliberately inconsistent database: it MUST fail.
$m0011 = ($migrations | Where-Object { $_.Name -like '0011_*' }).FullName
$code = Run-PsqlFile $Database $m0011 '99_precheck_apply_0011_expect_fail' $null
$script:results += [pscustomobject]@{ Step = '99_precheck_apply_0011 (expect non-zero)'; ExitCode = $code; Ok = ($code -ne 0); Note = 'inconsistent DB must be rejected' }
Write-Output ("[{0}] 99_precheck_apply_0011 (expect non-zero) (exit={1})" -f $(if ($code -ne 0) { 'OK  ' } else { 'FAIL' }), $code)
if ($code -eq 0) { Write-Output 'FATAL: 0011 accepted an inconsistent database (expected a hard failure)'; $script:results | Export-Csv -NoTypeInformation (Join-Path $LogDir 'results.csv'); exit 3 }

[void](Run-Step '22_0011_precheck_after_failure' (Join-Path $SqlDir '22_0011_precheck_after_failure.sql') $null)

# Re-apply 0011 after cleanup: it MUST succeed (and be idempotent).
$code = Run-PsqlFile $Database $m0011 '99_precheck_apply_0011_after_cleanup' $null
Record '99_precheck_apply_0011 (after cleanup)' $code ''
if ($code -ne 0) { Write-Output 'FATAL: 0011 failed to apply after cleanup'; $script:results | Export-Csv -NoTypeInformation (Join-Path $LogDir 'results.csv'); exit 3 }

[void](Run-Step '23_0011_idempotency_after' (Join-Path $SqlDir '23_0011_idempotency.sql') $null)

# --- validator parity, structure, seed, transitions --------------------------------------------
[void](Run-Step '30_validator_parity'    (Join-Path $SqlDir '30_validator_parity.sql') $null)
[void](Run-Step '40_verify_0010_triggers' (Join-Path $SqlDir '40_verify_0010_triggers.sql') $null)
[void](Run-Step '50_seed'                (Join-Path $SqlDir '50_seed.sql') $null)
[void](Run-Step '60_matrix_transitions'  (Join-Path $SqlDir '60_matrix_transitions.sql') $null)

# --- access matrix as anon and authenticated ---------------------------------------------------
[void](Run-Step '70_access_matrix_anon'          (Join-Path $SqlDir '70_access_matrix.sql') @{ role = 'anon' })
[void](Run-Step '70_access_matrix_authenticated' (Join-Path $SqlDir '70_access_matrix.sql') @{ role = 'authenticated' })

# --- grants audit, slug integrity, trusted-writer privileges -----------------------------------
[void](Run-Step '71_grants_audit'                (Join-Path $SqlDir '71_grants_audit.sql') $null)
[void](Run-Step '72_slug_integrity'              (Join-Path $SqlDir '72_slug_integrity.sql') $null)
[void](Run-Step '80_trusted_writer_privileges'   (Join-Path $SqlDir '80_trusted_writer_privileges.sql') $null)
[void](Run-Step '82_trusted_writer_grants'       (Join-Path $SqlDir '82_trusted_writer_grants.sql') $null)

# --- concurrency -------------------------------------------------------------------------------
Write-Output '=== running concurrency driver ==='
& $ConcScript -Database $Database -PgHost $PgHost -Port $Port -User $User -LogDir $LogDir -Runs $Runs -Delay $Delay
$code = $LASTEXITCODE
Record '90_concurrency' $code ''

# --- final state -------------------------------------------------------------------------------
[void](Run-Step '95_final_state' (Join-Path $SqlDir '95_final_state.sql') $null)

# --- summary -----------------------------------------------------------------------------------
$script:results | Export-Csv -NoTypeInformation (Join-Path $LogDir 'results.csv')
$script:results | Format-Table -AutoSize | Out-String | Write-Output

$failed = @($script:results | Where-Object { -not $_.Ok })
Write-Output "=== $($script:results.Count) steps, $($failed.Count) failed ==="
foreach ($f in $failed) { Write-Output "  FAILED: $($f.Step) exit=$($f.ExitCode)" }

if ($failed.Count -gt 0) { exit 1 }
Write-Output '=== ALL VALIDATION STEPS PASSED ==='
exit 0
