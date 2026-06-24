<#
.SYNOPSIS
  PrintAgentService.psm1 — WinSW-based Windows Service lifecycle for the D3LT
  loyalty print agent (PRD-093 WS_W3, DEC-WIN-02).

.DESCRIPTION
  A CALLABLE module (not a standalone script) that Provision-PrintAgent.ps1 (WS_W9)
  orchestrates. Implements the SINGLE selected hosting mechanism — WinSW — per
  DEC-WIN-02: declarative XML config, least-privilege per-service virtual account,
  Automatic startup depending on the Spooler service, restart-on-failure recovery,
  and idempotent install/uninstall. No sc.exe/NSSM fork.

  Loopback-only exposure (ADR-063 D1) is enforced by the agent process itself; this
  module governs the service host, not the network bind.
#>

Set-StrictMode -Version Latest

$script:ServiceId = 'd3lt-print-agent'
$script:ServiceDisplayName = 'D3LT Loyalty Print Agent'
$script:ServiceAccount = 'NT SERVICE\d3lt-print-agent'

function New-PrintAgentServiceXml {
  <#
    Generate the WinSW declarative service config. Encodes the DEC-WIN-02 decisions:
    Automatic startup, depend on Spooler, virtual-account identity, 5/10/30s
    restart recovery (reset after 1 day), size-rolled logs under ProgramData.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $NodePath,
    [Parameter(Mandatory = $true)][string] $AgentEntryScript,
    [Parameter(Mandatory = $true)][string] $LogDir
  )

  $xml = @"
<service>
  <id>$script:ServiceId</id>
  <name>$script:ServiceDisplayName</name>
  <description>Controlled loyalty-instrument RAW print agent (loopback only).</description>
  <executable>$NodePath</executable>
  <arguments>"$AgentEntryScript"</arguments>
  <serviceaccount>
    <username>$script:ServiceAccount</username>
    <allowservicelogon>true</allowservicelogon>
  </serviceaccount>
  <startmode>Automatic</startmode>
  <depend>Spooler</depend>
  <onfailure action="restart" delay="5 sec" />
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <resetfailure>1 day</resetfailure>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
  <logpath>$LogDir</logpath>
</service>
"@
  return $xml
}

function Install-PrintAgentService {
  <# Idempotent install: (re)writes the WinSW config and registers the service. #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $WinSwPath,
    [Parameter(Mandatory = $true)][string] $NodePath,
    [Parameter(Mandatory = $true)][string] $AgentEntryScript,
    [Parameter(Mandatory = $true)][string] $LogDir
  )

  if (-not (Test-Path -Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
  }

  $configPath = [System.IO.Path]::ChangeExtension($WinSwPath, '.xml')
  $xml = New-PrintAgentServiceXml -NodePath $NodePath -AgentEntryScript $AgentEntryScript -LogDir $LogDir
  Set-Content -Path $configPath -Value $xml -Encoding UTF8

  # Idempotency: uninstall an existing registration before re-registering.
  $existing = Get-Service -Name $script:ServiceId -ErrorAction SilentlyContinue
  if ($null -ne $existing) {
    & $WinSwPath stop | Out-Null
    & $WinSwPath uninstall | Out-Null
  }

  & $WinSwPath install
  if ($LASTEXITCODE -ne 0) {
    throw "WinSW install failed (exit $LASTEXITCODE)"
  }
  return $configPath
}

function Start-PrintAgentService {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string] $WinSwPath)
  & $WinSwPath start
  if ($LASTEXITCODE -ne 0) {
    throw "WinSW start failed (exit $LASTEXITCODE)"
  }
}

function Stop-PrintAgentService {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string] $WinSwPath)
  & $WinSwPath stop
}

function Uninstall-PrintAgentService {
  <# Clean uninstall: stop then remove. Safe to call when not installed. #>
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string] $WinSwPath)
  $existing = Get-Service -Name $script:ServiceId -ErrorAction SilentlyContinue
  if ($null -eq $existing) {
    return
  }
  & $WinSwPath stop | Out-Null
  & $WinSwPath uninstall
}

function Get-PrintAgentServiceStatus {
  [CmdletBinding()]
  param()
  $svc = Get-Service -Name $script:ServiceId -ErrorAction SilentlyContinue
  if ($null -eq $svc) {
    return [pscustomobject]@{ Id = $script:ServiceId; Installed = $false; Status = 'absent' }
  }
  return [pscustomobject]@{
    Id        = $script:ServiceId
    Installed = $true
    Status    = $svc.Status.ToString()
    StartType = $svc.StartType.ToString()
  }
}

Export-ModuleMember -Function `
  New-PrintAgentServiceXml, `
  Install-PrintAgentService, `
  Start-PrintAgentService, `
  Stop-PrintAgentService, `
  Uninstall-PrintAgentService, `
  Get-PrintAgentServiceStatus
