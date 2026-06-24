<#
.SYNOPSIS
  PrintAgentEvidence.psm1 — machine-readable provisioning/certification evidence
  accumulator (PRD-093 WS_W9).

.DESCRIPTION
  A CALLABLE module that Provision-PrintAgent.ps1 (WS_W9) and
  Invoke-GateE2Certification.ps1 (WS_W6) use to record each automated step and emit
  a deterministic evidence report (JSON + Markdown). Keeping evidence construction in
  one module means the two governed commands produce consistent, auditable reports
  instead of ad-hoc echo lines.

  No secrets are ever written to the evidence report — callers record booleans and
  opaque addresses/hashes, never credentials or raw request bodies (mirrors the
  /diagnostics disclosure boundary, DEC-WIN-03).
#>

Set-StrictMode -Version Latest

function New-EvidenceReport {
  <# Start a report accumulator for one run. #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $Title,
    [Parameter(Mandatory = $true)][hashtable] $Parameters
  )
  return [pscustomobject]@{
    title      = $Title
    parameters = $Parameters
    steps      = [System.Collections.ArrayList]::new()
  }
}

function Add-EvidenceStep {
  <#
    Append one step result. $Pass is the machine verdict; $Evidence is an opaque,
    non-secret note (command output snippet / hash / address). NEVER pass a secret.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][pscustomobject] $Report,
    [Parameter(Mandatory = $true)][int] $Number,
    [Parameter(Mandatory = $true)][string] $Step,
    [Parameter(Mandatory = $true)][bool] $Pass,
    [Parameter(Mandatory = $false)][string] $Evidence = ''
  )
  [void]$Report.steps.Add([pscustomobject]@{
      number   = $Number
      step     = $Step
      pass     = $Pass
      evidence = $Evidence
    })
  return $Report
}

function Test-EvidenceAllPass {
  <# True iff every recorded step passed. #>
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][pscustomobject] $Report)
  foreach ($s in $Report.steps) {
    if (-not $s.pass) { return $false }
  }
  return $true
}

function Write-EvidenceReport {
  <#
    Emit the report as JSON (machine-readable) and Markdown (human-readable) next to
    each other. Returns the JSON path. Overall verdict is ALL-PASS only when every
    step passed (fail-closed reporting).
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][pscustomobject] $Report,
    [Parameter(Mandatory = $true)][string] $OutputDir,
    # Report file base name (no extension). Defaults to the provisioning report;
    # the Gate E2 command passes a distinct name so the two governed commands do
    # NOT overwrite each other's report in a shared -ConfigPath.
    [Parameter(Mandatory = $false)][string] $BaseName = 'provisioning-evidence-report'
  )

  if (-not (Test-Path -Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  }

  $allPass = Test-EvidenceAllPass -Report $Report
  $jsonPath = Join-Path $OutputDir "$BaseName.json"
  $mdPath = Join-Path $OutputDir "$BaseName.md"

  $payload = [pscustomobject]@{
    title      = $Report.title
    parameters = $Report.parameters
    all_pass   = $allPass
    steps      = $Report.steps
  }
  $payload | ConvertTo-Json -Depth 6 | Set-Content -Path $jsonPath -Encoding UTF8

  $lines = @()
  $lines += "# $($Report.title)"
  $lines += ''
  $lines += "**Overall:** $(if ($allPass) { 'ALL PASS' } else { 'FAILED' })"
  $lines += ''
  $lines += '| # | Step | Result | Evidence |'
  $lines += '|---|------|--------|----------|'
  foreach ($s in $Report.steps) {
    $result = if ($s.pass) { 'PASS' } else { 'FAIL' }
    $lines += "| $($s.number) | $($s.step) | $result | $($s.evidence) |"
  }
  $lines -join "`n" | Set-Content -Path $mdPath -Encoding UTF8

  return $jsonPath
}

Export-ModuleMember -Function `
  New-EvidenceReport, `
  Add-EvidenceStep, `
  Test-EvidenceAllPass, `
  Write-EvidenceReport
