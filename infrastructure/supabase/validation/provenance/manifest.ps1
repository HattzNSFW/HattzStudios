# provenance/manifest.ps1 — utilitarios de proveniencia dos harnesses de validacao local.
#
# Este modulo NAO executa nada ao ser dot-sourced: apenas define funcoes.
# Nao le credenciais, nao connecta a banco e nao altera o estado dos harnesses.
#
# Contrato de integridade:
#   * o manifesto (run-manifest.json) NAO contem o seu proprio hash;
#   * o hash e gravado em arquivo IRMAO (run-manifest.sha256), calculado sobre os bytes
#     exatos do JSON escrito em UTF-8 sem BOM;
#   * Test-RunManifest valida o hash do manifesto e o tamanho/SHA-256 de cada artefato;
#   * integridade de bytes NAO e atestacao independente da execucao (ver limitations[]).

function Get-GitValue {
  param([string]$RepoRoot, [string[]]$GitArgs)
  try {
    $output = (& git -C $RepoRoot @GitArgs 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { return $null }
    return $output
  } catch {
    return $null
  }
}

function Get-GitExit {
  param([string]$RepoRoot, [string[]]$GitArgs)
  try {
    & git -C $RepoRoot @GitArgs 2>&1 | Out-Null
    return $LASTEXITCODE
  } catch {
    return -1
  }
}

function Resolve-Application {
  param([string]$Name)
  try {
    $commands = @(Get-Command -Name $Name -CommandType Application -ErrorAction SilentlyContinue)
    if ($commands.Count -gt 0) { return $commands[0].Source }
  } catch {
    return $null
  }
  return $null
}

function Get-ToolVersion {
  param([string]$Path, [string[]]$Arguments)
  if (-not $Path) { return $null }
  try {
    $output = (& $Path @Arguments 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { return $null }
    return $output
  } catch {
    return $null
  }
}

function Write-RunManifest {
  param(
    [Parameter(Mandatory = $true)][string]$LogDir,
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$HarnessName,
    [Parameter(Mandatory = $true)][string]$RunId,
    [Parameter(Mandatory = $true)][string]$StartedAt,
    [Parameter(Mandatory = $true)][string]$FinishedAt,
    [Parameter(Mandatory = $true)][int]$HarnessExitCode,
    [array]$Results = @(),
    [hashtable]$Invocation = @{},
    [string]$WorkDirectory = '',
    [string]$DatabaseName = '',
    [string]$DatabaseHost = '',
    [int]$DatabasePort = 0,
    [string]$DatabaseUser = '',
    [string]$PsqlPath = '',
    [string]$PostgresqlServerVersion = ''
  )

  $manifestPath = Join-Path $LogDir 'run-manifest.json'
  $hashPath = Join-Path $LogDir 'run-manifest.sha256'

  $commitSha = Get-GitValue -RepoRoot $RepoRoot -GitArgs @('rev-parse', 'HEAD')
  $porcelain = Get-GitValue -RepoRoot $RepoRoot -GitArgs @('status', '--porcelain', '--untracked-files=all')
  $worktreeExit = Get-GitExit -RepoRoot $RepoRoot -GitArgs @('diff', '--quiet')
  $indexExit = Get-GitExit -RepoRoot $RepoRoot -GitArgs @('diff', '--cached', '--quiet')
  if ($null -eq $porcelain) { $porcelain = '' }
  $treeClean = (($porcelain -eq '') -and ($worktreeExit -eq 0) -and ($indexExit -eq 0))

  $commands = @()
  foreach ($result in $Results) {
    $commands += [pscustomobject]@{
      step      = [string]$result.Step
      exit_code = [int]$result.ExitCode
      ok        = [bool]$result.Ok
      note      = [string]$result.Note
    }
  }

  $invocationLines = @()
  foreach ($key in ($Invocation.Keys | Sort-Object)) {
    $invocationLines += ("{0}={1}" -f $key, [string]$Invocation[$key])
  }

  # Apenas NOMES de variaveis consultadas; nenhum valor e registrado.
  $environment = [ordered]@{}
  foreach ($name in @('HATTZ_PSQL_PATH', 'PGPASSFILE', 'LOCALAPPDATA', 'TEMP')) {
    $state = 'unset'
    if ([System.Environment]::GetEnvironmentVariable($name)) { $state = 'set' }
    $environment[$name] = $state
  }

  try {
    $osDescription = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription
  } catch {
    $osDescription = [System.Environment]::OSVersion.VersionString
  }

  $toolVersions = [pscustomobject]@{
    node               = Get-ToolVersion -Path (Resolve-Application 'node') -Arguments @('--version')
    npm                = Get-ToolVersion -Path (Resolve-Application 'npm') -Arguments @('--version')
    psql_client        = Get-ToolVersion -Path $PsqlPath -Arguments @('--version')
    postgresql_server  = $(if ($PostgresqlServerVersion) { [string]$PostgresqlServerVersion } else { $null })
    powershell         = $PSVersionTable.PSVersion.ToString()
  }

  $artifacts = @()
  foreach ($file in (Get-ChildItem -LiteralPath $LogDir -File | Sort-Object Name)) {
    if ($file.Name -in @('run-manifest.json', 'run-manifest.sha256')) { continue }
    $relative = $file.FullName.Substring($LogDir.Length).TrimStart('\', '/').Replace('\', '/')
    $artifacts += [pscustomobject]@{
      path       = $relative
      size_bytes = [long]$file.Length
      sha256     = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }

  $failed = @($commands | Where-Object { -not $_.ok }).Count

  $manifest = [pscustomobject]@{
    schema_version = 1
    run_id         = [string]$RunId
    started_at     = [string]$StartedAt
    finished_at    = [string]$FinishedAt
    runner         = [pscustomobject]@{
      harness           = [string]$HarnessName
      invocation        = @($invocationLines)
      working_directory = [string]$WorkDirectory
      operating_system  = [string]$osDescription
      powershell_version = $PSVersionTable.PSVersion.ToString()
    }
    source         = [pscustomobject]@{
      repository_root = [string]$RepoRoot
      commit_sha      = $commitSha
      tree_state      = [pscustomobject]@{
        clean             = [bool]$treeClean
        porcelain         = [string]$porcelain
        diff_worktree_exit = [int]$worktreeExit
        diff_index_exit    = [int]$indexExit
      }
    }
    tool_versions  = $toolVersions
    database       = [pscustomobject]@{
      name              = [string]$DatabaseName
      host              = [string]$DatabaseHost
      port              = [int]$DatabasePort
      user              = [string]$DatabaseUser
      lifecycle         = 'new disposable database created by the harness'
      environment_names = $environment
    }
    commands       = @($commands)
    summary        = [pscustomobject]@{
      total_steps     = $commands.Count
      failed_steps    = $failed
      harness_exit_code = [int]$HarnessExitCode
    }
    artifacts      = @($artifacts)
    integrity      = [pscustomobject]@{
      algorithm           = 'SHA256'
      external_hash_file  = 'run-manifest.sha256'
      self_hash_included  = $false
    }
    limitations    = @(
      'Hash externo prova integridade de bytes, nao autenticidade da execucao.',
      'Nenhuma assinatura criptografica, timestamp confiavel ou testemunha externa foi produzida por este runner local.',
      'Versoes de ferramentas sao autorrelatadas pelo ambiente local.',
      'Abortos de configuracao/seguranca anteriores a criacao do LogDir nao geram manifesto.'
    )
  }

  $json = $manifest | ConvertTo-Json -Depth 12
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($manifestPath, $json, $utf8)
  $hash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  [System.IO.File]::WriteAllText($hashPath, ("{0}  run-manifest.json`n" -f $hash), $utf8)

  return [pscustomobject]@{
    ManifestPath = $manifestPath
    HashPath     = $hashPath
    Sha256       = $hash
    Artifacts    = $artifacts.Count
  }
}

function Test-RunManifest {
  param([Parameter(Mandatory = $true)][string]$LogDir)

  $failures = @()
  $manifestPath = Join-Path $LogDir 'run-manifest.json'
  $hashPath = Join-Path $LogDir 'run-manifest.sha256'
  $manifestSha = $null
  $artifactCount = 0

  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    $failures += 'run-manifest.json ausente.'
  }
  if (-not (Test-Path -LiteralPath $hashPath -PathType Leaf)) {
    $failures += 'run-manifest.sha256 ausente.'
  }
  if ($failures.Count -gt 0) {
    return [pscustomobject]@{ Ok = $false; Failures = $failures; ManifestSha256 = $null; ArtifactCount = 0 }
  }

  $hashLine = (Get-Content -LiteralPath $hashPath -TotalCount 1 -ErrorAction Stop).Trim()
  $match = [regex]::Match($hashLine, '^\s*([0-9a-fA-F]{64})\s+\*?run-manifest\.json\s*$')
  if (-not $match.Success) {
    $failures += "formato invalido em run-manifest.sha256: '$hashLine'"
  } else {
    $expected = $match.Groups[1].Value.ToLowerInvariant()
    $actual = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifestSha = $actual
    if ($expected -ne $actual) {
      $failures += "hash do manifesto divergente (esperado=$expected atual=$actual)"
    }
  }

  try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    $failures += "manifesto ilegivel: $($_.Exception.Message)"
    return [pscustomobject]@{ Ok = $false; Failures = $failures; ManifestSha256 = $manifestSha; ArtifactCount = 0 }
  }

  foreach ($artifact in @($manifest.artifacts)) {
    $artifactCount += 1
    $relative = [string]$artifact.path
    $path = Join-Path $LogDir $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      $failures += "artefato ausente: $relative"
      continue
    }
    $file = Get-Item -LiteralPath $path
    if ([long]$file.Length -ne [long]$artifact.size_bytes) {
      $failures += "tamanho divergente: $relative (esperado=$($artifact.size_bytes) atual=$($file.Length))"
    }
    $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    $expectedHash = ([string]$artifact.sha256).ToLowerInvariant()
    if ($expectedHash -ne $actualHash) {
      $failures += "SHA-256 divergente: $relative (esperado=$expectedHash atual=$actualHash)"
    }
  }

  return [pscustomobject]@{
    Ok            = ($failures.Count -eq 0)
    Failures      = $failures
    ManifestSha256 = $manifestSha
    ArtifactCount = $artifactCount
  }
}
