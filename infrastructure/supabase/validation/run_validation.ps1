# run_validation.ps1 — local PostgreSQL validation orchestrator (hardened lifecycle).
#
# Applies migrations 0001..0017 in order (ON_ERROR_STOP=1) to a NEW disposable database, then runs
# the in-repo validation harness. Every step's exit code is recorded; the script stops and exits
# non-zero on the first unexpected result.
#
# SAFETY CONTRACT:
#   * The ONLY accepted database names are simple PostgreSQL identifiers with the mandatory prefix
#     `hattz_validation_disposable_` and at most 63 characters. No legacy/development DB can be
#     targeted, even by explicitly passing -Database.
#   * If the database already exists and -Recreate was not supplied, the script aborts BEFORE
#     creating a log directory or sending any DDL/DML. Nothing is modified.
#   * -Recreate additionally requires -ConfirmDropDatabase with the EXACT database name AND a
#     matching ownership marker created by this script. A pre-existing DB without that marker is
#     never dropped.
#   * No password or connection string is logged. Psql receives credentials through PGPASSFILE.
#
# Exit codes: 0 all steps passed; 2 invalid configuration/unsafe lifecycle; 3 validation failure;
# 4 psql unavailable; 64 invalid database name; 65 existing database without -Recreate;
# 66 unsafe/incomplete -Recreate confirmation.
[CmdletBinding()]
param(
  [string]$Database            = 'hattz_validation_disposable_20261119',
  [string]$PgHost              = '127.0.0.1',
  [int]   $Port                = 55432,
  [string]$User                = 'hattz_pg_admin',
  [string]$LogDir              = '',
  [int]   $Runs                = 3,
  [string]$Delay               = '2.0',
  [string]$PsqlPath            = '',
  [string]$PgPassFile          = '',
  [switch]$Recreate,
  [string]$ConfirmDropDatabase = ''
)

$ErrorActionPreference = 'Stop'

# --- proveniencia (somente leitura; nao altera o comportamento do harness) ----------------------
. (Join-Path $PSScriptRoot 'provenance\manifest.ps1')
$RepoRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$startedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$boundInvocation = @{}
foreach ($key in $PSBoundParameters.Keys) {
  $boundInvocation[[string]$key] = [string]$PSBoundParameters[$key]
}
$serverVersion = ''

# --- resolved configuration (parameters > environment > repository defaults) --------------------
if (-not $PsqlPath) {
  if ($env:HATTZ_PSQL_PATH) { $PsqlPath = $env:HATTZ_PSQL_PATH }
  else { $PsqlPath = 'C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\pgsql\pgsql\bin\psql.exe' }
}
if (-not $PgPassFile) {
  if ($env:PGPASSFILE) { $PgPassFile = $env:PGPASSFILE }
  else { $PgPassFile = 'C:\Users\Noir\AppData\Local\Hattz-2.0-postgres\run\pgpass.conf' }
}
if (-not $LogDir) {
  $localBase = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { $env:TEMP }
  $LogDir = Join-Path $localBase 'Hattz-2.0-postgres\logs\validation_disposable_20261119'
}

# --- database name validation: BEFORE any interpolation or SQL command --------------------------
$DatabasePrefix = 'hattz_validation_disposable_'
function Stop-Config([string]$message, [int]$code) {
  Write-Output "FATAL: $message"
  exit $code
}

if ([string]::IsNullOrWhiteSpace($Database)) {
  Stop-Config '-Database é obrigatório.' 64
}
if ($Database.Length -gt 63) {
  Stop-Config "-Database excede 63 caracteres (PostgreSQL): $($Database.Length)." 64
}
# Simple (unquoted) PostgreSQL identifier: lowercase letter/underscore, then lowercase/digits/underscore.
# Deliberately excludes quotes, spaces, semicolons, dots, dashes and uppercase: no SQL interpolation risk.
if ($Database -notmatch '^[a-z_][a-z0-9_]{0,62}$') {
  Stop-Config "-Database contém caracteres inválidos: $Database" 64
}
if (-not $Database.StartsWith($DatabasePrefix, [System.StringComparison]::Ordinal)) {
  Stop-Config "-Database deve começar com '$DatabasePrefix': $Database" 64
}
if ($ConfirmDropDatabase -and $ConfirmDropDatabase -cne $Database) {
  Stop-Config "-ConfirmDropDatabase deve ser exatamente igual a -Database." 66
}
if ($ConfirmDropDatabase -and -not $Recreate) {
  Stop-Config '-ConfirmDropDatabase somente é válido junto com -Recreate.' 66
}

$psql = $PsqlPath
if (-not (Test-Path -LiteralPath $psql -PathType Leaf)) {
  Stop-Config "psql não encontrado: $psql (use -PsqlPath ou HATTZ_PSQL_PATH)." 4
}
if (-not (Test-Path -LiteralPath $PgPassFile -PathType Leaf)) {
  Stop-Config "arquivo PGPASSFILE não encontrado (use -PgPassFile ou PGPASSFILE)." 4
}
# Psql and the concurrency child read credentials only from this file. Contents are never logged.
$env:PGPASSFILE = $PgPassFile

$ValidationDir = $PSScriptRoot
$SqlDir        = Join-Path $ValidationDir 'sql'
$ConcScript    = Join-Path $ValidationDir 'concurrency\90_concurrency.ps1'
$MigrationsDir = Join-Path (Split-Path $ValidationDir -Parent) 'migrations'

# --- read-only existence probe: no log directory, no temp SQL, no DDL ---------------------------
# $Database was validated above, therefore this literal cannot contain SQL metacharacters.
function Qv([string]$dbName, [string]$sql) {
  $out = (& $psql -h $PgHost -p $Port -U $User -d $dbName -tAc $sql 2>$null | Out-String).Trim()
  return $out
}
$exists = Qv 'postgres' "select 1 from pg_database where datname = '$Database'"
$markerPath = Join-Path $LogDir 'database-ownership.json'
$marker = $null

if ($exists -eq '1') {
  if (-not $Recreate) {
    Stop-Config "o banco '$Database' já existe; abortando sem modificações (use outro nome ou -Recreate com confirmação)." 65
  }
  if ($ConfirmDropDatabase -cne $Database) {
    Stop-Config "-Recreate exige -ConfirmDropDatabase com o nome exato do banco." 66
  }
  # Prefix alone is not proof of ownership. Require the marker written by a previous validated run.
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    Stop-Config "banco existente sem marcador de propriedade neste LogDir; recusa-se a apagá-lo." 66
  }
  try {
    $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    Stop-Config 'marcador de propriedade ilegível; recusa-se a apagar o banco.' 66
  }
  if ($marker.database -cne $Database -or -not $marker.runId -or -not $marker.prefix -or $marker.prefix -cne $DatabasePrefix) {
    Stop-Config 'marcador de propriedade inconsistente; recusa-se a apagar o banco.' 66
  }
  $comment = Qv 'postgres' "select coalesce(obj_description(oid, 'pg_database'), '') from pg_database where datname = '$Database'"
  if ($comment -notlike "HATTZ_VALIDATION_DISPOSABLE|$($marker.runId)|*") {
    Stop-Config 'comentário de propriedade do banco não confere com o marcador; recusa-se a apagar.' 66
  }
}

# --- from here on the database is known to be absent or safely recreatable ----------------------
if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$script:results = @()
function Record([string]$step, [int]$code, [string]$note) {
  $ok = ($code -eq 0)
  $script:results += [pscustomobject]@{ Step = $step; ExitCode = $code; Ok = $ok; Note = $note }
  $tag = if ($ok) { 'OK  ' } else { 'FAIL' }
  Write-Output "[$tag] $step (exit=$code) $note"
}

function Run-PsqlFile([string]$dbName, [string]$file, [string]$baseName, [hashtable]$vars) {
  $argList = @('-h',$PgHost,'-p',$Port,'-U',$User,'-d',$dbName,'-v','ON_ERROR_STOP=1')
  if ($vars) { foreach ($k in $vars.Keys) { $argList += @('-v', "$k=$($vars[$k])") } }
  $argList += @('-f', $file)

  # `Start-Process -RedirectStandard*` não propaga o exit code de forma confiável no Windows
  # PowerShell. Use Process diretamente e leia stdout/stderr antes de WaitForExit para evitar
  # deadlock quando o buffer de saída enche.
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
function Run-Sql([string]$dbName, [string]$sql, [string]$baseName) {
  $tmp = Join-Path $LogDir "$baseName.sql"
  [System.IO.File]::WriteAllText($tmp, $sql, (New-Object System.Text.UTF8Encoding($false)))
  return (Run-PsqlFile $dbName $tmp $baseName $null)
}
function Run-Step([string]$baseName, [string]$file, [hashtable]$vars) {
  $code = Run-PsqlFile $Database $file $baseName $vars
  [void](Record $baseName $code '')
  return $code
}
function Save-Results { $script:results | Export-Csv -NoTypeInformation (Join-Path $LogDir 'results.csv') }

# Grava o manifesto e sai com o codigo original do harness. Uma falha ao gravar evidencia
# e reportada, mas NAO troca o codigo de seguranca/validacao decidido pelo fluxo existente.
function Finish-Run([int]$exitCode) {
  $finishedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  try {
    $manifest = Write-RunManifest `
      -LogDir $LogDir -RepoRoot $RepoRoot -HarnessName 'run_validation.ps1' `
      -RunId $runId -StartedAt $startedAt -FinishedAt $finishedAt `
      -HarnessExitCode $exitCode -Results $script:results -Invocation $boundInvocation `
      -WorkDirectory (Get-Location).Path -DatabaseName $Database -DatabaseHost $PgHost `
      -DatabasePort $Port -DatabaseUser $User -PsqlPath $psql -PostgresqlServerVersion $serverVersion
    Write-Output "[manifest] $($manifest.ManifestPath) (sha256=$($manifest.Sha256), artifacts=$($manifest.Artifacts))"
  } catch {
    Write-Output "FATAL: falha ao gravar manifesto de proveniencia: $($_.Exception.Message)"
  }
  exit $exitCode
}

$runId = [guid]::NewGuid().ToString('N')
Write-Output "=== validation: db=$Database log=$LogDir recreate=$($Recreate.IsPresent) ==="

# --- database lifecycle ------------------------------------------------------------------------
if ($exists -eq '1') {
  # Ownership was proven above. Drop is the ONLY destructive operation and is fully confirmed.
  $code = Run-Sql 'postgres' "drop database if exists ""$Database"" with (force)" '00_dropdb'
  if ($code -ne 0) { Record '00_dropdb' $code 'drop failed'; Save-Results; Finish-Run 2 }
}
$code = Run-Sql 'postgres' "create database ""$Database""" '00_createdb'
Record '00_createdb' $code ''
if ($code -ne 0) { Write-Output 'FATAL: could not create database'; Save-Results; Finish-Run 2 }

$createdAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$code = Run-Sql 'postgres' "comment on database ""$Database"" is 'HATTZ_VALIDATION_DISPOSABLE|$runId|$createdAt'" '00_mark_owner'
if ($code -ne 0) { Record '00_mark_owner' $code 'failed'; Save-Results; Finish-Run 2 }
$markerObject = [pscustomobject]@{
  database  = $Database
  runId     = $runId
  prefix    = $DatabasePrefix
  createdAt = $createdAt
  owner     = $User
  host      = $PgHost
  port      = $Port
}
$markerObject | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding UTF8

# --- environment preflight (hard assertions on required stand-in roles) ------------------------
$preflight = Join-Path $SqlDir '00_preflight.sql'
$code = Run-PsqlFile $Database $preflight '00_preflight' $null
Record '00_preflight' $code ''
if ($code -ne 0) { Write-Output 'FATAL: preflight failed; stopping.'; Save-Results; Finish-Run 2 }
# Leitura unica e somente-leitura da versao do servidor, pela mesma via Qv ja usada no harness.
try { $serverVersion = (Qv $Database 'select version()') } catch { $serverVersion = '' }

# --- migrations 0001..0017 in order ------------------------------------------------------------
$migrations = Get-ChildItem $MigrationsDir -Filter '*.sql' |
  Where-Object { $_.Name -match '^\d{4}_.*\.sql$' } | Sort-Object Name
foreach ($m in $migrations) {
  $base = "10_migration_$($m.BaseName)"
  $code = Run-PsqlFile $Database $m.FullName $base $null
  Record $base $code ''
  if ($code -ne 0) { Write-Output 'FATAL: migration failed; stopping.'; Save-Results; Finish-Run 3 }
}

# --- 0012..0017 idempotency: re-applying additive migrations must succeed as a no-op ------------
foreach ($m in $migrations | Where-Object { $_.Name -match '^001[2-7]_' }) {
  $base = "99_reapply_$($m.BaseName)"
  $code = Run-PsqlFile $Database $m.FullName $base $null
  Record $base $code ''
  if ($code -ne 0) { Write-Output 'FATAL: idempotent re-apply failed.'; Save-Results; Finish-Run 3 }
}

# --- 0011 verification + precheck/idempotency sequence -----------------------------------------
$code = Run-Step '20_verify_0011' (Join-Path $SqlDir '20_verify_0011.sql') $null
if ($code -ne 0) { Write-Output 'FATAL: 20_verify_0011 failed'; Save-Results; Finish-Run 3 }

[void](Run-Step '23_0011_idempotency_before' (Join-Path $SqlDir '23_0011_idempotency.sql') $null)
[void](Run-Step '21_0011_precheck_setup'      (Join-Path $SqlDir '21_0011_precheck_setup.sql') $null)

$m0011 = ($migrations | Where-Object { $_.Name -like '0011_*' }).FullName
$code = Run-PsqlFile $Database $m0011 '99_precheck_apply_0011_expect_fail' $null
$script:results += [pscustomobject]@{ Step = '99_precheck_apply_0011 (expect non-zero)'; ExitCode = $code; Ok = ($code -ne 0); Note = 'inconsistent DB must be rejected' }
Write-Output ("[{0}] 99_precheck_apply_0011 (expect non-zero) (exit={1})" -f $(if ($code -ne 0) { 'OK  ' } else { 'FAIL' }), $code)
if ($code -eq 0) { Write-Output 'FATAL: 0011 accepted an inconsistent database (expected a hard failure)'; Save-Results; Finish-Run 3 }

[void](Run-Step '22_0011_precheck_after_failure' (Join-Path $SqlDir '22_0011_precheck_after_failure.sql') $null)

$code = Run-PsqlFile $Database $m0011 '99_precheck_apply_0011_after_cleanup' $null
Record '99_precheck_apply_0011 (after cleanup)' $code ''
if ($code -ne 0) { Write-Output 'FATAL: 0011 failed to apply after cleanup'; Save-Results; Finish-Run 3 }

[void](Run-Step '23_0011_idempotency_after' (Join-Path $SqlDir '23_0011_idempotency.sql') $null)

# --- validator parity, structure, seed, transitions --------------------------------------------
[void](Run-Step '30_validator_parity'     (Join-Path $SqlDir '30_validator_parity.sql') $null)
[void](Run-Step '40_verify_0010_triggers' (Join-Path $SqlDir '40_verify_0010_triggers.sql') $null)
[void](Run-Step '50_seed'                 (Join-Path $SqlDir '50_seed.sql') $null)
[void](Run-Step '55_corrective_guards'    (Join-Path $SqlDir '35_corrective_guards.sql') $null)
[void](Run-Step '60_matrix_transitions'   (Join-Path $SqlDir '60_matrix_transitions.sql') $null)

# --- access matrix as anon and authenticated ---------------------------------------------------
[void](Run-Step '70_access_matrix_anon'          (Join-Path $SqlDir '70_access_matrix.sql') @{ role = 'anon' })
[void](Run-Step '70_access_matrix_authenticated' (Join-Path $SqlDir '70_access_matrix.sql') @{ role = 'authenticated' })

# --- grants audit, slug integrity, trusted-writer privileges -----------------------------------
[void](Run-Step '71_grants_audit'              (Join-Path $SqlDir '71_grants_audit.sql') $null)
[void](Run-Step '72_slug_integrity'            (Join-Path $SqlDir '72_slug_integrity.sql') $null)
[void](Run-Step '80_trusted_writer_privileges' (Join-Path $SqlDir '80_trusted_writer_privileges.sql') $null)
[void](Run-Step '82_trusted_writer_grants'     (Join-Path $SqlDir '82_trusted_writer_grants.sql') $null)

# --- concurrency -------------------------------------------------------------------------------
Write-Output '=== running concurrency driver ==='
& $ConcScript -Database $Database -PgHost $PgHost -Port $Port -User $User -LogDir $LogDir -Runs $Runs -Delay $Delay -PsqlPath $psql -PgPassFile $PgPassFile
$code = $LASTEXITCODE
Record '90_concurrency' $code ''

# --- final state -------------------------------------------------------------------------------
[void](Run-Step '95_final_state' (Join-Path $SqlDir '95_final_state.sql') $null)

# --- summary -----------------------------------------------------------------------------------
Save-Results
$script:results | Format-Table -AutoSize | Out-String | Write-Output

$failed = @($script:results | Where-Object { -not $_.Ok })
Write-Output "=== $($script:results.Count) steps, $($failed.Count) failed ==="
foreach ($f in $failed) { Write-Output "  FAILED: $($f.Step) exit=$($f.ExitCode)" }

if ($failed.Count -gt 0) { Finish-Run 1 }
Write-Output '=== ALL VALIDATION STEPS PASSED ==='
Finish-Run 0
