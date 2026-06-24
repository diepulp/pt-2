/** @jest-environment node */

/**
 * WS_W6 — Windows distinguishability matrix over the SIMULATED WindowsSpooler
 * (PRD-093 / §5.5 custody matrix)
 *
 * The Phase-1 distinguishability matrix, re-run on the Windows path WITHOUT a real
 * device, by driving the `windows_spooler` adapter over an in-process agent that
 * fronts `createSimulatedWindowsSpooler`. This is the CI half of Gate E2: it proves
 * the canonical outcome mapping the real hardware session (Gate W-C) confirms.
 *
 * §5.5 custody matrix:
 *   - first print (spooler accepts)            → `submitted`
 *   - printer offline, PRE-acceptance reject   → `failed`/transport_submission/spooler_rejected
 *   - spooler accepts custody while offline    → `submitted` (NEVER relabeled printed)
 *   - post-submission ambiguity                → `unknown`
 *   - retry / idempotent replay                → prior outcome, ONE physical spool
 *   - unknown-state is distinguishable         → operator can require a duplicate-risk ack
 *   - layout / encoding / feed / cut           → correct ESC/POS byte assembly
 *
 * @see PRD-093 / EXEC-093 WS_W6 / §5.5
 */

import { describe, it, expect } from '@jest/globals';

import { createWindowsAdapter } from '@/services/loyalty/printing/adapters/windows-adapter';
import {
  AgentTransportError,
  createInProcessAgentClient,
  createLoopbackAgent,
  type CupsSubmitInput,
  type CupsSubmitResult,
  type LoopbackAgentClient,
} from '@/services/loyalty/printing/agent/loopback-agent';
import { toEscPosBuffer } from '@/services/loyalty/printing/agent/windows-spooler-native';
import {
  createSimulatedWindowsSpooler,
  type WindowsSpooler,
} from '@/services/loyalty/printing/agent/windows-spooler-simulated';
import type {
  LoyaltyInstrumentPrinter,
  PrintOutcome,
} from '@/services/loyalty/printing/contract';
import { createCupsRenderer } from '@/services/loyalty/printing/renderers/cups-renderer';
import { buildReceiptDocument } from '@/services/loyalty/printing/templates/build-receipt';
import type { ReceiptDocument } from '@/services/loyalty/printing/templates/receipt-document';

const PRINTER = 'EPSON-TM-T88V-target';

const DOCUMENT: ReceiptDocument = buildReceiptDocument({
  family: 'entitlement',
  coupon_id: '22222222-2222-4222-8222-222222222222',
  validation_number: 'DISTINGUISH-001',
  reward_id: 'r1',
  reward_code: 'MATCH25',
  reward_name: 'Match Play $25',
  face_value_cents: 2500,
  required_match_wager_cents: 2500,
  expires_at: '2026-12-31T23:59:59Z',
  player_name: 'Distinguish Player',
  player_id: 'p1',
  player_tier: 'gold',
  casino_name: 'Distinguish Casino',
  staff_name: 'Distinguish Boss',
  issued_at: '2026-06-21T12:00:00Z',
});

/** Build a windows adapter over an in-process agent fronting the given spooler. */
function windowsAdapterOver(
  spooler: WindowsSpooler,
): LoyaltyInstrumentPrinter<ReceiptDocument> {
  const agent = createLoopbackAgent({ spooler });
  const client: LoopbackAgentClient = createInProcessAgentClient(agent);
  return createWindowsAdapter({ client, renderer: createCupsRenderer() });
}

function print(
  adapter: LoyaltyInstrumentPrinter<ReceiptDocument>,
): Promise<PrintOutcome> {
  return adapter.print({ printerTargetId: PRINTER, document: DOCUMENT });
}

describe('Windows distinguishability matrix — simulated WindowsSpooler (§5.5)', () => {
  it('case 1 — first print: spooler accepts → submitted', async () => {
    const adapter = windowsAdapterOver(
      createSimulatedWindowsSpooler({ outcome: 'accepted' }),
    );
    expect(await print(adapter)).toEqual({ status: 'submitted' });
  });

  it('case 2 — printer offline, pre-acceptance rejection → failed/transport_submission/spooler_rejected', async () => {
    const adapter = windowsAdapterOver(
      createSimulatedWindowsSpooler({
        rejectAll: true,
        rejectReason: 'printer offline',
      }),
    );
    const out = await print(adapter);
    expect(out.status).toBe('failed');
    expect(out.failure?.domain).toBe('transport_submission');
    expect(out.failure?.code).toBe('spooler_rejected');
    expect(out.failure?.domain).not.toBe('device'); // §7a
  });

  it('case 3 — spooler accepts custody while offline (completed) → submitted, NEVER relabeled printed', async () => {
    const adapter = windowsAdapterOver(
      createSimulatedWindowsSpooler({ outcome: 'completed' }),
    );
    const out = await print(adapter);
    expect(out.status).toBe('submitted');
    expect(out.status).not.toMatch(/printed|acknowledged|completed/);
  });

  it('case 4 — post-submission ambiguity → unknown (MAY have printed, never fabricated failed)', async () => {
    // Post-submission transport ambiguity surfaces as unknown on the windows path.
    const client: LoopbackAgentClient = {
      health: async () => ({ ok: true, host: '127.0.0.1' }),
      submitJob: async () => {
        throw new AgentTransportError(
          'malformed_agent_response',
          'simulated ambiguity',
        );
      },
    };
    const adapter = createWindowsAdapter({
      client,
      renderer: createCupsRenderer(),
    });
    const out = await print(adapter);
    expect(out.status).toBe('unknown');
    expect(out.failure?.domain).toBe('transport_submission');
    expect(out.failure?.domain).not.toBe('device');
  });

  it('case 5 — retry / idempotent replay → prior outcome, ONE physical spool (no duplicate)', async () => {
    let spoolCalls = 0;
    const counting: WindowsSpooler = {
      async submit(input: CupsSubmitInput): Promise<CupsSubmitResult> {
        spoolCalls += 1;
        return {
          outcome: 'accepted',
          jobId: `winsim-${input.queue}-${spoolCalls}`,
        };
      },
    };
    const adapter = windowsAdapterOver(counting);
    const first = await print(adapter);
    const replay = await print(adapter); // same document → same jobKey → dedupe
    expect(first).toEqual({ status: 'submitted' });
    expect(replay).toEqual({ status: 'submitted' });
    expect(spoolCalls).toBe(1); // physical-once
  });

  it('case 7 — unknown is DISTINGUISHABLE from submitted/failed (operator can require duplicate-risk ack)', async () => {
    const submitted = await print(
      windowsAdapterOver(
        createSimulatedWindowsSpooler({ outcome: 'accepted' }),
      ),
    );
    const failed = await print(
      windowsAdapterOver(createSimulatedWindowsSpooler({ rejectAll: true })),
    );
    // The three terminal states are mutually distinct — the surface keys its
    // unknown-state duplicate-risk acknowledgement off this distinguishability.
    expect(new Set([submitted.status, failed.status, 'unknown']).size).toBe(3);
  });

  it('case 8 — layout / encoding / feed / cut: ESC @ init … feed … GS V cut assembled correctly', () => {
    const buf = toEscPosBuffer('LINE1\nLINE2');
    expect(buf[0]).toBe(0x1b); // ESC
    expect(buf[1]).toBe(0x40); // @
    expect(buf[buf.length - 3]).toBe(0x1d); // GS
    expect(buf[buf.length - 2]).toBe(0x56); // V
    expect(buf[buf.length - 4]).toBe(0x0a); // feed before cut
  });
});
