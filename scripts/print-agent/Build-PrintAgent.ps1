<#
.SYNOPSIS
  Build-PrintAgent.ps1 — produce the populated StageDir that package-agent.ps1
  signs and zips (PRD-093 step-1 build gap, WS_W2/WS_W3/WS_W4).

.DESCRIPTION
  package-agent.ps1 requires a $StageDir that is ALREADY populated with built
  artifacts. This is the missing producer of that directory. It performs the three
  build halves and assembles the exact layout the downstream chain expects:

    1. Native helper (DEC-WIN-01, WS_W2) — msbuild the static-CRT (/MT) x64 console
       exe from winspool-print-helper.vcxproj on a Windows host with MSVC v143 + the
       Windows SDK, then stage it at  native/winspool-print-helper.exe.
    2. Agent bundle (WS_W3/WS_W4) — invoke bundle-agent.mjs (esbuild) to emit the
       self-contained CJS  agent-service-entry.js  and  verify-integrity.js  at the
       stage root. This half is platform-neutral and is what Linux CI exercises.
    3. Pinned WinSW (DEC-WIN-02) — verify the supplied WinSW x64 executable against
       the PINNED SHA-256 (fail-closed: a hash mismatch or an unconfigured pin
       ABORTS — no permissive default, no silent download-of-latest), then stage it
       at  winsw/d3lt-print-agent.exe.

  It then copies the operator PowerShell scripts/modules into the stage so the one
  signed ZIP is self-bootstrapping (Provision-PrintAgent.ps1 resolves verify-
  integrity.js + the modules from its own $PSScriptRoot). The manifest + signature
  are NOT produced here — that is package-agent.ps1 (step 2, Gate W-B, on the cert
  host). This script never signs and never fabricates the pinned WinSW hash.

  Resulting StageDir layout (input to package-agent.ps1 -StageDir):
    agent-service-entry.js          (bundled CJS)
    verify-integrity.js             (bundled CJS)
    native/winspool-print-helper.exe
    winsw/d3lt-print-agent.exe      (pin-verified)
    Provision-PrintAgent.ps1, PrintAgentService.psm1, PrintAgentEvidence.psm1,
    Invoke-GateE2Certification.ps1, package-agent.ps1, rollback-agent.ps1

.NOTES
  msbuild + the pinned WinSW are Windows-only; the esbuild bundle runs anywhere.
  Deterministic command construction + the fail-closed pin are asserted pwsh-free by
  __tests__/scripts/print-agent/build-command-construction.test.ts (Linux CI path).
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $StageDir,
  # Path to the downloaded WinSW x64 executable to pin + stage (DEC-WIN-02).
  [Parameter(Mandatory = $true)][string] $WinSwSourcePath,
  # msbuild build configuration/platform — Release/x64 produces the shipped helper.
  [Parameter(Mandatory = $false)][string] $Configuration = 'Release',
  [Parameter(Mandatory = $false)][string] $Platform = 'x64',
  # node executable used to run the esbuild bundler.
  [Parameter(Mandatory = $false)][string] $NodePath = 'node'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Pinned WinSW x64 SHA-256 (DEC-WIN-02). The fail-closed verifier rejects any binary
# whose hash does not match this pin AND refuses to run while the pin is the
# placeholder — the operator MUST set this to the audited WinSW release hash before
# a production build. There is no permissive default (mirrors WS_W4 NFR-7).
$script:WINSW_PINNED_SHA256 = '<PIN-WINSW-X64-SHA256>'

# The operator-facing scripts/modules bundled into the package so the signed ZIP is
# self-bootstrapping (Provision resolves these from its own $PSScriptRoot).
$script:OperatorScripts = @(
  'Provision-PrintAgent.ps1',
  'PrintAgentService.psm1',
  'PrintAgentEvidence.psm1',
  'Invoke-GateE2Certification.ps1',
  'package-agent.ps1',
  'rollback-agent.ps1'
)

function New-HelperBuildCommand {
  <#
    Construct the deterministic msbuild command for the native RAW helper. Returns
    the argv array (never executes here) so it is unit-assertable. OutDir is pinned
    so the produced exe lands at a deterministic, stage-able path.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $ProjectPath,
    [Parameter(Mandatory = $true)][string] $Config,
    [Parameter(Mandatory = $true)][string] $Plat,
    [Parameter(Mandatory = $true)][string] $OutDir
  )
  return @(
    'msbuild', $ProjectPath,
    "/p:Configuration=$Config",
    "/p:Platform=$Plat",
    "/p:OutDir=$OutDir"
  )
}

function New-BundleCommand {
  <#
    Construct the deterministic esbuild bundle command. Returns argv (never executes
    here). The .mjs entry emits agent-service-entry.js + verify-integrity.js as
    self-contained CJS into the stage root.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $Node,
    [Parameter(Mandatory = $true)][string] $BundleScript,
    [Parameter(Mandatory = $true)][string] $OutDir
  )
  return @($Node, $BundleScript, '--outdir', $OutDir)
}

function Assert-WinSwPin {
  <#
    Fail-closed pin verification (DEC-WIN-02). Throws when the pin is unconfigured
    (still the placeholder) or when the supplied binary's SHA-256 does not match the
    pin. Returns the verified lowercase hash on success. NO download, NO "latest".
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $SourcePath,
    [Parameter(Mandatory = $true)][string] $PinnedSha256
  )
  if ($PinnedSha256 -notmatch '^[0-9a-fA-F]{64}$') {
    throw "WinSW pin not configured: set `$script:WINSW_PINNED_SHA256 to the audited WinSW x64 release hash (DEC-WIN-02)."
  }
  if (-not (Test-Path -Path $SourcePath)) {
    throw "WinSW source not found: $SourcePath"
  }
  $actual = (Get-FileHash -Path $SourcePath -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $PinnedSha256.ToLower()) {
    throw "WinSW pin MISMATCH (fail-closed): expected $($PinnedSha256.ToLower()), got $actual"
  }
  return $actual
}

function Invoke-BuildPrintAgent {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $Stage,
    [Parameter(Mandatory = $true)][string] $WinSwSource,
    [Parameter(Mandatory = $true)][string] $Config,
    [Parameter(Mandatory = $true)][string] $Plat,
    [Parameter(Mandatory = $true)][string] $Node
  )

  $projectPath = Join-Path $PSScriptRoot '..\..\services\loyalty\printing\agent\native\winspool-print-helper.vcxproj'
  $bundleScript = Join-Path $PSScriptRoot 'bundle-agent.mjs'

  if (-not (Test-Path -Path $projectPath)) { throw "native project not found: $projectPath" }
  if (-not (Test-Path -Path $bundleScript)) { throw "bundle script not found: $bundleScript" }

  # Clean, deterministic stage.
  if (Test-Path -Path $Stage) { Remove-Item -Path $Stage -Recurse -Force }
  New-Item -ItemType Directory -Path $Stage -Force | Out-Null
  $nativeDir = Join-Path $Stage 'native'
  $winswDir = Join-Path $Stage 'winsw'
  New-Item -ItemType Directory -Path $nativeDir -Force | Out-Null
  New-Item -ItemType Directory -Path $winswDir -Force | Out-Null

  # 1. Native helper (msbuild) — Windows-only. Stage the produced exe.
  $helperBuildOut = Join-Path $Stage '_helper-build'
  New-Item -ItemType Directory -Path $helperBuildOut -Force | Out-Null
  $msbuild = New-HelperBuildCommand -ProjectPath $projectPath -Config $Config -Plat $Plat -OutDir "$helperBuildOut\"
  & $msbuild[0] $msbuild[1..($msbuild.Length - 1)]
  if ($LASTEXITCODE -ne 0) { throw "msbuild failed (exit $LASTEXITCODE)" }
  $helperExe = Join-Path $helperBuildOut 'winspool-print-helper.exe'
  if (-not (Test-Path -Path $helperExe)) { throw "native helper not produced: $helperExe" }
  Copy-Item -Path $helperExe -Destination (Join-Path $nativeDir 'winspool-print-helper.exe') -Force
  Remove-Item -Path $helperBuildOut -Recurse -Force

  # 2. Agent bundle (esbuild) — platform-neutral. Emits the .js into the stage root.
  $bundle = New-BundleCommand -Node $Node -BundleScript $bundleScript -OutDir $Stage
  & $bundle[0] $bundle[1..($bundle.Length - 1)]
  if ($LASTEXITCODE -ne 0) { throw "agent bundle failed (exit $LASTEXITCODE)" }
  foreach ($js in @('agent-service-entry.js', 'verify-integrity.js')) {
    if (-not (Test-Path -Path (Join-Path $Stage $js))) { throw "bundle did not produce $js" }
  }

  # 3. Pinned WinSW (DEC-WIN-02) — fail-closed verify, then stage.
  $winswHash = Assert-WinSwPin -SourcePath $WinSwSource -PinnedSha256 $script:WINSW_PINNED_SHA256
  Copy-Item -Path $WinSwSource -Destination (Join-Path $winswDir 'd3lt-print-agent.exe') -Force

  # 4. Operator scripts/modules — make the package self-bootstrapping.
  foreach ($name in $script:OperatorScripts) {
    $src = Join-Path $PSScriptRoot $name
    if (-not (Test-Path -Path $src)) { throw "operator script missing: $src" }
    Copy-Item -Path $src -Destination (Join-Path $Stage $name) -Force
  }

  return [pscustomobject]@{
    StageDir   = $Stage
    HelperExe  = (Join-Path $nativeDir 'winspool-print-helper.exe')
    WinSwExe   = (Join-Path $winswDir 'd3lt-print-agent.exe')
    WinSwSha256 = $winswHash
    Bundles    = @('agent-service-entry.js', 'verify-integrity.js')
    Scripts    = $script:OperatorScripts
  }
}

# Entry point.
Invoke-BuildPrintAgent -Stage $StageDir -WinSwSource $WinSwSourcePath `
  -Config $Configuration -Plat $Platform -Node $NodePath
