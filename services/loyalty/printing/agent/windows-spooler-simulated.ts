/**
 * Simulated WindowsSpooler (PRD-093 WS_W2)
 *
 * Deterministic in-memory spooler for CI + the certification distinguishability
 * harness (WS_W6) — mirrors `createSimulatedCupsSpooler`. Produces a stable
 * `jobId` from the queue + body so snapshots are reproducible, and honors a
 * configured rejection so the truthful-failure path (D6) is exercisable WITHOUT a
 * Windows runner or a real printer. It NEVER touches winspool — that is the native
 * impl's job.
 *
 * @see PRD-093 / EXEC-093 WS_W2
 */

import { createHash } from 'crypto';

import type {
  SpoolerSubmitInput,
  SpoolerSubmitResult,
  WindowsSpooler,
} from './windows-spooler';

export function createSimulatedWindowsSpooler(config?: {
  /** Outcome for accepted jobs (default `accepted`). */
  outcome?: 'accepted' | 'completed';
  /** When true, every submission is rejected (D6 truthful-failure path). */
  rejectAll?: boolean;
  /** Reason attached to a simulated rejection. */
  rejectReason?: string;
}): WindowsSpooler {
  const acceptedOutcome = config?.outcome ?? 'accepted';
  return {
    async submit(input: SpoolerSubmitInput): Promise<SpoolerSubmitResult> {
      if (config?.rejectAll) {
        return {
          outcome: 'rejected',
          reason: config.rejectReason ?? 'simulated winspool rejection',
        };
      }
      const digest = createHash('sha256')
        .update(`${input.queue}\n${input.body}`)
        .digest('hex')
        .slice(0, 12);
      return {
        outcome: acceptedOutcome,
        jobId: `winsim-${input.queue}-${digest}`,
      };
    },
  };
}
