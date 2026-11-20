# verify_manifest.ps1 — verificacao posterior de proveniencia de uma execucao dos harnesses.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File infrastructure/supabase/validation/provenance/verify_manifest.ps1 `
#     -LogDir "$env:LOCALAPPDATA\Hattz-2.0-postgres\logs\validation_disposable_20261119"
#
# Verifica: (1) hash externo do manifesto; (2) tamanho e SHA-256 de todos os artefatos listados.
# Exit code 0 = evidencia integra; 1 = divergencia; 2 = parametro invalido.
[CmdletBinding()]
param([string]$LogDir = '')

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($LogDir)) {
  Write-Output 'FATAL: -LogDir e obrigatorio.'
  exit 2
}
if (-not (Test-Path -LiteralPath $LogDir -PathType Container)) {
  Write-Output "FATAL: diretorio de logs nao existe: $LogDir"
  exit 2
}

. (Join-Path $PSScriptRoot 'manifest.ps1')

$result = Test-RunManifest -LogDir $LogDir
foreach ($failure in $result.Failures) { Write-Output "FAIL: $failure" }

if (-not $result.Ok) {
  Write-Output "MANIFEST INVALID: $($result.Failures.Count) problema(s)."
  exit 1
}

Write-Output "MANIFEST OK: sha256=$($result.ManifestSha256) artifacts=$($result.ArtifactCount)"
Write-Output 'AVISO: integridade de bytes nao e atestacao independente da execucao (sem assinatura/testemunha externa).'
exit 0
