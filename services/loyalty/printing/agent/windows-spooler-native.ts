/**
 * Native WindowsSpooler — RAW winspool via the bundled helper exe (PRD-093 WS_W2)
 *
 * The production Windows spooler. Mirrors `createEscPosCommandSpooler` (which pipes
 * the ESC/POS byte buffer to `lp`), but per DEC-WIN-01 it spawns the bundled,
 * code-signed native helper `winspool-print-helper.exe` (see `./native/`). The
 * helper performs the Win32 RAW sequence
 * (`OpenPrinter → StartDocPrinter pDatatype="RAW" → WritePrinter → ...`); this TS
 * facade assembles the identical ESC/POS bytes and owns the trusted-path,
 * framing, timeout, and error-mapping rules. Win32 codes / queue / driver names
 * stay agent-local (the helper writes them to stderr only, INV-4) and NEVER enter
 * the canonical result vocabulary.
 *
 * DEC-WIN-01 rules realized here:
 *  - Trusted path: helper is spawned ONLY by an absolute, install-rooted path, with
 *    an explicit argv array and `shell:false` — never via PATH or a shell string.
 *  - Framing: RAW payload → helper stdin (closed = EOF); exactly one newline-
 *    terminated JSON line `{outcome, jobId?, reason?}` ← stdout; stderr = agent-local.
 *  - Timeout: a launch timeout (default 10s) maps CONSERVATIVELY — the job may have
 *    reached the spooler, so the helper is killed and a post-submission ambiguity is
 *    raised that the adapter maps to `unknown` (NEVER a fabricated success, NEVER
 *    `failed`/`rejected` which would deny a job that might have printed).
 *  - Partial/failed write and clean rejection → `rejected` (the adapter maps to
 *    `failed`); spawn failure → `rejected` (mirrors the CUPS `lp` spawn-failure path).
 *
 * @see PRD-093 / EXEC-093 WS_W2
 * @see docs/00-vision/epson/prd-093/PRD-093-WINDOWS-CERTIFICATION-DECISION-LEDGER.md (DEC-WIN-01)
 */

import { spawn } from 'child_process';
import { win32 as winPath } from 'path';

import { AgentTransportError } from './loopback-agent';
import type {
  SpoolerSubmitInput,
  SpoolerSubmitResult,
  WindowsSpooler,
} from './windows-spooler';

// ESC @ = initialize; GS V m = cut (1 = partial, 0 = full) — identical bytes to
// the CUPS ESC/POS spooler so the RAW payload is platform-invariant.
const ESC_INIT = Buffer.from([0x1b, 0x40]);
const FEED = Buffer.from('\n\n\n', 'utf8');

function cutBytes(cut: 'partial' | 'full'): Buffer {
  return Buffer.from([0x1d, 0x56, cut === 'full' ? 0x00 : 0x01]);
}

/**
 * Assemble the RAW ESC/POS byte buffer from the rendered body. Pure + exported so
 * CI can assert byte correctness without a Windows runner. Drops the renderer's
 * pure-text cut hint (`-- cut (...) --`) because we emit a real `GS V` cut —
 * matching `createEscPosCommandSpooler` exactly.
 */
export function toEscPosBuffer(
  body: string,
  cut: 'partial' | 'full' = 'partial',
): Buffer {
  const text = body
    .split('\n')
    .filter((line) => !/^-- cut \(.*\) --$/.test(line.trim()))
    .join('\n');
  return Buffer.concat([ESC_INIT, Buffer.from(text, 'utf8'), FEED, cutBytes(cut)]);
}

/** Helper stdout contract — exactly one JSON object per invocation. */
interface HelperResult {
  outcome: 'accepted' | 'completed' | 'rejected';
  jobId?: string;
  reason?: string;
}

function parseHelperResult(stdout: string): HelperResult | null {
  const line = stdout
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  if (!line) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || !('outcome' in parsed)) {
    return null;
  }
  const outcome: unknown = parsed.outcome;
  if (
    outcome !== 'accepted' &&
    outcome !== 'completed' &&
    outcome !== 'rejected'
  ) {
    return null;
  }
  const jobId = 'jobId' in parsed ? parsed.jobId : undefined;
  const reason = 'reason' in parsed ? parsed.reason : undefined;
  return {
    outcome,
    jobId: typeof jobId === 'string' ? jobId : undefined,
    reason: typeof reason === 'string' ? reason : undefined,
  };
}

export interface WindowsCommandSpoolerOptions {
  /**
   * ABSOLUTE, install-rooted path to the bundled `winspool-print-helper.exe`
   * (DEC-WIN-01 trusted path). A relative path is rejected at construction.
   */
  helperPath: string;
  /** Cut style for the trailing `GS V` (default `partial`). */
  cut?: 'partial' | 'full';
  /** Launch timeout in ms (default 10000) — on timeout the result is `unknown`. */
  timeoutMs?: number;
}

/**
 * Production Windows spooler: pipes the RAW ESC/POS payload to the bundled
 * `winspool-print-helper.exe` and maps its single JSON result to the OS-neutral
 * spooler vocabulary. Injected into the loopback agent by WS_W3 on the real host.
 */
export function createWindowsCommandSpooler(
  options: WindowsCommandSpoolerOptions,
): WindowsSpooler {
  const { helperPath } = options;
  // Validate against WINDOWS path semantics regardless of the host running this
  // check (CI may construct on Linux): `path.win32.isAbsolute` so a Windows
  // absolute path like `C:\…` is recognized, and a relative path is rejected.
  if (!winPath.isAbsolute(helperPath)) {
    // DEC-WIN-01 trusted-path: never spawn from a relative path / PATH lookup.
    throw new Error(
      `windows-spooler-native: helperPath must be absolute (DEC-WIN-01 trusted-path), got "${helperPath}"`,
    );
  }
  const cut = options.cut ?? 'partial';
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    submit(input: SpoolerSubmitInput): Promise<SpoolerSubmitResult> {
      return new Promise<SpoolerSubmitResult>((resolve, reject) => {
        // Explicit argv array, no shell — the queue name is an argument, never
        // interpolated into a command string. Payload is the byte stream only.
        const child = spawn(helperPath, ['--queue', input.queue], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        });

        let stdout = '';
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill();
          // DEC-WIN-01: conservative timeout mapping. The job may already have
          // reached the spooler, so we surface a post-submission ambiguity the
          // adapter maps to `unknown` — never a fabricated success, never `failed`.
          reject(
            new AgentTransportError(
              'malformed_agent_response',
              `winspool helper timed out after ${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);

        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8');
        });
        // stderr is agent-local diagnostics (Win32 codes, queue/driver names).
        // It is intentionally NOT surfaced into the canonical result (INV-4).
        child.stderr.on('data', () => {
          /* swallowed at this layer; the helper logs detail itself */
        });

        child.on('error', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          // Spawn/exec failure (e.g. missing helper) — mirrors the CUPS `lp`
          // spawn-failure path: a truthful `rejected` (the job never spooled).
          resolve({ outcome: 'rejected', reason: 'winspool helper spawn failed' });
        });

        child.on('close', (code: number | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const result = parseHelperResult(stdout);
          if (!result) {
            resolve({
              outcome: 'rejected',
              reason: `winspool helper returned no parseable result (exit ${code ?? 'null'})`,
            });
            return;
          }
          if (result.outcome === 'rejected') {
            resolve({
              outcome: 'rejected',
              reason:
                result.reason ?? `winspool helper rejected (exit ${code ?? 'null'})`,
            });
            return;
          }
          resolve({
            outcome: result.outcome,
            jobId: result.jobId ?? input.queue,
          });
        });

        // Frame: write the COMPLETE RAW payload, then close stdin (EOF).
        child.stdin.end(toEscPosBuffer(input.body, cut));
      });
    },
  };
}
