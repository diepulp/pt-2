/**
 * Fail-closed package integrity verifier (PRD-093 WS_W4, DEC-WIN-04, NFR-7)
 *
 * Verifies a release package before the agent is installed/started:
 *   1. package signature is valid (injected verifier; signtool/Authenticode on the
 *      real Windows host), THEN
 *   2. SHA-256 of EVERY file matches the `manifest.json` entry — this is how the
 *      pinned WinSW wrapper + native helper hashes (DEC-WIN-01/02) are enforced.
 *
 * FAIL-CLOSED (NFR-7): any missing/malformed manifest, invalid/absent signature,
 * missing file, or hash mismatch → REJECT. There is exactly ONE signing system
 * (no dual-signing), and there is NO permissive default — when no signature
 * verifier is supplied the result is `signature_invalid`, never a silent pass.
 *
 * This module is the trust anchor `Provision-PrintAgent.ps1` (WS_W9) calls before
 * swapping/installing the agent, and `rollback-agent.ps1` (this WS) calls before
 * restoring a pinned previous version. The real code-signing certificate and the
 * signed binary are supplied MANUALLY on the certification host (Gate W-B) — this
 * logic is what proves they fail closed when tampered.
 *
 * @see PRD-093 / EXEC-093 WS_W4
 * @see docs/00-vision/epson/prd-093/PRD-093-WINDOWS-CERTIFICATION-DECISION-LEDGER.md (DEC-WIN-04)
 */

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join, normalize, sep } from 'path';

/** One manifest entry: a package-relative path and its expected lowercase-hex SHA-256. */
export interface ManifestFileEntry {
  /** Package-root-relative path, forward-slash separated. */
  path: string;
  /** Expected lowercase hex SHA-256 digest of the file contents. */
  sha256: string;
}

/** The package manifest shipped inside the signed ZIP (DEC-WIN-04). */
export interface PackageManifest {
  package_version: string;
  protocol_version: number;
  files: ManifestFileEntry[];
}

/** Bounded rejection reasons — fail-closed, no free-form leakage of internals. */
export type IntegrityRejectionReason =
  | 'manifest_missing'
  | 'manifest_malformed'
  | 'signature_invalid'
  | 'file_missing'
  | 'hash_mismatch'
  | 'unsafe_path';

export interface IntegrityOk {
  ok: true;
  packageVersion: string;
  protocolVersion: number;
  verifiedFileCount: number;
}

export interface IntegrityRejected {
  ok: false;
  reason: IntegrityRejectionReason;
  detail: string;
}

export type IntegrityResult = IntegrityOk | IntegrityRejected;

/** Verdict of a package-signature check (signtool / Authenticode on Windows). */
export interface SignatureVerdict {
  valid: boolean;
  detail?: string;
}

/** Injected signature verifier — the seam that lets CI fixtures drive the logic. */
export type SignatureVerifier = () => SignatureVerdict;

/** Injectable filesystem seam (defaults to node `fs`) for deterministic tests. */
export interface FileSystemPort {
  exists(path: string): boolean;
  read(path: string): Buffer;
}

const NODE_FS: FileSystemPort = {
  exists: (p) => existsSync(p),
  read: (p) => readFileSync(p),
};

/**
 * FAIL-CLOSED default verifier. Returned when NO signature verifier is supplied:
 * an unsigned/unverified package is treated as invalid, never as a pass.
 */
function failClosedSignatureVerifier(): SignatureVerdict {
  return {
    valid: false,
    detail: 'no signature verifier configured (fail-closed, NFR-7)',
  };
}

/**
 * Parse + structurally validate a manifest. A malformed manifest is a rejection,
 * not a throw — callers fail closed on the result.
 */
export function parseManifest(
  raw: string,
):
  | { ok: true; manifest: PackageManifest }
  | { ok: false; reason: 'manifest_malformed'; detail: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'manifest_malformed', detail: 'manifest is not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'manifest_malformed', detail: 'manifest is not an object' };
  }
  const m = parsed as Partial<PackageManifest>;
  if (typeof m.package_version !== 'string' || m.package_version.length === 0) {
    return { ok: false, reason: 'manifest_malformed', detail: 'package_version missing' };
  }
  if (typeof m.protocol_version !== 'number' || !Number.isInteger(m.protocol_version)) {
    return { ok: false, reason: 'manifest_malformed', detail: 'protocol_version missing/not-integer' };
  }
  if (!Array.isArray(m.files) || m.files.length === 0) {
    return { ok: false, reason: 'manifest_malformed', detail: 'files[] missing/empty' };
  }
  for (const entry of m.files) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as ManifestFileEntry).path !== 'string' ||
      typeof (entry as ManifestFileEntry).sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test((entry as ManifestFileEntry).sha256)
    ) {
      return { ok: false, reason: 'manifest_malformed', detail: 'a files[] entry is malformed' };
    }
  }
  return { ok: true, manifest: m as PackageManifest };
}

/**
 * Reject manifest paths that escape the package root (no absolute paths, no `..`
 * traversal). A crafted manifest must not be able to hash a file outside the
 * package and pass it off as verified.
 */
function isPathSafe(relPath: string): boolean {
  if (isAbsolute(relPath)) return false;
  const normalized = normalize(relPath);
  return !normalized.startsWith('..' + sep) && normalized !== '..';
}

/**
 * Verify a package against its manifest, fail-closed. Signature first (cheapest
 * decisive reject), then per-file existence + SHA-256.
 */
export function verifyPackageIntegrity(opts: {
  packageDir: string;
  manifest: PackageManifest;
  verifySignature?: SignatureVerifier;
  fs?: FileSystemPort;
}): IntegrityResult {
  const fs = opts.fs ?? NODE_FS;
  const verifySignature = opts.verifySignature ?? failClosedSignatureVerifier;

  const sig = verifySignature();
  if (!sig.valid) {
    return {
      ok: false,
      reason: 'signature_invalid',
      detail: sig.detail ?? 'package signature invalid/expired',
    };
  }

  for (const entry of opts.manifest.files) {
    if (!isPathSafe(entry.path)) {
      return { ok: false, reason: 'unsafe_path', detail: `manifest path escapes package root: ${entry.path}` };
    }
    const absPath = join(opts.packageDir, entry.path);
    if (!fs.exists(absPath)) {
      return { ok: false, reason: 'file_missing', detail: `manifest file missing on disk: ${entry.path}` };
    }
    const actual = createHash('sha256').update(fs.read(absPath)).digest('hex');
    if (actual !== entry.sha256) {
      return { ok: false, reason: 'hash_mismatch', detail: `sha256 mismatch for ${entry.path}` };
    }
  }

  return {
    ok: true,
    packageVersion: opts.manifest.package_version,
    protocolVersion: opts.manifest.protocol_version,
    verifiedFileCount: opts.manifest.files.length,
  };
}

/**
 * Load a manifest from disk and verify the package — the end-to-end fail-closed
 * entry. `manifest.json` lives at the package root.
 */
export function loadAndVerifyPackage(opts: {
  packageDir: string;
  verifySignature?: SignatureVerifier;
  fs?: FileSystemPort;
}): IntegrityResult {
  const fs = opts.fs ?? NODE_FS;
  const manifestPath = join(opts.packageDir, 'manifest.json');
  if (!fs.exists(manifestPath)) {
    return { ok: false, reason: 'manifest_missing', detail: 'manifest.json not found in package' };
  }
  const parsed = parseManifest(fs.read(manifestPath).toString('utf8'));
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, detail: parsed.detail };
  }
  return verifyPackageIntegrity({
    packageDir: opts.packageDir,
    manifest: parsed.manifest,
    verifySignature: opts.verifySignature,
    fs,
  });
}

/**
 * Real Windows signature verifier: shells to `signtool verify /pa <package>`.
 * A non-zero exit (or signtool absent) is a fail-closed INVALID verdict. Only
 * meaningful on the certification host; CI drives the injected seam instead.
 */
export function createSigntoolVerifier(packagePath: string): SignatureVerifier {
  return () => {
    const result = spawnSync('signtool', ['verify', '/pa', packagePath], {
      encoding: 'utf8',
    });
    if (result.error || result.status !== 0) {
      return {
        valid: false,
        detail: `signtool verify failed (status ${result.status ?? 'spawn-error'})`,
      };
    }
    return { valid: true };
  };
}

// Direct execution entry: `node verify-integrity.js <packageDir>` — used by
// Provision-PrintAgent.ps1. Exits non-zero on any rejection (fail-closed).
if (require.main === module) {
  const packageDir = process.argv[2];
  if (!packageDir || !isAbsolute(packageDir)) {
    process.stderr.write('usage: node verify-integrity.js <absolute-package-dir>\n');
    process.exit(2);
  }
  const result = loadAndVerifyPackage({
    packageDir,
    verifySignature: createSigntoolVerifier(packageDir),
  });
  if (result.ok) {
    process.stdout.write(
      `OK package_version=${result.packageVersion} protocol_version=${result.protocolVersion} files=${result.verifiedFileCount}\n`,
    );
    process.exit(0);
  }
  process.stderr.write(`REJECT reason=${result.reason} detail=${result.detail}\n`);
  process.exit(1);
}
