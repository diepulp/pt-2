<#
.SYNOPSIS
  Invoke-PrintAgentRelease.ps1 — one governed command that turns source into the
  packaged D3LT print-agent release (PRD-093 steps 1+2).

.DESCRIPTION
  Collapses the two scriptable release halves into a single governed command, in the
  spirit of the playbook's "governed commands, not dozens of manual steps":

    1. Build-PrintAgent.ps1 — compile the native helper (msbuild), bundle the agent
       (esbuild), pin-verify + stage WinSW, assemble the StageDir (DEC-WIN-01/02).
    2. package-agent.ps1    — write the SHA-256 manifest, produce the ONE versioned
       ZIP, and (only when a thumbprint is supplied) Authenticode-sign it (DEC-WIN-04).

  Signing stays a DELIBERATE, separate decision: omit -SigningCertThumbprint to emit
  an UNSIGNED package on a build box; supply it on the certification host to sign in
  place (Gate W-B). This orchestrator never fabricates a signature and never relaxes
  the fail-closed WinSW pin.

  Output: $OutputDir\d3lt-print-agent-<version>.zip + manifest, ready for
  Provision-PrintAgent.ps1 -PackagePath.

.NOTES
  msbuild + the pinned WinSW + real signing are Windows/cert-host concerns. Command
  construction is asserted pwsh-free by
  __tests__/scripts/print-agent/build-command-construction.test.ts.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $StageDir,
  [Parameter(Mandatory = $true)][string] $OutputDir,
  [Parameter(Mandatory = $true)][string] $PackageVersion,
  [Parameter(Mandatory = $true)][int] $ProtocolVersion,
  [Parameter(Mandatory = $true)][string] $WinSwSourcePath,
  [Parameter(Mandatory = $false)][string] $WinSwExpectedSha256,
  # OMITTED → unsigned package (sign later on the cert host, Gate W-B).
  [Parameter(Mandatory = $false)][string] $SigningCertThumbprint,
  [Parameter(Mandatory = $false)][string] $Configuration = 'Release',
  [Parameter(Mandatory = $false)][string] $Platform = 'x64',
  [Parameter(Mandatory = $false)][string] $NodePath = 'node'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$buildScript = Join-Path $PSScriptRoot 'Build-PrintAgent.ps1'
$packageScript = Join-Path $PSScriptRoot 'package-agent.ps1'
if (-not (Test-Path -Path $buildScript)) { throw "build script not found: $buildScript" }
if (-not (Test-Path -Path $packageScript)) { throw "package script not found: $packageScript" }

# 1. Build + stage (fail-closed; throws on any half failing).
& $buildScript -StageDir $StageDir -WinSwSourcePath $WinSwSourcePath `
  -WinSwExpectedSha256 $WinSwExpectedSha256 -Configuration $Configuration `
  -Platform $Platform -NodePath $NodePath

# 2. Manifest + ZIP (+ sign only when a thumbprint is supplied).
$result = & $packageScript -StageDir $StageDir -OutputDir $OutputDir `
  -PackageVersion $PackageVersion -ProtocolVersion $ProtocolVersion `
  -SigningCertThumbprint $SigningCertThumbprint

return $result
