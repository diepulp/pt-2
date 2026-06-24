/**
 * WindowsSpooler — the agent's downstream RAW-winspool seam (PRD-093 WS_W2)
 *
 * The Windows realization of the SAME injectable spooler port the exemplar uses
 * for CUPS (`CupsSpooler` in `loopback-agent.ts`). It is structurally identical —
 * `submit(input): Promise<SpoolerSubmitResult>` — and REUSES the inherited,
 * OS-neutral submit input/result types so the agent's idempotency, truthful-
 * failure (D6), and outcome-mapping behavior are byte-identical across platforms.
 *
 * The agent (WS_W3) injects ONE spooler per deployment: `createSimulatedCupsSpooler`
 * / `createEscPosCommandSpooler` on Linux/dev, `createSimulatedWindowsSpooler` /
 * `createWindowsCommandSpooler` on the Windows production host. Nothing winspool-
 * specific escapes this seam — Win32/native machinery is confined to
 * `windows-spooler-native.ts` and the `native/` helper (GATE-PLATFORM-1).
 *
 * @see PRD-093 / EXEC-093 WS_W2
 * @see services/loyalty/printing/agent/loopback-agent.ts (the CupsSpooler seam this mirrors)
 */

import type {
  CupsSubmitInput,
  CupsSubmitResult,
} from './loopback-agent';

/**
 * Spooler submit input — the OS-neutral job the agent hands to any spooler
 * (resolved queue + content type + serialized body). Aliased from the inherited
 * seam so the Windows and CUPS spoolers share ONE input shape.
 */
export type SpoolerSubmitInput = CupsSubmitInput;

/**
 * Spooler submit result — `accepted` | `completed` | `rejected`, the inherited
 * OS-neutral spooler vocabulary (NOT a stronger lifecycle state; the adapter
 * collapses `accepted`/`completed` to `submitted`). Aliased from the inherited seam.
 */
export type SpoolerSubmitResult = CupsSubmitResult;

/**
 * The Windows downstream spooler port. Structurally identical to `CupsSpooler`;
 * a deployment injects either the simulated impl (CI) or the native impl (real host).
 */
export interface WindowsSpooler {
  submit(input: SpoolerSubmitInput): Promise<SpoolerSubmitResult>;
}
