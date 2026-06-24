/** @jest-environment node */

/**
 * Provision-PrintAgent.ps1 command-construction assertions (PRD-093 WS_W9)
 *
 * pwsh is unavailable on the Linux runner, so the script-test gate proves the
 * governed provisioning orchestrator deterministically through a static,
 * environment-safe path: the ordered, fail-closed step sequence is present and
 * correct, integrity verification PRECEDES install, the bind is loopback-only, no
 * LAN listener is allowed, no browser fallback is provisioned, and an evidence
 * report is emitted. Real install runs on the Windows host (recorded by the
 * provisioning evidence report); this is the load-bearing CI assertion.
 *
 * @see PRD-093 / EXEC-093 WS_W9
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

describe('Provision-PrintAgent.ps1 — governed provisioning orchestration (WS_W9)', () => {
  const ps = readScript('Provision-PrintAgent.ps1');
  const code = stripPsComments(ps);

  it('declares the four operator-supplied parameters', () => {
    for (const param of [
      '$PrinterQueue',
      '$ServiceAccount',
      '$ConfigPath',
      '$PackagePath',
    ]) {
      expect(ps).toContain(param);
    }
  });

  it('verifies package integrity (WS_W4) BEFORE installing files (fail-closed)', () => {
    const verifyIdx = code.indexOf('verify-integrity.js');
    const installIdx = code.indexOf('Expand-Archive');
    expect(verifyIdx).toBeGreaterThanOrEqual(0);
    expect(installIdx).toBeGreaterThan(verifyIdx); // verify precedes install
    // Integrity failure aborts before any service install.
    expect(code).toMatch(/throw .*integrity verification failed/i);
  });

  it('installs the Windows Service via the WS_W3 lifecycle module (no inline sc.exe/nssm)', () => {
    expect(ps).toMatch(/Import-Module .*PrintAgentService\.psm1/);
    expect(code).toMatch(/Install-PrintAgentService/);
    expect(code).toMatch(/Start-PrintAgentService/);
    expect(code).not.toMatch(/\bnssm\b/i);
  });

  it('resolves the opaque printerTargetId to the real queue server-side (FR-10)', () => {
    expect(code).toMatch(/queueMap/);
    expect(code).toMatch(/PrinterTargetId|TargetId/);
  });

  it('probes loopback /health + /diagnostics on 127.0.0.1', () => {
    expect(code).toMatch(/http:\/\/127\.0\.0\.1:\$BindPort\/health/);
    expect(code).toMatch(/http:\/\/127\.0\.0\.1:\$BindPort\/diagnostics/);
  });

  it('verifies loopback-only bind and FAILS on a 0.0.0.0 / routable listener', () => {
    expect(code).toMatch(/Get-NetTCPConnection/);
    // The loopback check rejects any non-loopback LocalAddress.
    expect(code).toMatch(/LocalAddress\s+-ne\s+'127\.0\.0\.1'/);
  });

  it('probes auth: a missing credential must be rejected (no silent 200)', () => {
    expect(code).toMatch(/Test-AuthRejectsMissingCredential/);
    expect(code).toMatch(/x-agent-credential/);
  });

  it('generates a high-entropy service credential (not a static literal)', () => {
    expect(code).toMatch(/RandomNumberGenerator/);
    expect(code).toMatch(/New-ServiceCredential/);
  });

  it('emits a machine-readable evidence report (PrintAgentEvidence.psm1)', () => {
    expect(ps).toMatch(/Import-Module .*PrintAgentEvidence\.psm1/);
    expect(code).toMatch(/New-EvidenceReport/);
    expect(code).toMatch(/Write-EvidenceReport/);
  });

  it('provisions NO browser fallback (INV-5)', () => {
    expect(code.toLowerCase()).not.toContain('window.print');
    expect(code).not.toMatch(/Start-Process\s+.*(chrome|msedge|firefox|http)/i);
  });

  it('does NOT self-update (DEC-WIN-04 — no auto-download/side-load)', () => {
    expect(code).not.toMatch(/Invoke-WebRequest|Start-BitsTransfer|curl\s+-O/i);
  });
});

describe('PrintAgentEvidence.psm1 — evidence accumulator (WS_W9)', () => {
  const psm1 = readScript('PrintAgentEvidence.psm1');

  it('exports the evidence-building functions as a callable module', () => {
    expect(psm1).toMatch(/Export-ModuleMember/);
    for (const fn of [
      'New-EvidenceReport',
      'Add-EvidenceStep',
      'Test-EvidenceAllPass',
      'Write-EvidenceReport',
    ]) {
      expect(psm1).toContain(fn);
    }
  });

  it('reports ALL-PASS fail-closed (overall pass requires every step to pass)', () => {
    const code = stripPsComments(psm1);
    // Test-EvidenceAllPass returns false on the first non-passing step.
    expect(code).toMatch(/if\s*\(-not \$s\.pass\)\s*\{\s*return \$false/);
  });

  it('writes both JSON (machine) and Markdown (human) reports under a parameterized base name', () => {
    expect(psm1).toMatch(/ConvertTo-Json/);
    expect(psm1).toMatch(/"\$BaseName\.json"/);
    expect(psm1).toMatch(/"\$BaseName\.md"/);
    // Default base name is the provisioning report; the Gate E2 command overrides it.
    expect(psm1).toMatch(/\$BaseName\s*=\s*'provisioning-evidence-report'/);
  });
});
