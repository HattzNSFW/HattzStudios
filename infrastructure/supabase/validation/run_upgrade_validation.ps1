# run_upgrade_validation.ps1 — validação REAL de upgrade 0001..0014 -> 0015..0017.
#
# Cria um SEGUNDO banco descartável (nunca reutiliza um banco recém-criado como prova de upgrade),
# aplica as migrations originais até 0014, registra o comportamento anterior, aplica 0015/0016/0017
# e compara validador, dados preexistentes e reexecução das migrations aditivas.
#
# Contrato de segurança: mesmo prefixo obrigatório do harness principal; banco existente aborta sem
# modificar nada; sem -Recreate, sem drop, sem conexão remota.
[CmdletBinding()]
param(
  [string]$Database            = 'hattz_validation_disposable_upgrade_20261119',
  [string]$PgHost              = '127.0.0.1',
  [int]   $Port                = 55432,
  [string]$User                = 'hattz_pg_admin',
  [string]$LogDir              = '',
  [string]$PsqlPath            = '',
  [string]$PgPassFile          = ''
)

$ErrorActionPreference = 'Stop'

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
  $LogDir = Join-Path $localBase 'Hattz-2.0-postgres\logs\corrective_upgrade_20261119'
}

$DatabasePrefix = 'hattz_validation_disposable_'
function Stop-Config([string]$message, [int]$code) {
  Write-Output "FATAL: $message"
  exit $code
}

if ([string]::IsNullOrWhiteSpace($Database)) { Stop-Config '-Database é obrigatório.' 64 }
if ($Database.Length -gt 63) { Stop-Config "-Database excede 63 caracteres: $($Database.Length)." 64 }
if ($Database -notmatch '^[a-z_][a-z0-9_]{0,62}$') { Stop-Config "-Database contém caracteres inválidos: $Database" 64 }
if (-not $Database.StartsWith($DatabasePrefix, [System.StringComparison]::Ordinal)) {
  Stop-Config "-Database deve começar com '$DatabasePrefix': $Database" 64
}
if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) { Stop-Config "psql não encontrado: $PsqlPath" 4 }
if (-not (Test-Path -LiteralPath $PgPassFile -PathType Leaf)) { Stop-Config "PGPASSFILE não encontrado: $PgPassFile" 4 }
$env:PGPASSFILE = $PgPassFile

$ValidationDir = $PSScriptRoot
$SqlDir = Join-Path $ValidationDir 'sql'
$MigrationsDir = Join-Path (Split-Path $ValidationDir -Parent) 'migrations'

function Qv([string]$dbName, [string]$sql) {
  $out = (& $PsqlPath -h $PgHost -p $Port -U $User -d $dbName -tAc $sql 2>$null | Out-String).Trim()
  return $out
}
$exists = Qv 'postgres' "select 1 from pg_database where datname = '$Database'"
if ($exists -eq '1') {
  Stop-Config "o banco '$Database' já existe; abortando sem modificações (use outro nome com o prefixo obrigatório)." 65
}

if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$script:results = @()
function Record([string]$step, [int]$code, [string]$note) {
  $ok = ($code -eq 0)
  $script:results += [pscustomobject]@{ Step = $step; ExitCode = $code; Ok = $ok; Note = $note }
  $tag = if ($ok) { 'OK  ' } else { 'FAIL' }
  # Write-Host vai ao console sem poluir o valor de retorno de Run-Step.
  Write-Host "[$tag] $step (exit=$code) $note"
}

function Run-PsqlFile([string]$dbName, [string]$file, [string]$baseName) {
  $argList = @('-h',$PgHost,'-p',$Port,'-U',$User,'-d',$dbName,'-v','ON_ERROR_STOP=1','-f',$file)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $PsqlPath
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
  return (Run-PsqlFile $dbName $tmp $baseName)
}

function Run-Step([string]$baseName, [string]$file) {
  $code = Run-PsqlFile $Database $file $baseName
  Record $baseName $code ''
  return $code
}

function Save-Results {
  $script:results | Export-Csv -NoTypeInformation (Join-Path $LogDir 'results.csv')
}

$migrations = Get-ChildItem $MigrationsDir -Filter '*.sql' |
  Where-Object { $_.Name -match '^\d{4}_.*\.sql$' } | Sort-Object Name

Write-Output "=== upgrade validation: db=$Database log=$LogDir ==="

$code = Run-Sql 'postgres' "create database ""$Database""" '00_createdb'
Record '00_createdb' $code ''
if ($code -ne 0) { Save-Results; exit 2 }

$runId = [guid]::NewGuid().ToString('N')
$createdAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$code = Run-Sql 'postgres' "comment on database ""$Database"" is 'HATTZ_VALIDATION_DISPOSABLE_UPGRADE|$runId|$createdAt'" '00_mark_owner'
if ($code -ne 0) { Record '00_mark_owner' $code ''; Save-Results; exit 2 }

$code = Run-Step '00_preflight' (Join-Path $SqlDir '00_preflight.sql')
if ($code -ne 0) { Save-Results; exit 2 }

foreach ($m in $migrations | Where-Object { [int]$_.BaseName.Substring(0,4) -le 14 }) {
  $code = Run-PsqlFile $Database $m.FullName "10_base_$($m.BaseName)"
  Record "10_base_$($m.BaseName)" $code ''
  if ($code -ne 0) { Write-Output 'FATAL: base migration failed'; Save-Results; exit 3 }
}

$code = Run-Step '31_upgrade_before' (Join-Path $SqlDir '31_upgrade_before.sql')
if ($code -ne 0) { Write-Output 'FATAL: capture before-upgrade failed'; Save-Results; exit 3 }

foreach ($m in $migrations | Where-Object { [int]$_.BaseName.Substring(0,4) -ge 15 }) {
  $code = Run-PsqlFile $Database $m.FullName "15_additive_$($m.BaseName)"
  Record "15_additive_$($m.BaseName)" $code ''
  if ($code -ne 0) { Write-Output 'FATAL: additive migration failed'; Save-Results; exit 3 }
}

$code = Run-Step '36_upgrade_after' (Join-Path $SqlDir '36_upgrade_after.sql')
if ($code -ne 0) { Write-Output 'FATAL: upgrade comparison failed'; Save-Results; exit 3 }

foreach ($m in $migrations | Where-Object { [int]$_.BaseName.Substring(0,4) -ge 15 }) {
  $code = Run-PsqlFile $Database $m.FullName "99_reapply_$($m.BaseName)"
  Record "99_reapply_$($m.BaseName)" $code ''
  if ($code -ne 0) { Write-Output 'FATAL: additive re-apply failed'; Save-Results; exit 3 }
}

$code = Run-Step '35_corrective_guards' (Join-Path $SqlDir '35_corrective_guards.sql')
if ($code -ne 0) { Write-Output 'FATAL: corrective guards failed'; Save-Results; exit 3 }

Save-Results
$failed = @($script:results | Where-Object { -not $_.Ok })
Write-Output "=== $($script:results.Count) steps, $($failed.Count) failed ==="
if ($failed.Count -gt 0) { exit 1 }
Write-Output '=== UPGRADE VALIDATION PASSED ==='
exit 0
