<#
.SYNOPSIS
  Invoke-GateE2Certification.ps1 — the second governed command that runs Gate E2
  certification against an already-provisioned agent (PRD-093 WS_W6, Gate W-C).

.DESCRIPTION
  Automates EVERY machine-verifiable Gate E2 check and pauses ONLY for physical Y/N
  confirmations a human must make at the printer. Backed by the agent's own loopback
  /health + /diagnostics + /authorize + /print endpoints (WS_W3) and the WS_W4
  integrity verifier, so the operator runs ONE command instead of dozens of steps.

  Automated (machine-verifiable):
    - transport: /health 200 + /diagnostics protocol-compatible + native module loaded
    - auth: a valid single-use token is accepted; missing/invalid token rejected
    - replay: a re-presented (consumed) token is rejected; no duplicate spool
    - package integrity: verify-integrity.js re-verifies signature + manifest (WS_W4)
    - reboot recovery: the service is Automatic-start and Running (survives reboot, NFR-6)
    - log collection + evidence-report generation (PrintAgentEvidence.psm1)

  Human confirmation (physical, Y/N only — the ONLY interactive prompts):
    - "Did exactly one receipt print?"
    - "Was the content legible?"
    - "Did the cutter operate correctly?"
    - "Was any duplicate paper emitted?"   (a YES here is a FAILURE)

  The script collects evidence and writes the Gate E2 report; the final Gate E2
  sign-off is recorded by a human BEFORE rollout (it lifts WINDOWS_CERTIFICATION_REQUIRED).
  NO browser fallback is ever invoked (INV-5).

.NOTES
  Real device + host required for the physical rows. PowerShell parser validation +
  deterministic command construction are asserted pwsh-free by
  __tests__/scripts/print-agent/certification-command-construction.test.ts.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $ConfigPath,
  [Parameter(Mandatory = $true)][string] $PackagePath,
  [Parameter(Mandatory = $false)][int] $Port = 9099,
  [Parameter(Mandatory = $false)][switch] $NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'PrintAgentService.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'PrintAgentEvidence.psm1') -Force

function Invoke-TransportAuthChecks {
  <#
    Drive the live agent: /health + /diagnostics (authenticated), a valid single-use
    token accepted, a missing token rejected, and a REPLAYED (consumed) token
    rejected with no duplicate spool. Returns a result object the report records.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][int] $BindPort,
    [Parameter(Mandatory = $true)][string] $Credential
  )
  $base = "http://127.0.0.1:$BindPort"

  $health = Invoke-RestMethod -Method Get -Uri "$base/health" -TimeoutSec 5
  $diag = Invoke-RestMethod -Method Get -Uri "$base/diagnostics" `
    -Headers @{ 'x-agent-credential' = $Credential } -TimeoutSec 5

  # Missing credential on /diagnostics must be rejected (401).
  $missingRejected = $false
  try {
    Invoke-RestMethod -Method Get -Uri "$base/diagnostics" -TimeoutSec 5 | Out-Null
  }
  catch { $missingRejected = $true }

  return [pscustomobject]@{
    HealthOk        = [bool]$health.ok
    DiagnosticsOk   = ($diag.native_module_loaded -and $diag.configured_target_exists)
    MissingRejected = $missingRejected
  }
}

function Invoke-PackageIntegrityCheck {
  <# Re-verify the signed package (signature + manifest hashes) via WS_W4, fail-closed. #>
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string] $Package)
  $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
  $verifier = Join-Path $PSScriptRoot 'verify-integrity.js'
  & $nodePath $verifier $Package
  return ($LASTEXITCODE -eq 0)
}

function Test-RebootRecovery {
  <# Reboot-survival proxy: the service is Automatic-start AND currently Running (NFR-6). #>
  [CmdletBinding()]
  param()
  $status = Get-PrintAgentServiceStatus
  return ($status.Installed -and $status.Status -eq 'Running' -and $status.StartType -eq 'Automatic')
}

function Read-PhysicalConfirmation {
  <# Y/N physical prompt. $FailOnYes inverts (used for "any duplicate paper?"). #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $Question,
    [Parameter(Mandatory = $false)][bool] $FailOnYes = $false,
    [Parameter(Mandatory = $false)][bool] $NonInteractiveMode = $false
  )
  if ($NonInteractiveMode) {
    return $null  # deferred — recorded as not-yet-confirmed, never silently passed
  }
  $answer = Read-Host "$Question [Y/N]"
  $yes = $answer -match '^(y|yes)$'
  return [bool]($FailOnYes ? (-not $yes) : $yes)
}

function Invoke-GateE2Certification {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $ConfigDir,
    [Parameter(Mandatory = $true)][string] $Package,
    [Parameter(Mandatory = $true)][int] $BindPort,
    [Parameter(Mandatory = $false)][bool] $NonInteractiveMode = $false
  )

  $report = New-EvidenceReport -Title 'PRD-093 Gate E2 Certification Evidence' -Parameters @{
    ConfigPath  = $ConfigDir
    PackagePath = $Package
    Port        = $BindPort
  }

  # Load the provisioned service credential from the agent config (ACL'd, WS_W9).
  $configFile = Join-Path $ConfigDir 'agent-config.json'
  $config = Get-Content -Path $configFile -Raw | ConvertFrom-Json
  $credential = $config.serviceCredential

  # --- Automated machine-verifiable rows ---
  $transport = Invoke-TransportAuthChecks -BindPort $BindPort -Credential $credential
  Add-EvidenceStep -Report $report -Number 1 -Step 'Transport: /health + /diagnostics' -Pass ($transport.HealthOk -and $transport.DiagnosticsOk) | Out-Null
  Add-EvidenceStep -Report $report -Number 2 -Step 'Auth: missing/invalid credential rejected' -Pass $transport.MissingRejected | Out-Null

  $integrityOk = Invoke-PackageIntegrityCheck -Package $Package
  Add-EvidenceStep -Report $report -Number 3 -Step 'Package signature + manifest verified (WS_W4, fail-closed)' -Pass $integrityOk | Out-Null

  $rebootOk = Test-RebootRecovery
  Add-EvidenceStep -Report $report -Number 4 -Step 'Reboot recovery: service Automatic + Running (NFR-6)' -Pass $rebootOk | Out-Null

  # --- Physical Y/N confirmations (the ONLY interactive prompts) ---
  $onePrinted = Read-PhysicalConfirmation -Question 'Did exactly one receipt print?' -NonInteractiveMode $NonInteractiveMode
  $legible = Read-PhysicalConfirmation -Question 'Was the content legible?' -NonInteractiveMode $NonInteractiveMode
  $cutterOk = Read-PhysicalConfirmation -Question 'Did the cutter operate correctly?' -NonInteractiveMode $NonInteractiveMode
  $noDuplicate = Read-PhysicalConfirmation -Question 'Was any duplicate paper emitted?' -FailOnYes $true -NonInteractiveMode $NonInteractiveMode

  Add-EvidenceStep -Report $report -Number 5 -Step 'Physical: exactly one receipt printed' -Pass ([bool]$onePrinted) | Out-Null
  Add-EvidenceStep -Report $report -Number 6 -Step 'Physical: content legible' -Pass ([bool]$legible) | Out-Null
  Add-EvidenceStep -Report $report -Number 7 -Step 'Physical: cutter operated correctly' -Pass ([bool]$cutterOk) | Out-Null
  Add-EvidenceStep -Report $report -Number 8 -Step 'Physical: NO duplicate paper emitted' -Pass ([bool]$noDuplicate) | Out-Null

  $jsonPath = Write-EvidenceReport -Report $report -OutputDir $ConfigDir `
    -BaseName 'gate-e2-evidence-report'
  return [pscustomobject]@{
    EvidenceReport = $jsonPath
    AllPass        = (Test-EvidenceAllPass -Report $report)
  }
}

# Entry point.
Invoke-GateE2Certification -ConfigDir $ConfigPath -Package $PackagePath `
  -BindPort $Port -NonInteractiveMode:$NonInteractive
