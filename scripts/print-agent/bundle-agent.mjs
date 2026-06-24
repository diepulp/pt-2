/**
 * bundle-agent.mjs — bundle the TypeScript print-agent entrypoints into the
 * self-contained CommonJS `.js` files the Windows install layout expects
 * (PRD-093 WS_W3/WS_W4, step-1 build gap).
 *
 * Produces two runnable CJS bundles in --outdir:
 *   - agent-service-entry.js  (the WinSW-hosted service: `node agent-service-entry.js`)
 *   - verify-integrity.js     (fail-closed package verifier: `node verify-integrity.js <dir>`)
 *
 * Both entrypoints guard their direct-execution path with `require.main === module`,
 * so the output MUST be CommonJS (the project is CJS — no "type":"module"). The agent
 * modules import only node builtins + same-directory relatives and the `@/` alias
 * (repo root), so the bundle is fully self-contained with zero npm dependencies.
 *
 * This step is platform-NEUTRAL and runs on the Linux CI runner — it is the
 * load-bearing proof that the agent TS actually bundles to loadable JS. The
 * Windows-only halves (msbuild of the native helper, pinned WinSW, signing) are
 * orchestrated by Build-PrintAgent.ps1 and executed on the certification host.
 *
 * Usage: node scripts/print-agent/bundle-agent.mjs --outdir <dir>
 *
 * @see scripts/print-agent/Build-PrintAgent.ps1 (orchestrator)
 * @see scripts/print-agent/package-agent.ps1 (consumes the populated StageDir)
 */

import { build } from 'esbuild';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// scripts/print-agent -> repo root (two levels up). The `@/` alias resolves here.
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

// The two direct-execution entrypoints the Windows install layout loads.
const ENTRYPOINTS = [
  join(SCRIPT_DIR, 'agent-service-entry.ts'),
  join(SCRIPT_DIR, 'verify-integrity.ts'),
];

// The `.js` filenames Provision-PrintAgent.ps1 / package-agent.ps1 reference.
const EXPECTED_OUTPUTS = ['agent-service-entry.js', 'verify-integrity.js'];

function parseOutDir(argv) {
  const i = argv.indexOf('--outdir');
  if (i === -1 || !argv[i + 1]) {
    process.stderr.write('usage: node bundle-agent.mjs --outdir <dir>\n');
    process.exit(2);
  }
  return resolve(argv[i + 1]);
}

const outdir = parseOutDir(process.argv.slice(2));

await build({
  entryPoints: ENTRYPOINTS,
  outdir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Match the project engine (node >= 24). require/__dirname/__filename stay intact.
  target: 'node24',
  // Resolve the `@/...` path alias to the repo root, mirroring tsconfig `@/*: ./*`.
  alias: { '@': REPO_ROOT },
  // platform:'node' already externalizes builtins; the agent modules pull in no
  // npm packages, so nothing else is bundled. Keep the bundle deterministic.
  logLevel: 'warning',
});

// Fail-closed: every expected output must exist and be non-empty. A silent
// partial bundle must NOT pass the build gate (mirrors the WS_W4 posture).
const missing = [];
for (const name of EXPECTED_OUTPUTS) {
  const p = join(outdir, name);
  if (!existsSync(p) || statSync(p).size === 0) {
    missing.push(name);
  }
}
if (missing.length > 0) {
  process.stderr.write(`bundle FAILED: missing/empty output(s): ${missing.join(', ')}\n`);
  process.exit(1);
}

process.stdout.write(`bundle OK: ${EXPECTED_OUTPUTS.join(', ')} -> ${outdir}\n`);
