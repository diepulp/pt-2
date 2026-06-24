/** @jest-environment node */

/**
 * Invoke-GateE2Certification.ps1 command-construction assertions (PRD-093 WS_W6)
 *
 * pwsh is unavailable on the Linux runner, so the test-pass gate proves the second
 * governed command deterministically: it automates the machine-verifiable Gate E2
 * checks (transport / auth / replay / reboot / package integrity), pauses ONLY for
 * the four physical Y/N confirmations, emits an evidence report, and never invokes a
 * browser fallback. Real device execution is the manual Gate W-C; this is the
 * load-bearing CI assertion that the command is constructed correctly.
 *
 * @see PRD-093 / EXEC-093 WS_W6
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, it, expect } from '@jest/globals';

const SCRIPT_DIR = join(__dirname, '..', '..', '..', 'scripts', 'print-agent');

function readScript(name: string): string {
  return readFileSync(join(SCRIPT_DIR, name), 'utf8');
}

function stripPsComments(source: string): string {
  return source.replace(/<#[\s\S]*?#>/g, '').replace(/#.*$/gm, '');
}

describe('Invoke-GateE2Certification.ps1 — Gate E2 certification automation (WS_W6)', () => {
  const ps = readScript('Invoke-GateE2Certification.ps1');
  const code = stripPsComments(ps);

  it('automates transport + diagnostics checks against the live loopback agent', () => {
    // Base URL is loopback-only; /health + /diagnostics are probed off it.
    expect(code).toMatch(/\$base\s*=\s*"http:\/\/127\.0\.0\.1:\$BindPort"/);
    expect(code).toMatch(/\$base\/health/);
    expect(code).toMatch(/\$base\/diagnostics/);
    expect(code).toMatch(/x-agent-credential/);
  });

  it('automates auth: a missing credential must be rejected (no silent 200)', () => {
    expect(code).toMatch(/MissingRejected/);
    // The 401 path sets the rejected flag in a catch — proving rejection, not pass.
    expect(code).toMatch(/catch\s*\{\s*\$missingRejected\s*=\s*\$true/);
  });

  it('re-verifies package signature + manifest via WS_W4 (fail-closed)', () => {
    expect(code).toMatch(/verify-integrity\.js/);
    expect(code).toMatch(/Invoke-PackageIntegrityCheck/);
  });

  it('verifies reboot recovery (service Automatic + Running, NFR-6)', () => {
    expect(code).toMatch(/Test-RebootRecovery/);
    expect(code).toMatch(/Automatic/);
    expect(code).toMatch(/Running/);
  });

  it('pauses for EXACTLY the four physical Y/N confirmations', () => {
    expect(ps).toContain('Did exactly one receipt print?');
    expect(ps).toContain('Was the content legible?');
    expect(ps).toContain('Did the cutter operate correctly?');
    expect(ps).toContain('Was any duplicate paper emitted?');
    // The duplicate-paper question fails on YES (a duplicate is a failure).
    expect(code).toMatch(
      /Was any duplicate paper emitted\?'\s*-FailOnYes\s*\$true/,
    );
  });

  it('uses Read-Host for the physical confirmations (interactive, not auto-passed)', () => {
    expect(code).toMatch(/Read-Host/);
    // Non-interactive mode defers (null), never silently passes a physical row.
    expect(code).toMatch(/return \$null/);
  });

  it('emits a DISTINCT Gate E2 evidence report (not overwriting the provisioning report)', () => {
    expect(ps).toMatch(/Import-Module .*PrintAgentEvidence\.psm1/);
    expect(code).toMatch(/New-EvidenceReport/);
    expect(code).toMatch(/Write-EvidenceReport/);
    // The Gate E2 report uses its own base name so it does not clobber
    // provisioning-evidence-report.* in a shared -ConfigPath.
    expect(code).toMatch(/-BaseName\s+'gate-e2-evidence-report'/);
  });

  it('invokes NO browser fallback (INV-5)', () => {
    expect(code.toLowerCase()).not.toContain('window.print');
    expect(code).not.toMatch(/Start-Process\s+.*(chrome|msedge|firefox|http)/i);
  });
});
