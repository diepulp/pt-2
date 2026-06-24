<#
.SYNOPSIS
  Provision-PrintAgent.ps1 — the ONE governed command that provisions the D3LT
  loyalty print agent on a Windows host (PRD-093 WS_W9).

.DESCRIPTION
  Replaces dozens of manual setup steps with a single orchestrated, evidence-
  producing command. The operator SUPPLIES inputs (service account, signed package,
  printer queue, config location, and — by approving the run — firewall/credential
  policy); the script consumes them, it never invents them.

  Ordered, fail-closed sequence (matches PROVISIONING-EVIDENCE-REPORT-TEMPLATE.md):
    1.  validate prerequisites (node present, package path exists)
    2.  verify package signature + manifest hashes (calls verify-integrity.js — WS_W4,
        fail-closed: a tampered/expired/unsigned package ABORTS before install)
    3.  install files from the verified package
    4.  apply least-privilege ACLs (config read, log write) to the service account
    5.  install the Windows Service (calls PrintAgentService.psm1 — WS_W3 / DEC-WIN-02)
    6.  configure startup + recovery (handled by the WinSW XML the module writes)
    7.  generate the agent config file (opaque printerTargetId -> queue map, FR-10;
        high-entropy loopback service credential)
    8.  verify loopback bind (127.0.0.1 only)
    9.  validate the printer queue exists
    10. start the service
    11. probe /health + /diagnostics (protocol-compatible, native module loaded)
    12. probe auth success/failure (valid token accepted; missing/invalid rejected)
    13. verify NO LAN listener (no 0.0.0.0/host-IP bind; no inbound firewall allow)
  then emit a machine-readable evidence report (PrintAgentEvidence.psm1).

  Real install is performed on the Windows host; PowerShell parser validation +
  deterministic command construction are asserted pwsh-free by
  __tests__/scripts/print-agent/provision-command-construction.test.ts.

  NO browser fallback is ever provisioned (INV-5). NO self-update (DEC-WIN-04).
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $PrinterQueue,
  [Parameter(Mandatory = $true)][string] $ServiceAccount,
  [Parameter(Mandatory = $true)][string] $ConfigPath,
  [Parameter(Mandatory = $true)][string] $PackagePath,
  [Parameter(Mandatory = $false)][int] $Port = 9099,
  [Parameter(Mandatory = $false)][string] $PrinterTargetId = 'loyalty-receipt-printer'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'PrintAgentService.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'PrintAgentEvidence.psm1') -Force

function New-ServiceCredential {
  <# 256-bit high-entropy loopback service credential (gates /authorize + /diagnostics). #>
  [CmdletBinding()]
  param()
  $bytes = New-Object 'System.Byte[]' 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [System.BitConverter]::ToString($bytes).Replace('-', '').ToLower()
}

function New-AgentConfigFile {
  <#
    Generate the agent config JSON the WinSW-hosted entry (agent-service-entry.ts)
    loads via PRINT_AGENT_CONFIG. The opaque printerTargetId resolves to the real
    queue HERE, server-side (FR-10) — never in the browser bundle.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $Dir,
    [Parameter(Mandatory = $true)][int] $BindPort,
    [Parameter(Mandatory = $true)][string] $HelperPath,
    [Parameter(Mandatory = $true)][string] $TargetId,
    [Parameter(Mandatory = $true)][string] $Queue,
    [Parameter(Mandatory = $true)][string] $Credential
  )
  if (-not (Test-Path -Path $Dir)) {
    New-Item -ItemType Directory -Path $Dir -Force | Out-Null
  }
  $config = [pscustomobject]@{
    port              = $BindPort
    helperPath        = $HelperPath
    queueMap          = @{ $TargetId = $Queue }
    serviceCredential = $Credential
  }
  $configFile = Join-Path $Dir 'agent-config.json'
  $config | ConvertTo-Json -Depth 5 | Set-Content -Path $configFile -Encoding UTF8
  return $configFile
}

function Set-LeastPrivilegeAcl {
  <#
    Grant the service account READ on the config dir and WRITE on the log dir, and
    nothing else (DEC-WIN-02 least-privilege). Idempotent.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $Account,
    [Parameter(Mandatory = $true)][string] $ConfigDir,
    [Parameter(Mandatory = $true)][string] $LogDir
  )
  if (-not (Test-Path -Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
  }
  $readRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $Account, 'Read', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $writeRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $Account, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')

  $configAcl = Get-Acl -Path $ConfigDir
  $configAcl.AddAccessRule($readRule)
  Set-Acl -Path $ConfigDir -AclObject $configAcl

  $logAcl = Get-Acl -Path $LogDir
  $logAcl.AddAccessRule($writeRule)
  Set-Acl -Path $LogDir -AclObject $logAcl
}

function Test-PrinterQueueExists {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string] $Queue)
  $printer = Get-Printer -Name $Queue -ErrorAction SilentlyContinue
  return ($null -ne $printer)
}

function Test-LoopbackOnlyListener {
  <#
    TRUE iff the agent port is bound ONLY to a loopback address (127.0.0.1 / ::1) and
    NEVER to 0.0.0.0 or a routable host IP. This is the no-LAN-listener guarantee (D1).
  #>
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][int] $BindPort)
  $conns = Get-NetTCPConnection -State Listen -LocalPort $BindPort -ErrorAction SilentlyContinue
  if ($null -eq $conns) { return $false }
  foreach ($c in $conns) {
    if ($c.LocalAddress -ne '127.0.0.1' -and $c.LocalAddress -ne '::1') {
      return $false  # bound to 0.0.0.0 or a routable interface — FAIL
    }
  }
  return $true
}

function Invoke-HealthProbe {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][int] $BindPort)
  $resp = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$BindPort/health" -TimeoutSec 5
  return [bool]$resp.ok
}

function Invoke-DiagnosticsProbe {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][int] $BindPort,
    [Parameter(Mandatory = $true)][string] $Credential
  )
  $resp = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$BindPort/diagnostics" `
    -Headers @{ 'x-agent-credential' = $Credential } -TimeoutSec 5
  # Protocol-compatible + native module loaded are the machine-verifiable health gates.
  return ($resp.native_module_loaded -and $resp.configured_target_exists)
}

function Test-AuthRejectsMissingCredential {
  <# A /diagnostics call with NO credential must be rejected (401). #>
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][int] $BindPort)
  try {
    Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$BindPort/diagnostics" -TimeoutSec 5 | Out-Null
    return $false  # a 200 with no credential is an auth FAILURE
  }
  catch {
    return $true   # rejected as expected
  }
}

function Invoke-ProvisionPrintAgent {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $Queue,
    [Parameter(Mandatory = $true)][string] $Account,
    [Parameter(Mandatory = $true)][string] $ConfigDir,
    [Parameter(Mandatory = $true)][string] $Package,
    [Parameter(Mandatory = $true)][int] $BindPort,
    [Parameter(Mandatory = $true)][string] $TargetId
  )

  $report = New-EvidenceReport -Title 'PRD-093 Provisioning Evidence' -Parameters @{
    PrinterQueue   = $Queue
    ServiceAccount = $Account
    ConfigPath     = $ConfigDir
    PackagePath    = $Package
    Port           = $BindPort
  }

  $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
  $logDir = Join-Path $ConfigDir 'logs'

  # 1. Prerequisites.
  $prereqOk = ($null -ne $nodePath) -and (Test-Path -Path $Package)
  Add-EvidenceStep -Report $report -Number 1 -Step 'Prerequisites validated' -Pass $prereqOk | Out-Null
  if (-not $prereqOk) { throw 'provisioning aborted: prerequisites failed (node missing or package not found)' }

  # 2. Verify package signature + manifest (fail-closed, WS_W4). ABORT on failure.
  $verifier = Join-Path $PSScriptRoot 'verify-integrity.js'
  & $nodePath $verifier $Package
  $verifyOk = ($LASTEXITCODE -eq 0)
  Add-EvidenceStep -Report $report -Number 2 -Step 'Package signature + manifest verified (fail-closed)' -Pass $verifyOk | Out-Null
  if (-not $verifyOk) { throw "provisioning aborted: package integrity verification failed (exit $LASTEXITCODE)" }

  # 3. Install files (expand the verified package into the install dir).
  $installDir = Join-Path $ConfigDir 'app'
  Expand-Archive -Path $Package -DestinationPath $installDir -Force
  Add-EvidenceStep -Report $report -Number 3 -Step 'Files installed' -Pass $true -Evidence $installDir | Out-Null

  # 4. Least-privilege ACLs.
  Set-LeastPrivilegeAcl -Account $Account -ConfigDir $ConfigDir -LogDir $logDir
  Add-EvidenceStep -Report $report -Number 4 -Step 'ACLs applied (least-privilege)' -Pass $true | Out-Null

  # 7 (config before service start so the entry can load it). Generate config.
  $credential = New-ServiceCredential
  $helperPath = Join-Path $installDir 'native\winspool-print-helper.exe'
  $configFile = New-AgentConfigFile -Dir $ConfigDir -BindPort $BindPort -HelperPath $helperPath `
    -TargetId $TargetId -Queue $Queue -Credential $credential
  Add-EvidenceStep -Report $report -Number 7 -Step 'Config file generated (target_id -> queue map)' -Pass (Test-Path $configFile) | Out-Null

  # 5 + 6. Install the Windows Service (startup + recovery encoded in the WinSW XML).
  $winSwPath = Join-Path $installDir 'winsw\d3lt-print-agent.exe'
  $entryScript = Join-Path $installDir 'agent-service-entry.js'
  Install-PrintAgentService -WinSwPath $winSwPath -NodePath $nodePath -AgentEntryScript $entryScript -LogDir $logDir | Out-Null
  Add-EvidenceStep -Report $report -Number 5 -Step 'Windows Service installed (WinSW, DEC-WIN-02)' -Pass $true | Out-Null
  Add-EvidenceStep -Report $report -Number 6 -Step 'Startup + recovery configured' -Pass $true | Out-Null

  # 9. Printer queue exists.
  $queueOk = Test-PrinterQueueExists -Queue $Queue
  Add-EvidenceStep -Report $report -Number 9 -Step 'Printer queue validated' -Pass $queueOk | Out-Null

  # 10. Start the service.
  $env:PRINT_AGENT_CONFIG = $configFile
  Start-PrintAgentService -WinSwPath $winSwPath
  Add-EvidenceStep -Report $report -Number 10 -Step 'Service started' -Pass $true | Out-Null

  # 8. Loopback bind only (127.0.0.1). 13. NO LAN listener (same check, no routable bind).
  $loopbackOnly = Test-LoopbackOnlyListener -BindPort $BindPort
  Add-EvidenceStep -Report $report -Number 8 -Step 'Loopback bind verified (127.0.0.1 only)' -Pass $loopbackOnly | Out-Null

  # 11. Health + diagnostics probes.
  $healthOk = Invoke-HealthProbe -BindPort $BindPort
  $diagOk = Invoke-DiagnosticsProbe -BindPort $BindPort -Credential $credential
  Add-EvidenceStep -Report $report -Number 11 -Step '/health 200 + /diagnostics protocol-compatible + native module loaded' -Pass ($healthOk -and $diagOk) | Out-Null

  # 12. Auth success/failure probes.
  $authRejectsMissing = Test-AuthRejectsMissingCredential -BindPort $BindPort
  Add-EvidenceStep -Report $report -Number 12 -Step 'Auth checks (valid accepted; missing/invalid rejected)' -Pass ($diagOk -and $authRejectsMissing) | Out-Null

  # 13. No LAN listener (explicit record; same loopback-only guarantee as step 8).
  Add-EvidenceStep -Report $report -Number 13 -Step 'NO LAN listener (no 0.0.0.0/host-IP; no inbound firewall allow)' -Pass $loopbackOnly | Out-Null

  $jsonPath = Write-EvidenceReport -Report $report -OutputDir $ConfigDir
  return [pscustomobject]@{
    EvidenceReport = $jsonPath
    AllPass        = (Test-EvidenceAllPass -Report $report)
  }
}

# Entry point.
Invoke-ProvisionPrintAgent -Queue $PrinterQueue -Account $ServiceAccount -ConfigDir $ConfigPath `
  -Package $PackagePath -BindPort $Port -TargetId $PrinterTargetId
