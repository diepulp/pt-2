<#
.SYNOPSIS
  package-agent.ps1 — build the signed, versioned release package for the D3LT
  loyalty print agent (PRD-093 WS_W4, DEC-WIN-04).

.DESCRIPTION
  Produces ONE signed, versioned ZIP `d3lt-print-agent-<version>.zip` per the
  approved DEC-WIN-04 model: a single signing system with a SHA-256 hash manifest.
  The ZIP contains the Node agent bundle, the native helper (DEC-WIN-01), the
  pinned WinSW wrapper + XML (DEC-WIN-02), the PowerShell scripts/modules, and a
  `manifest.json` listing every file with its SHA-256, `package_version`, and
  `protocol_version`.

  Signing is the cheap, deterministic part here; the REAL code-signing certificate
  and the act of signing happen MANUALLY on the certification host with the named
  signing authority (Gate W-B). This script constructs the deterministic signtool
  command but treats an absent thumbprint as "package unsigned — sign on cert host",
  it never fabricates a signature.

  Fail-closed downstream: `verify-integrity.ts` re-verifies signature + every
  manifest hash before install (NFR-7). There is NO self-update and NO side-loading
  (DEC-WIN-04) — distribution is a manual managed update via Provision-PrintAgent.ps1.

.NOTES
  PowerShell parser validation + deterministic command construction are asserted by
  __tests__/scripts/print-agent/ps-command-construction.test.ts (pwsh-free CI path).
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $StageDir,
  [Parameter(Mandatory = $true)][string] $OutputDir,
  [Parameter(Mandatory = $true)][string] $PackageVersion,
  [Parameter(Mandatory = $true)][int] $ProtocolVersion,
  # Code-signing certificate thumbprint. OMITTED on a build box: the package is
  # produced unsigned and MUST be signed on the certification host (Gate W-B).
  [Parameter(Mandatory = $false)][string] $SigningCertThumbprint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-PackageManifest {
  <#
    Walk $StageDir, compute SHA-256 for every file (excluding manifest.json
    itself), and return the manifest object. Paths are stored package-relative
    with forward slashes so verify-integrity.ts compares them deterministically.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $RootDir,
    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][int] $Protocol
  )

  $files = @()
  Get-ChildItem -Path $RootDir -Recurse -File |
    Where-Object { $_.Name -ne 'manifest.json' } |
    ForEach-Object {
      $relative = $_.FullName.Substring($RootDir.Length).TrimStart('\', '/').Replace('\', '/')
      $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower()
      $files += [pscustomobject]@{ path = $relative; sha256 = $hash }
    }

  return [pscustomobject]@{
    package_version  = $Version
    protocol_version = $Protocol
    files            = $files
  }
}

function New-SignToolCommand {
  <#
    Construct the deterministic Authenticode signing command. Returns the argv
    array (never executes here) so it is unit-assertable and so the real signing
    is performed explicitly on the cert host.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $Thumbprint,
    [Parameter(Mandatory = $true)][string] $PackagePath
  )
  return @(
    'signtool', 'sign',
    '/sha1', $Thumbprint,
    '/fd', 'SHA256',
    '/tr', 'http://timestamp.digicert.com',
    '/td', 'SHA256',
    $PackagePath
  )
}

function Invoke-PackageAgent {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $Stage,
    [Parameter(Mandatory = $true)][string] $Output,
    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][int] $Protocol,
    [Parameter(Mandatory = $false)][string] $Thumbprint
  )

  if (-not (Test-Path -Path $Stage)) {
    throw "stage dir not found: $Stage"
  }
  if (-not (Test-Path -Path $Output)) {
    New-Item -ItemType Directory -Path $Output -Force | Out-Null
  }

  # 1. Manifest (SHA-256 of every file) — the integrity trust anchor (DEC-WIN-04).
  $manifest = New-PackageManifest -RootDir $Stage -Version $Version -Protocol $Protocol
  $manifestPath = Join-Path $Stage 'manifest.json'
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

  # 2. One versioned ZIP.
  $packageName = "d3lt-print-agent-$Version.zip"
  $packagePath = Join-Path $Output $packageName
  if (Test-Path -Path $packagePath) {
    Remove-Item -Path $packagePath -Force
  }
  Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $packagePath

  # 3. Sign — only when a real thumbprint is supplied (cert host). Otherwise the
  #    package is emitted UNSIGNED and must be signed before acceptance (Gate W-B).
  if ($Thumbprint) {
    $signCmd = New-SignToolCommand -Thumbprint $Thumbprint -PackagePath $packagePath
    & $signCmd[0] $signCmd[1..($signCmd.Length - 1)]
    if ($LASTEXITCODE -ne 0) {
      throw "signtool sign failed (exit $LASTEXITCODE)"
    }
  }
  else {
    Write-Warning 'No signing thumbprint supplied: package is UNSIGNED. Sign on the certification host (Gate W-B) before acceptance.'
  }

  return [pscustomobject]@{
    PackagePath  = $packagePath
    ManifestPath = $manifestPath
    Version      = $Version
    Signed       = [bool]$Thumbprint
    FileCount    = $manifest.files.Count
  }
}

# Entry point.
Invoke-PackageAgent -Stage $StageDir -Output $OutputDir -Version $PackageVersion `
  -Protocol $ProtocolVersion -Thumbprint $SigningCertThumbprint
