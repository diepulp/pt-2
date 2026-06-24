/** @jest-environment node */

/**
 * Package integrity FAIL-CLOSED fixture tests (PRD-093 WS_W4, DEC-WIN-04, NFR-7)
 *
 * Proves the integrity verifier rejects every supply-chain failure mode BEFORE the
 * agent could be installed/started:
 *   - invalid / expired signature              → signature_invalid
 *   - tampered file (content changed post-hash) → hash_mismatch
 *   - missing file declared in the manifest     → file_missing
 *   - missing / malformed manifest              → manifest_missing / manifest_malformed
 *   - path traversal in a crafted manifest      → unsafe_path
 * and accepts ONLY a fully-valid signed package. The real cert/signature are applied
 * manually on the cert host (Gate W-B); this is the logic that makes them fail closed.
 *
 * @see PRD-093 / EXEC-093 WS_W4
 */

import { createHash } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import {
  parseManifest,
  verifyPackageIntegrity,
  loadAndVerifyPackage,
  type PackageManifest,
  type SignatureVerifier,
} from '../../../scripts/print-agent/verify-integrity';

const validSignature: SignatureVerifier = () => ({ valid: true });
const invalidSignature: SignatureVerifier = () => ({
  valid: false,
  detail: 'expired certificate',
});

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

describe('verifyPackageIntegrity — fail-closed supply-chain checks (NFR-7)', () => {
  let pkgDir: string;

  function writePkgFile(rel: string, content: string): string {
    const abs = join(pkgDir, rel);
    writeFileSync(abs, content, 'utf8');
    return sha256(content);
  }

  function buildManifest(): PackageManifest {
    const agentHash = writePkgFile('agent.js', 'console.log("agent");');
    const helperHash = writePkgFile('native-helper.exe.txt', 'PE-HELPER-BYTES');
    const winswHash = writePkgFile('winsw.exe.txt', 'PINNED-WINSW-BYTES');
    return {
      package_version: '0.93.0',
      protocol_version: 1,
      files: [
        { path: 'agent.js', sha256: agentHash },
        { path: 'native-helper.exe.txt', sha256: helperHash },
        { path: 'winsw.exe.txt', sha256: winswHash },
      ],
    };
  }

  beforeEach(() => {
    pkgDir = mkdtempSync(join(tmpdir(), 'prd093-pkg-'));
  });

  afterEach(() => {
    rmSync(pkgDir, { recursive: true, force: true });
  });

  it('accepts a fully-valid signed package (every hash matches)', () => {
    const manifest = buildManifest();
    const result = verifyPackageIntegrity({
      packageDir: pkgDir,
      manifest,
      verifySignature: validSignature,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packageVersion).toBe('0.93.0');
      expect(result.protocolVersion).toBe(1);
      expect(result.verifiedFileCount).toBe(3);
    }
  });

  it('rejects an invalid / expired signature BEFORE hashing (signature_invalid)', () => {
    const manifest = buildManifest();
    const result = verifyPackageIntegrity({
      packageDir: pkgDir,
      manifest,
      verifySignature: invalidSignature,
    });
    expect(result).toMatchObject({ ok: false, reason: 'signature_invalid' });
  });

  it('FAIL-CLOSED when no signature verifier is supplied (no permissive default)', () => {
    const manifest = buildManifest();
    const result = verifyPackageIntegrity({ packageDir: pkgDir, manifest });
    expect(result).toMatchObject({ ok: false, reason: 'signature_invalid' });
  });

  it('rejects a tampered file whose contents changed after the manifest (hash_mismatch)', () => {
    const manifest = buildManifest();
    // Tamper: overwrite a file post-manifest so its hash no longer matches.
    writeFileSync(join(pkgDir, 'agent.js'), 'console.log("TAMPERED");', 'utf8');
    const result = verifyPackageIntegrity({
      packageDir: pkgDir,
      manifest,
      verifySignature: validSignature,
    });
    expect(result).toMatchObject({ ok: false, reason: 'hash_mismatch' });
  });

  it('rejects a manifest referencing a file missing on disk (file_missing)', () => {
    const manifest = buildManifest();
    manifest.files.push({
      path: 'ghost.dll.txt',
      sha256: sha256('never-written'),
    });
    const result = verifyPackageIntegrity({
      packageDir: pkgDir,
      manifest,
      verifySignature: validSignature,
    });
    expect(result).toMatchObject({ ok: false, reason: 'file_missing' });
  });

  it('rejects a crafted manifest path that escapes the package root (unsafe_path)', () => {
    const manifest = buildManifest();
    manifest.files.push({ path: '../escape.txt', sha256: sha256('x') });
    const result = verifyPackageIntegrity({
      packageDir: pkgDir,
      manifest,
      verifySignature: validSignature,
    });
    expect(result).toMatchObject({ ok: false, reason: 'unsafe_path' });
  });
});

describe('loadAndVerifyPackage — manifest loading is fail-closed', () => {
  let pkgDir: string;

  beforeEach(() => {
    pkgDir = mkdtempSync(join(tmpdir(), 'prd093-mf-'));
  });
  afterEach(() => {
    rmSync(pkgDir, { recursive: true, force: true });
  });

  it('rejects a package with no manifest.json (manifest_missing)', () => {
    const result = loadAndVerifyPackage({
      packageDir: pkgDir,
      verifySignature: validSignature,
    });
    expect(result).toMatchObject({ ok: false, reason: 'manifest_missing' });
  });

  it('rejects a malformed manifest.json (manifest_malformed)', () => {
    writeFileSync(join(pkgDir, 'manifest.json'), '{ not json', 'utf8');
    const result = loadAndVerifyPackage({
      packageDir: pkgDir,
      verifySignature: validSignature,
    });
    expect(result).toMatchObject({ ok: false, reason: 'manifest_malformed' });
  });

  it('verifies a real on-disk manifest end-to-end', () => {
    const content = 'AGENT-BUNDLE';
    writeFileSync(join(pkgDir, 'agent.js'), content, 'utf8');
    const manifest: PackageManifest = {
      package_version: '0.93.1',
      protocol_version: 1,
      files: [{ path: 'agent.js', sha256: sha256(content) }],
    };
    writeFileSync(
      join(pkgDir, 'manifest.json'),
      JSON.stringify(manifest),
      'utf8',
    );
    const result = loadAndVerifyPackage({
      packageDir: pkgDir,
      verifySignature: validSignature,
    });
    expect(result).toMatchObject({ ok: true, packageVersion: '0.93.1' });
  });
});

describe('parseManifest — structural validation', () => {
  it('rejects a non-hex / wrong-length sha256 entry', () => {
    const raw = JSON.stringify({
      package_version: '1.0.0',
      protocol_version: 1,
      files: [{ path: 'a.js', sha256: 'not-a-real-hash' }],
    });
    expect(parseManifest(raw)).toMatchObject({
      ok: false,
      reason: 'manifest_malformed',
    });
  });

  it('rejects a non-integer protocol_version', () => {
    const raw = JSON.stringify({
      package_version: '1.0.0',
      protocol_version: 1.5,
      files: [{ path: 'a.js', sha256: 'a'.repeat(64) }],
    });
    expect(parseManifest(raw)).toMatchObject({
      ok: false,
      reason: 'manifest_malformed',
    });
  });

  it('accepts a well-formed manifest', () => {
    const raw = JSON.stringify({
      package_version: '1.0.0',
      protocol_version: 1,
      files: [{ path: 'a.js', sha256: 'a'.repeat(64) }],
    });
    expect(parseManifest(raw)).toMatchObject({ ok: true });
  });
});
