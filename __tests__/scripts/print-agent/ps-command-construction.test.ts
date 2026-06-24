/** @jest-environment node */

/**
 * PowerShell command-construction assertions (PRD-093 WS_W4, audit P2-2/P2-3)
 *
 * pwsh is unavailable on the Linux pipeline runner, so the script-test gate proves
 * PowerShell deliverables through a deterministic, environment-safe path: it
 * statically asserts that install / uninstall / rollback command construction is
 * present and correct in the script text, and that the rollback path contains NO
 * browser-fallback (window.print) token (INV-5 / D7). Real service install + the
 * pwsh PARSER check remain gated on a Windows host (recorded by WS_DOD as
 * powershell_parser_status: pending until then). This test is the load-bearing CI
 * assertion that the constructed commands are deterministic and invariant-safe.
 *
 * @see PRD-093 / EXEC-093 WS_W4
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, it, expect } from '@jest/globals';

const SCRIPT_DIR = join(__dirname, '..', '..', '..', 'scripts', 'print-agent');

function readScript(name: string): string {
  return readFileSync(join(SCRIPT_DIR, name), 'utf8');
}

/**
 * Strip PowerShell comments (`<# ... #>` block + `#` line) so absence assertions
 * test EXECUTABLE code, not the doc-comments that legitimately NAME a forbidden
 * token to declare it banned (e.g. "no NSSM fork", "never window.print()").
 */
function stripPsComments(source: string): string {
  return source
    .replace(/<#[\s\S]*?#>/g, '') // block comments
    .replace(/#.*$/gm, ''); // line comments
}

describe('PrintAgentService.psm1 — service lifecycle command construction (DEC-WIN-02)', () => {
  const psm1 = readScript('PrintAgentService.psm1');

  it('constructs WinSW install / uninstall / start / stop invocations', () => {
    expect(psm1).toMatch(/&\s*\$WinSwPath\s+install/);
    expect(psm1).toMatch(/&\s*\$WinSwPath\s+uninstall/);
    expect(psm1).toMatch(/&\s*\$WinSwPath\s+start/);
    expect(psm1).toMatch(/&\s*\$WinSwPath\s+stop/);
  });

  it('is idempotent: uninstalls an existing registration before re-registering', () => {
    expect(psm1).toMatch(/Get-Service\s+-Name\s+\$script:ServiceId/);
    // The install path stops+uninstalls a pre-existing service before install.
    const installBody = psm1.slice(
      psm1.indexOf('function Install-PrintAgentService'),
    );
    expect(installBody).toMatch(/uninstall/);
  });

  it('uses the single selected mechanism (WinSW) — no sc.exe / nssm fork', () => {
    const code = stripPsComments(psm1);
    expect(code).not.toMatch(/\bnssm\b/i);
    expect(code).not.toMatch(/sc\.exe\s+create/i);
  });

  it('binds the least-privilege virtual service account (DEC-WIN-02)', () => {
    expect(psm1).toMatch(/NT SERVICE\\d3lt-print-agent/);
  });

  it('exports the lifecycle functions as a callable module', () => {
    expect(psm1).toMatch(/Export-ModuleMember/);
    expect(psm1).toMatch(/Install-PrintAgentService/);
    expect(psm1).toMatch(/Uninstall-PrintAgentService/);
  });
});

describe('rollback-agent.ps1 — rollback command construction (DEC-WIN-04 D7 / INV-5)', () => {
  const rollback = readScript('rollback-agent.ps1');

  it('disables the agent path by stopping then uninstalling the service', () => {
    expect(rollback).toMatch(/Stop-PrintAgentService/);
    expect(rollback).toMatch(/Uninstall-PrintAgentService/);
  });

  it('restores a PINNED previous version, never "latest"', () => {
    expect(rollback).toMatch(/PreviousPackageVersion/);
    // The pinned version flows into the restore path; "latest" must not appear as a
    // version selector in executable code (excluding the `Set-StrictMode -Version
    // Latest` directive and the doc-comment that says "never latest").
    const code = stripPsComments(rollback).replace(
      /Set-StrictMode\s+-Version\s+Latest/gi,
      '',
    );
    expect(code).not.toMatch(/latest/i);
  });

  it('verifies the pinned package (fail-closed) BEFORE reinstalling', () => {
    expect(rollback).toMatch(/verify-integrity\.js/);
    // Verification failure aborts the rollback (throw) before Install/Start.
    const restoreBody = rollback.slice(
      rollback.indexOf('function Restore-PinnedPackageVersion'),
    );
    const verifyIdx = restoreBody.indexOf('verify-integrity.js');
    const installIdx = restoreBody.indexOf('Install-PrintAgentService');
    expect(verifyIdx).toBeGreaterThanOrEqual(0);
    expect(installIdx).toBeGreaterThan(verifyIdx); // verify precedes install
    expect(restoreBody).toMatch(/throw .*integrity/i);
  });

  it('contains NO browser-fallback path (INV-5 — no window.print)', () => {
    // Executable code only: the doc-comment names window.print() to declare it banned.
    const code = stripPsComments(rollback).toLowerCase();
    expect(code).not.toContain('window.print');
    expect(code).not.toMatch(
      /start-process\s+.*(chrome|msedge|firefox|iexplore|http)/i,
    );
  });
});

describe('package-agent.ps1 — packaging + signing command construction (DEC-WIN-04)', () => {
  const pkg = readScript('package-agent.ps1');

  it('emits ONE versioned ZIP named by package version', () => {
    expect(pkg).toMatch(/d3lt-print-agent-\$Version\.zip/);
    expect(pkg).toMatch(/Compress-Archive/);
  });

  it('builds a SHA-256 hash manifest (the integrity trust anchor)', () => {
    expect(pkg).toMatch(/Get-FileHash[^\n]*-Algorithm\s+SHA256/);
    expect(pkg).toMatch(/manifest\.json/);
    expect(pkg).toMatch(/package_version/);
    expect(pkg).toMatch(/protocol_version/);
  });

  it('constructs a deterministic single-signing-system signtool command', () => {
    expect(pkg).toMatch(/function New-SignToolCommand/);
    expect(pkg).toMatch(/'signtool',\s*'sign'/);
    expect(pkg).toMatch(/\/fd['\s,]+.*SHA256/);
  });

  it('does not fabricate a signature when no thumbprint is supplied (Gate W-B is manual)', () => {
    // Unsigned build path must WARN, not silently emit a "signed" package.
    expect(pkg).toMatch(/UNSIGNED/);
    expect(pkg).toMatch(/Write-Warning/);
  });
});
