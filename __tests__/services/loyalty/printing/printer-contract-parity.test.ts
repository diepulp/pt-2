/** @jest-environment node */

/**
 * Printer contract-parity suite (PRD-092 WS8 / GATE-PLATFORM-1 + GATE-PLATFORM-2)
 *
 * ONE suite that drives BOTH realizations of `LoyaltyInstrumentPrinter`
 * (the production `cups` adapter over an in-process loopback agent, and the
 * deterministic `fake` adapter) through every outcome and asserts they return
 * IDENTICAL canonical vocabulary (GATE-PLATFORM-2). It runs with NO physical
 * printer and NO real agent process (GATE-PLATFORM-1) — pure in-process.
 *
 * Vocabulary invariants proven here:
 *   - accepted / completed       → `submitted`     (AC1 collapse; submitted ≠ printed)
 *   - spooler rejected           → `failed` / transport_submission / spooler_rejected
 *   - agent unreachable (pre)    → `failed` / transport_submission / agent_unreachable
 *   - malformed reply (post)     → `unknown` / transport_submission / malformed_agent_response
 *   - non-canonical renderer     → `failed` / render_validation (never reaches transport)
 *   - failure_domain is NEVER `device` on any path (§7a hard deferral).
 *
 * This is a UNIT suite (no DB) — it lives under the unit `test-pass` lane.
 *
 * @see PRD-092 / EXEC-092 WS8 / ADR-062 D3 / DEC-006 / PRD-TERMINOLOGY-7a
 */

import { describe, it, expect } from '@jest/globals';

import { createCupsAdapter } from '@/services/loyalty/printing/adapters/cups-adapter';
import { createFakeAdapter } from '@/services/loyalty/printing/adapters/fake-adapter';
import { createWindowsAdapter } from '@/services/loyalty/printing/adapters/windows-adapter';
import type {
  LoyaltyInstrumentPrinter,
  PrintOutcome,
} from '@/services/loyalty/printing/contract';
import { createCupsRenderer } from '@/services/loyalty/printing/renderers/cups-renderer';
import { createHtmlPreviewRenderer } from '@/services/loyalty/printing/renderers/html-preview-renderer';
import { buildReceiptDocument } from '@/services/loyalty/printing/templates/build-receipt';
import type { ReceiptDocument } from '@/services/loyalty/printing/templates/receipt-document';

import { makeInProcessAgentClient, makeTransportErrorClient } from './_helpers';

const PRINTER = 'loopback-cups';

/** A canonical document built from a representative entitlement payload (pure). */
const DOCUMENT: ReceiptDocument = buildReceiptDocument({
  family: 'entitlement',
  coupon_id: '11111111-1111-4111-8111-111111111111',
  validation_number: 'PARITY-001',
  reward_id: 'r1',
  reward_code: 'MATCH25',
  reward_name: 'Match Play $25',
  face_value_cents: 2500,
  required_match_wager_cents: 2500,
  expires_at: '2026-12-31T23:59:59Z',
  player_name: 'Parity Player',
  player_id: 'p1',
  player_tier: 'gold',
  casino_name: 'Parity Casino',
  staff_name: 'Parity Boss',
  issued_at: '2026-06-21T12:00:00Z',
});

function print(
  adapter: LoyaltyInstrumentPrinter<ReceiptDocument>,
): Promise<PrintOutcome> {
  return adapter.print({ printerTargetId: PRINTER, document: DOCUMENT });
}

describe('printer contract parity — cups ⇔ fake (WS8 / GATE-PLATFORM-2)', () => {
  it('accepted spooler outcome → both adapters return submitted', async () => {
    const cups = createCupsAdapter({
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      renderer: createCupsRenderer(),
    });
    const fake = createFakeAdapter({ spoolerOutcome: 'accepted' });

    const cupsOut = await print(cups);
    const fakeOut = await print(fake);

    expect(cupsOut).toEqual({ status: 'submitted' });
    expect(fakeOut).toEqual(cupsOut);
  });

  it('completed spooler outcome → both collapse to submitted (AC1, never stronger)', async () => {
    const cups = createCupsAdapter({
      client: makeInProcessAgentClient({ outcome: 'completed' }).client,
      renderer: createCupsRenderer(),
    });
    const fake = createFakeAdapter({ spoolerOutcome: 'completed' });

    const cupsOut = await print(cups);
    const fakeOut = await print(fake);

    expect(cupsOut.status).toBe('submitted');
    // `completed` must NEVER be promoted to a printed/acknowledged state.
    expect(cupsOut.status).not.toMatch(/printed|acknowledged|completed/);
    expect(fakeOut).toEqual(cupsOut);
  });

  it('spooler rejected → both fail with transport_submission/spooler_rejected', async () => {
    const cups = createCupsAdapter({
      client: makeInProcessAgentClient({
        rejectAll: true,
        rejectReason: 'no media',
      }).client,
      renderer: createCupsRenderer(),
    });
    const fake = createFakeAdapter({
      spoolerOutcome: 'rejected',
      rejectionReason: 'no media',
    });

    const cupsOut = await print(cups);
    const fakeOut = await print(fake);

    expect(cupsOut.status).toBe('failed');
    expect(cupsOut.failure?.domain).toBe('transport_submission');
    expect(cupsOut.failure?.code).toBe('spooler_rejected');
    expect(fakeOut.status).toBe(cupsOut.status);
    expect(fakeOut.failure?.domain).toBe(cupsOut.failure?.domain);
    expect(fakeOut.failure?.code).toBe(cupsOut.failure?.code);
  });

  it('agent unreachable (pre-submission) → both fail with transport_submission/agent_unreachable', async () => {
    const cups = createCupsAdapter({
      client: makeTransportErrorClient('agent_unreachable').client,
      renderer: createCupsRenderer(),
    });
    const fake = createFakeAdapter({ transportError: 'agent_unreachable' });

    const cupsOut = await print(cups);
    const fakeOut = await print(fake);

    expect(cupsOut.status).toBe('failed');
    expect(cupsOut.failure).toMatchObject({
      domain: 'transport_submission',
      code: 'agent_unreachable',
    });
    expect(fakeOut.status).toBe('failed');
    expect(fakeOut.failure?.domain).toBe('transport_submission');
    expect(fakeOut.failure?.code).toBe('agent_unreachable');
  });

  it('malformed reply (post-submission) → both return unknown (MAY have printed), not failed', async () => {
    const cups = createCupsAdapter({
      client: makeTransportErrorClient('malformed_agent_response').client,
      renderer: createCupsRenderer(),
    });
    const fake = createFakeAdapter({
      transportError: 'malformed_agent_response',
    });

    const cupsOut = await print(cups);
    const fakeOut = await print(fake);

    expect(cupsOut.status).toBe('unknown');
    expect(cupsOut.failure).toMatchObject({
      domain: 'transport_submission',
      code: 'malformed_agent_response',
    });
    expect(fakeOut.status).toBe('unknown');
    expect(fakeOut.failure?.domain).toBe('transport_submission');
    expect(fakeOut.failure?.code).toBe('malformed_agent_response');
  });

  it('non-canonical renderer → both fail render_validation BEFORE any transport call', async () => {
    const { client, submitJobSpy } = makeInProcessAgentClient({
      outcome: 'accepted',
    });
    const cups = createCupsAdapter({
      client,
      renderer: createHtmlPreviewRenderer(), // canonical === false
    });
    const fake = createFakeAdapter({ renderer: createHtmlPreviewRenderer() });

    const cupsOut = await print(cups);
    const fakeOut = await print(fake);

    expect(cupsOut.status).toBe('failed');
    expect(cupsOut.failure?.domain).toBe('render_validation');
    expect(fakeOut.status).toBe('failed');
    expect(fakeOut.failure?.domain).toBe('render_validation');
    // A non-canonical payload must NEVER reach the agent / spooler.
    expect(submitJobSpy).not.toHaveBeenCalled();
  });

  it('§7a: failure_domain is never "device" across every outcome', async () => {
    const outcomes: PrintOutcome[] = await Promise.all([
      print(createFakeAdapter({ spoolerOutcome: 'accepted' })),
      print(createFakeAdapter({ spoolerOutcome: 'completed' })),
      print(createFakeAdapter({ spoolerOutcome: 'rejected' })),
      print(createFakeAdapter({ transportError: 'agent_unreachable' })),
      print(createFakeAdapter({ transportError: 'malformed_agent_response' })),
      print(createFakeAdapter({ renderer: createHtmlPreviewRenderer() })),
    ]);

    for (const outcome of outcomes) {
      // The contract type already excludes 'device'; assert at runtime too.
      expect(outcome.failure?.domain).not.toBe('device');
      if (outcome.failure) {
        expect(['render_validation', 'transport_submission']).toContain(
          outcome.failure.domain,
        );
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WS_W8 — windows_spooler joins the SAME parity suite (GATE-PLATFORM-2).
// The Windows adapter wraps the SAME LoopbackAgentClient seam as cups and reuses
// the SHARED mappers (anti-fork), so it MUST return byte-identical canonical
// vocabulary. Each adapter gets its OWN in-process agent (the agent dedupes by
// jobKey, so a shared agent would collapse the second adapter's identical job).
// ─────────────────────────────────────────────────────────────────────────────
describe('printer contract parity — windows ⇔ cups ⇔ fake (WS_W8 / GATE-PLATFORM-2)', () => {
  it('accepted → all three return submitted', async () => {
    const cups = createCupsAdapter({
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      renderer: createCupsRenderer(),
    });
    const windows = createWindowsAdapter({
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      renderer: createCupsRenderer(),
    });
    const fake = createFakeAdapter({ spoolerOutcome: 'accepted' });

    const [c, w, f] = [
      await print(cups),
      await print(windows),
      await print(fake),
    ];
    expect(w).toEqual({ status: 'submitted' });
    expect(w).toEqual(c);
    expect(w).toEqual(f);
  });

  it('completed → all three collapse to submitted (windows never stronger, INV-2)', async () => {
    const cups = createCupsAdapter({
      client: makeInProcessAgentClient({ outcome: 'completed' }).client,
      renderer: createCupsRenderer(),
    });
    const windows = createWindowsAdapter({
      client: makeInProcessAgentClient({ outcome: 'completed' }).client,
      renderer: createCupsRenderer(),
    });
    const fake = createFakeAdapter({ spoolerOutcome: 'completed' });

    const [c, w, f] = [
      await print(cups),
      await print(windows),
      await print(fake),
    ];
    expect(w.status).toBe('submitted');
    expect(w.status).not.toMatch(/printed|acknowledged|completed/);
    expect(w).toEqual(c);
    expect(w).toEqual(f);
  });

  it('spooler rejected → all three fail with transport_submission/spooler_rejected', async () => {
    const cups = createCupsAdapter({
      client: makeInProcessAgentClient({
        rejectAll: true,
        rejectReason: 'no media',
      }).client,
      renderer: createCupsRenderer(),
    });
    const windows = createWindowsAdapter({
      client: makeInProcessAgentClient({
        rejectAll: true,
        rejectReason: 'no media',
      }).client,
      renderer: createCupsRenderer(),
    });
    const fake = createFakeAdapter({
      spoolerOutcome: 'rejected',
      rejectionReason: 'no media',
    });

    const [c, w, f] = [
      await print(cups),
      await print(windows),
      await print(fake),
    ];
    expect(w.status).toBe('failed');
    expect(w.failure?.domain).toBe('transport_submission');
    expect(w.failure?.code).toBe('spooler_rejected');
    expect(w.status).toBe(c.status);
    expect(w.failure?.domain).toBe(c.failure?.domain);
    expect(w.failure?.code).toBe(c.failure?.code);
    expect(w.failure?.domain).toBe(f.failure?.domain);
  });

  it('agent unreachable (pre) → all three fail with transport_submission/agent_unreachable', async () => {
    const cups = createCupsAdapter({
      client: makeTransportErrorClient('agent_unreachable').client,
      renderer: createCupsRenderer(),
    });
    const windows = createWindowsAdapter({
      client: makeTransportErrorClient('agent_unreachable').client,
      renderer: createCupsRenderer(),
    });
    const fake = createFakeAdapter({ transportError: 'agent_unreachable' });

    const [c, w, f] = [
      await print(cups),
      await print(windows),
      await print(fake),
    ];
    expect(w.status).toBe('failed');
    expect(w.failure).toMatchObject({
      domain: 'transport_submission',
      code: 'agent_unreachable',
    });
    expect(w).toEqual(c);
    expect(w.failure?.code).toBe(f.failure?.code);
  });

  it('malformed reply (post) → all three return unknown (MAY have printed), not failed', async () => {
    const cups = createCupsAdapter({
      client: makeTransportErrorClient('malformed_agent_response').client,
      renderer: createCupsRenderer(),
    });
    const windows = createWindowsAdapter({
      client: makeTransportErrorClient('malformed_agent_response').client,
      renderer: createCupsRenderer(),
    });
    const fake = createFakeAdapter({
      transportError: 'malformed_agent_response',
    });

    const [c, w, f] = [
      await print(cups),
      await print(windows),
      await print(fake),
    ];
    expect(w.status).toBe('unknown');
    expect(w.failure).toMatchObject({
      domain: 'transport_submission',
      code: 'malformed_agent_response',
    });
    expect(w).toEqual(c);
    expect(w.status).toBe(f.status);
  });

  it('non-canonical renderer → windows fails render_validation BEFORE any transport call', async () => {
    const { client, submitJobSpy } = makeInProcessAgentClient({
      outcome: 'accepted',
    });
    const windows = createWindowsAdapter({
      client,
      renderer: createHtmlPreviewRenderer(), // canonical === false
    });
    const cups = createCupsAdapter({
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      renderer: createHtmlPreviewRenderer(),
    });

    const [w, c] = [await print(windows), await print(cups)];
    expect(w.status).toBe('failed');
    expect(w.failure?.domain).toBe('render_validation');
    expect(w.failure?.domain).toBe(c.failure?.domain);
    // A non-canonical payload must NEVER reach the agent on the windows path.
    expect(submitJobSpy).not.toHaveBeenCalled();
  });

  it('§7a: windows failure_domain is never "device" across every outcome', async () => {
    const windowsOutcomes: PrintOutcome[] = await Promise.all([
      print(
        createWindowsAdapter({
          client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
          renderer: createCupsRenderer(),
        }),
      ),
      print(
        createWindowsAdapter({
          client: makeInProcessAgentClient({ outcome: 'completed' }).client,
          renderer: createCupsRenderer(),
        }),
      ),
      print(
        createWindowsAdapter({
          client: makeInProcessAgentClient({ rejectAll: true }).client,
          renderer: createCupsRenderer(),
        }),
      ),
      print(
        createWindowsAdapter({
          client: makeTransportErrorClient('agent_unreachable').client,
          renderer: createCupsRenderer(),
        }),
      ),
      print(
        createWindowsAdapter({
          client: makeTransportErrorClient('malformed_agent_response').client,
          renderer: createCupsRenderer(),
        }),
      ),
      print(
        createWindowsAdapter({
          client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
          renderer: createHtmlPreviewRenderer(),
        }),
      ),
    ]);

    for (const outcome of windowsOutcomes) {
      expect(outcome.failure?.domain).not.toBe('device');
      if (outcome.failure) {
        expect(['render_validation', 'transport_submission']).toContain(
          outcome.failure.domain,
        );
      }
    }
  });
});
