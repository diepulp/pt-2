/** @jest-environment node */

/**
 * Build/stage command-construction assertions (PRD-093 step-1 build gap, WS_W2/W3/W4)
 *
 * pwsh is unavailable on the Linux pipeline runner, so Build-PrintAgent.ps1 is proven
 * the same pwsh-free way as the rest of the print-agent scripts: static, deterministic
 * assertions over the script text that the three build halves (msbuild native helper,
 * esbuild agent bundle, pin-verified WinSW) and the stage layout are constructed
 * correctly and fail-closed. The esbuild bundle half is ALSO executed for real here —
 * it is platform-neutral, so CI proves the agent TS bundles to loadable CJS.
 *
 * Real msbuild + the pinned WinSW remain gated on a Windows host (Gate W-A/W-B).
 *
 * @see scripts/print-agent/Build-PrintAgent.ps1
 * @see scripts/print-agent/bundle-agent.mjs
 * @see PRD-093 / EXEC-093 WS_W2/WS_W3/WS_W4
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, afterAll } from '@jest/globals';

const SCRIPT_DIR = join(__dirname, '..', '..', '..', 'scripts', 'print-agent');

function readScript(name: string): string {
  return readFileSync(join(SCRIPT_DIR, name), 'utf8');
}

/** Strip PowerShell comments so absence assertions test EXECUTABLE code only. */
function stripPsComments(source: string): string {
  return source.replace(/<#[\s\S]*?#>/g, '').replace(/#.*$/gm, '');
}

describe('Build-PrintAgent.ps1 — native helper build command (DEC-WIN-01, WS_W2)', () => {
  const build = readScript('Build-PrintAgent.ps1');

  it('constructs a deterministic msbuild Release/x64 invocation of the .vcxproj', () => {
    expect(build).toMatch(/function New-HelperBuildCommand/);
    expect(build).toMatch(/'msbuild'/);
    expect(build).toMatch(/\/p:Configuration=\$Config/);
    expect(build).toMatch(/\/p:Platform=\$Plat/);
    // Pins OutDir so the produced exe lands at a deterministic, stage-able path.
    expect(build).toMatch(/\/p:OutDir=\$OutDir/);
  });

  it('defaults the configuration/platform to the shipped Release/x64 target', () => {
    expect(build).toMatch(/\$Configuration\s*=\s*'Release'/);
    expect(build).toMatch(/\$Platform\s*=\s*'x64'/);
  });

  it('stages the produced helper at native/winspool-print-helper.exe', () => {
    expect(build).toMatch(/winspool-print-helper\.exe/);
    expect(build).toMatch(/Join-Path\s+\$Stage\s+'native'/);
  });

  it('aborts when msbuild fails or the helper exe is not produced (fail-closed)', () => {
    expect(build).toMatch(/throw\s+"msbuild failed/);
    expect(build).toMatch(/throw\s+"native helper not produced/);
  });
});

describe('Build-PrintAgent.ps1 — agent bundle command (WS_W3/WS_W4)', () => {
  const build = readScript('Build-PrintAgent.ps1');

  it('constructs the esbuild bundle invocation against bundle-agent.mjs', () => {
    expect(build).toMatch(/function New-BundleCommand/);
    expect(build).toMatch(/bundle-agent\.mjs/);
    expect(build).toMatch(/'--outdir'/);
  });

  it('verifies BOTH .js bundles are produced before continuing (fail-closed)', () => {
    expect(build).toMatch(/agent-service-entry\.js/);
    expect(build).toMatch(/verify-integrity\.js/);
    expect(build).toMatch(/throw\s+"agent bundle failed/);
    expect(build).toMatch(/throw\s+"bundle did not produce/);
  });
});

describe('Build-PrintAgent.ps1 — pinned WinSW (DEC-WIN-02)', () => {
  const build = readScript('Build-PrintAgent.ps1');

  it('verifies the WinSW binary against a PINNED SHA-256, fail-closed', () => {
    expect(build).toMatch(/function Assert-WinSwPin/);
    expect(build).toMatch(/WINSW_PINNED_SHA256/);
    expect(build).toMatch(/Get-FileHash[^\n]*-Algorithm\s+SHA256/);
    // A hash mismatch ABORTS the build.
    expect(build).toMatch(/throw\s+"WinSW pin MISMATCH/);
  });

  it('refuses to build while the pin is unconfigured (no permissive default)', () => {
    expect(build).toMatch(/\^\[0-9a-fA-F\]\{64\}\$/);
    expect(build).toMatch(/throw\s+"WinSW pin not configured/);
  });

  it('never downloads "latest" — the WinSW is operator-supplied + pinned', () => {
    // Executable code only: doc-comments legitimately name "latest"/"download" to ban them.
    const code = stripPsComments(build)
      .replace(/Set-StrictMode\s+-Version\s+Latest/gi, '')
      .toLowerCase();
    expect(code).not.toMatch(/invoke-webrequest|invoke-restmethod|curl|wget/);
    expect(code).not.toMatch(/latest/);
  });

  it('uses WinSW only — no sc.exe / nssm fork (DEC-WIN-02)', () => {
    const code = stripPsComments(build);
    expect(code).not.toMatch(/\bnssm\b/i);
    expect(code).not.toMatch(/sc\.exe\s+create/i);
  });
});

describe('Build-PrintAgent.ps1 — stage assembly (package-agent.ps1 contract)', () => {
  const build = readScript('Build-PrintAgent.ps1');

  it('stages the operator scripts/modules so the signed ZIP is self-bootstrapping', () => {
    for (const name of [
      'Provision-PrintAgent.ps1',
      'PrintAgentService.psm1',
      'PrintAgentEvidence.psm1',
      'Invoke-GateE2Certification.ps1',
      'package-agent.ps1',
      'rollback-agent.ps1',
    ]) {
      expect(build).toContain(name);
    }
  });

  it('does NOT sign or build the manifest — that is package-agent.ps1 (Gate W-B)', () => {
    const code = stripPsComments(build);
    expect(code).not.toMatch(/signtool/i);
    expect(code).not.toMatch(/Compress-Archive/i);
  });

  it('produces a clean stage and returns a structured layout descriptor', () => {
    expect(build).toMatch(/Remove-Item\s+-Path\s+\$Stage\s+-Recurse\s+-Force/);
    expect(build).toMatch(/\[pscustomobject\]/);
    expect(build).toMatch(/StageDir\s*=/);
  });
});

describe('Build-PrintAgent.ps1 — operator-supplied WinSW pin override (DEC-WIN-02)', () => {
  const build = readScript('Build-PrintAgent.ps1');

  it('accepts an audited pin via -WinSwExpectedSha256 (no script edit required)', () => {
    expect(build).toMatch(/\$WinSwExpectedSha256/);
    // The supplied pin wins; the in-script constant is the fallback.
    expect(build).toMatch(
      /if\s*\(\s*\$ExpectedSha256\s*\)\s*\{\s*\$ExpectedSha256\s*\}/,
    );
    expect(build).toMatch(/else\s*\{\s*\$script:WINSW_PINNED_SHA256\s*\}/);
  });

  it('still fail-closes: the resolved pin flows into Assert-WinSwPin', () => {
    expect(build).toMatch(
      /Assert-WinSwPin\s+-SourcePath\s+\$WinSwSource\s+-PinnedSha256\s+\$pin/,
    );
  });
});

describe('Resolve-WinSwPin.ps1 — audited WinSW acquisition (DEC-WIN-02 / DEC-WIN-04)', () => {
  const resolve = readScript('Resolve-WinSwPin.ps1');

  it('constructs the official version-pinned GitHub release asset URI', () => {
    expect(resolve).toMatch(/function New-WinSwReleaseUri/);
    expect(resolve).toMatch(
      /github\.com\/winsw\/winsw\/releases\/download\/\$ReleaseVersion\//,
    );
  });

  it('downloads + hashes (SHA-256) the acquired binary', () => {
    expect(resolve).toMatch(/Invoke-WebRequest/);
    expect(resolve).toMatch(/Get-FileHash[^\n]*-Algorithm\s+SHA256/);
  });

  it('pins by explicit version — rejects "latest" (no floating acquisition)', () => {
    expect(resolve).toMatch(/throw .*never 'latest'/i);
    const code = stripPsComments(resolve).replace(
      /Set-StrictMode\s+-Version\s+Latest/gi,
      '',
    );
    // The only executable use of "latest" is the guard that REJECTS it.
    expect(code).toMatch(/-match\s+'latest'/);
  });
});

describe('Invoke-PrintAgentRelease.ps1 — build+package orchestration (steps 1+2)', () => {
  const release = readScript('Invoke-PrintAgentRelease.ps1');

  it('chains Build-PrintAgent.ps1 then package-agent.ps1, in that order', () => {
    expect(release).toMatch(/Build-PrintAgent\.ps1/);
    expect(release).toMatch(/package-agent\.ps1/);
    const buildIdx = release.indexOf('& $buildScript');
    const pkgIdx = release.indexOf('& $packageScript');
    expect(buildIdx).toBeGreaterThanOrEqual(0);
    expect(pkgIdx).toBeGreaterThan(buildIdx);
  });

  it('threads the fail-closed WinSW pin through to the build', () => {
    expect(release).toMatch(/-WinSwSourcePath\s+\$WinSwSourcePath/);
    expect(release).toMatch(/-WinSwExpectedSha256\s+\$WinSwExpectedSha256/);
  });

  it('keeps signing a deliberate, optional step — never fabricated', () => {
    // The thumbprint is optional and merely forwarded; the script itself never signs.
    expect(release).toMatch(/\$SigningCertThumbprint/);
    const code = stripPsComments(release);
    expect(code).not.toMatch(/signtool/i);
  });
});

describe('bundle-agent.mjs — real cross-platform bundle (load-bearing Linux CI proof)', () => {
  const outdir = mkdtempSync(join(tmpdir(), 'print-agent-bundle-'));

  afterAll(() => {
    rmSync(outdir, { recursive: true, force: true });
  });

  it('bundles the two entrypoints into non-empty, loadable CJS', () => {
    execFileSync(
      'node',
      [join(SCRIPT_DIR, 'bundle-agent.mjs'), '--outdir', outdir],
      {
        encoding: 'utf8',
      },
    );

    for (const name of ['agent-service-entry.js', 'verify-integrity.js']) {
      const p = join(outdir, name);
      expect(existsSync(p)).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(0);
    }

    // Direct-execution guards (require.main === module) keep require() side-effect-free.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const agent = require(join(outdir, 'agent-service-entry.js'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const verify = require(join(outdir, 'verify-integrity.js'));
    expect(typeof agent.startAgentService).toBe('function');
    expect(typeof verify.loadAndVerifyPackage).toBe('function');
    expect(typeof verify.parseManifest).toBe('function');
  });

  it('emits CommonJS (the project is CJS — require.main entrypoints depend on it)', () => {
    const out = readFileSync(join(outdir, 'verify-integrity.js'), 'utf8');
    // CJS markers present; no ESM import/export syntax leaked into the bundle.
    expect(out).toMatch(/require\(|module\.exports|exports\./);
    expect(out).not.toMatch(/^\s*export\s+(default|const|function|\{)/m);
  });
});
