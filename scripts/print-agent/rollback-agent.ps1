<#
.SYNOPSIS
  rollback-agent.ps1 — disable / roll back the D3LT loyalty print agent
  (PRD-093 WS_W4, DEC-WIN-04 D7, INV-5).

.DESCRIPTION
  Two responsibilities, per the approved DEC-WIN-04 rollback model:

    1. Disable the agent path. With the service stopped/uninstalled, the controlled
       loyalty path yields `failed`/`unknown` and surfaces the operator's manual-retry
       affordance. There is **NO** automatic `window.print()` browser fallback
       (INV-5 / D7) — this script never invokes, enables, or re-points to a browser
       print path.

    2. Restore the pinned PREVIOUS package version (hash-verified). The rollback
       target is an explicit pinned `package_version`, never "latest": the previous
       package is re-verified by verify-integrity.ts (fail-closed) BEFORE it is
       reinstalled. A failed verification aborts the rollback rather than installing
       an unverified package.

  Reinstallation reuses the PrintAgentService.psm1 lifecycle module (DEC-WIN-02) so
  rollback and forward-install share one idempotent code path.

.NOTES
  PowerShell parser validation + deterministic command construction (and the absence
  of any browser-fallback token) are asserted by
  __tests__/scripts/print-agent/ps-command-construction.test.ts (pwsh-free CI path).
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $WinSwPath,
  [Parameter(Mandatory = $true)][string] $NodePath,
  # The pinned PREVIOUS package, already unpacked — NEVER "latest".
  [Parameter(Mandatory = $true)][string] $PreviousPackageDir,
  [Parameter(Mandatory = $true)][string] $PreviousPackageVersion,
  [Parameter(Mandatory = $true)][string] $AgentEntryScript,
  [Parameter(Mandatory = $true)][string] $LogDir,
  # Switch: only disable the agent path (stop + uninstall) without restoring a
  # previous version (e.g. emergency kill of the controlled path).
  [Parameter(Mandatory = $false)][switch] $DisableOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'PrintAgentService.psm1') -Force

function Disable-PrintAgentPath {
  <#
    Stop + uninstall the service. The controlled loyalty path then yields
    `failed`/`unknown` (manual-retry affordance). NO browser fallback is enabled —
    this function deliberately contains no window.print / browser print path.
  #>
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string] $WinSw)
  Stop-PrintAgentService -WinSwPath $WinSw
  Uninstall-PrintAgentService -WinSwPath $WinSw
}

function Restore-PinnedPackageVersion {
  <#
    Fail-closed restore of a PINNED previous version. Verifies the previous
    package (signature + every manifest hash) via verify-integrity.js BEFORE
    reinstalling. Verification failure aborts — never install an unverified package.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $WinSw,
    [Parameter(Mandatory = $true)][string] $Node,
    [Parameter(Mandatory = $true)][string] $PackageDir,
    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][string] $EntryScript,
    [Parameter(Mandatory = $true)][string] $Logs
  )

  $verifier = Join-Path $PSScriptRoot 'verify-integrity.js'
  & $Node $verifier $PackageDir
  if ($LASTEXITCODE -ne 0) {
    throw "rollback aborted: pinned package v$Version failed integrity verification (exit $LASTEXITCODE)"
  }

  Install-PrintAgentService -WinSwPath $WinSw -NodePath $Node `
    -AgentEntryScript $EntryScript -LogDir $Logs
  Start-PrintAgentService -WinSwPath $WinSw

  return [pscustomobject]@{
    RolledBackTo = $Version
    PackageDir   = $PackageDir
  }
}

function Invoke-RollbackAgent {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $WinSw,
    [Parameter(Mandatory = $true)][string] $Node,
    [Parameter(Mandatory = $true)][string] $PackageDir,
    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][string] $EntryScript,
    [Parameter(Mandatory = $true)][string] $Logs,
    [Parameter(Mandatory = $false)][bool] $DisableOnlyFlag = $false
  )

  # Step 1 ALWAYS: disable the current agent path (no browser fallback, INV-5).
  Disable-PrintAgentPath -WinSw $WinSw

  if ($DisableOnlyFlag) {
    return [pscustomobject]@{ Disabled = $true; RolledBackTo = $null }
  }

  # Step 2: restore the pinned previous version, hash-verified (fail-closed).
  $restored = Restore-PinnedPackageVersion -WinSw $WinSw -Node $Node `
    -PackageDir $PackageDir -Version $Version -EntryScript $EntryScript -Logs $Logs
  return [pscustomobject]@{ Disabled = $true; RolledBackTo = $restored.RolledBackTo }
}

# Entry point.
Invoke-RollbackAgent -WinSw $WinSwPath -Node $NodePath -PackageDir $PreviousPackageDir `
  -Version $PreviousPackageVersion -EntryScript $AgentEntryScript -Logs $LogDir `
  -DisableOnlyFlag:$DisableOnly
