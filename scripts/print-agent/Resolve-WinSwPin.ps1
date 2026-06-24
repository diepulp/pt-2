<#
.SYNOPSIS
  Resolve-WinSwPin.ps1 — audited acquisition of the pinned WinSW x64 binary + its
  SHA-256 (PRD-093 DEC-WIN-02 / DEC-WIN-04 supply-chain acceptance).

.DESCRIPTION
  Build-PrintAgent.ps1 deliberately does NOT download WinSW — it only verifies an
  operator-supplied binary against a pinned SHA-256. This helper is the explicit,
  recorded acquisition step that produces that pin: it downloads ONE named WinSW
  release from the official GitHub release asset, computes its SHA-256 locally
  (trust-on-first-use, then pinned forever), and emits both the binary path and the
  pin line to feed into Build-PrintAgent.ps1 -WinSwExpectedSha256 and into
  SUPPLY-CHAIN-ACCEPTANCE.md.

  It pins by VERSION (never "latest"): the version is an explicit input so the
  acquired artifact is reproducible and auditable. The hash it prints is the value
  the named signing authority records as the accepted supply-chain pin — this script
  reports it, it does not assert trust on the operator's behalf.

.NOTES
  Separate-script boundary: the download lives HERE, not in Build-PrintAgent.ps1, so
  the build path stays download-free + fail-closed. Run on the certification host with
  the named signing authority; record the result in SUPPLY-CHAIN-ACCEPTANCE.md.
  Command construction is asserted pwsh-free by
  __tests__/scripts/print-agent/build-command-construction.test.ts.
#>

[CmdletBinding()]
param(
  # Pinned WinSW release version (e.g. 'v2.12.0'). REQUIRED + explicit — never "latest".
  [Parameter(Mandatory = $true)][string] $Version,
  # Directory to download the WinSW x64 exe into.
  [Parameter(Mandatory = $true)][string] $OutputDir,
  # Release asset name (x64 build). Override only if the upstream naming changes.
  [Parameter(Mandatory = $false)][string] $AssetName = 'WinSW-x64.exe'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-WinSwReleaseUri {
  <#
    Construct the official, version-pinned GitHub release asset URI. Returns the
    string (never fetches here) so it is unit-assertable and the pinned version is
    explicit in the constructed URL.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $ReleaseVersion,
    [Parameter(Mandatory = $true)][string] $Asset
  )
  return "https://github.com/winsw/winsw/releases/download/$ReleaseVersion/$Asset"
}

function Invoke-ResolveWinSwPin {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $ReleaseVersion,
    [Parameter(Mandatory = $true)][string] $OutDir,
    [Parameter(Mandatory = $true)][string] $Asset
  )

  if ($ReleaseVersion -match 'latest') {
    throw "WinSW version must be an explicit pinned tag (e.g. 'v2.12.0'), never 'latest' (DEC-WIN-02)."
  }
  if (-not (Test-Path -Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
  }

  $uri = New-WinSwReleaseUri -ReleaseVersion $ReleaseVersion -Asset $Asset
  $dest = Join-Path $OutDir $Asset
  Invoke-WebRequest -Uri $uri -OutFile $dest -UseBasicParsing

  $hash = (Get-FileHash -Path $dest -Algorithm SHA256).Hash.ToLower()

  Write-Host ''
  Write-Host "WinSW $ReleaseVersion acquired:" -ForegroundColor Green
  Write-Host "  path   : $dest"
  Write-Host "  sha256 : $hash"
  Write-Host ''
  Write-Host 'Feed this pin into the build (and record it in SUPPLY-CHAIN-ACCEPTANCE.md):'
  Write-Host "  .\Build-PrintAgent.ps1 -WinSwSourcePath '$dest' -WinSwExpectedSha256 '$hash' ..."
  Write-Host ''

  return [pscustomobject]@{
    Version     = $ReleaseVersion
    SourceUri   = $uri
    BinaryPath  = $dest
    Sha256      = $hash
  }
}

# Entry point.
Invoke-ResolveWinSwPin -ReleaseVersion $Version -OutDir $OutputDir -Asset $AssetName
