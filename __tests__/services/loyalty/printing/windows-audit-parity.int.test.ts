/** @jest-environment node */

/**
 * WS_W8 — Windows audit-contract parity + GATE-DOM-1 + GATE-DUP-1 (PRD-093)
 *
 * Proves, on a REAL DB, that the Windows path produces a `print_attempt` audit row
 * that is CONTRACT-IDENTICAL to the Linux/CUPS exemplar per the §5.4 definition
 * (schema / vocabulary / behavior — NOT byte-identical):
 *
 *   - The controlled path persists an audit row whose terminal vocabulary is a pure
 *     projection of the adapter's `PrintOutcome` (http.ts: status + failure
 *     domain/code). The Windows adapter returns BYTE-IDENTICAL outcomes to cups (it
 *     reuses the shared mappers, anti-fork), so the row the Windows path WOULD write
 *     is identical. We bind the Windows adapter's outcome to the actually-persisted
 *     cups row for both the `submitted` and `failed` terminal shapes.
 *   - GATE-DOM-1: the controlled path mutates ONLY `print_attempt` — never
 *     `promo_coupon` / `promo_program` / `loyalty_ledger` (instrument counts stable).
 *   - GATE-DUP-1: on the Windows adapter the agent `jobKey` dedupe collapses a repeat
 *     of the same instrument document to ONE physical spool (adapter-fires-once at the
 *     real physical boundary).
 *
 * The Windows adapter is exercised over the SAME in-process loopback agent seam as
 * cups (the platform difference is the agent's spooler, WS_W2 — not the adapter).
 * Real-DB, Mode C (Gate A non-waivable — no Supabase client-constructor mock).
 *
 * @see PRD-093 / EXEC-093 WS_W8 / §5.4 audit contract / GATE-DOM-1 / GATE-DUP-1
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

import { createWindowsAdapter } from '@/services/loyalty/printing/adapters/windows-adapter';
import { createInstrumentPrintingHttp } from '@/services/loyalty/printing/http';
import { createCupsRenderer } from '@/services/loyalty/printing/renderers/cups-renderer';
import { buildReceiptDocument } from '@/services/loyalty/printing/templates/build-receipt';

import {
  setupPrintingFixtures,
  entitlementPayload,
  makeInProcessAgentClient,
  printingIntegrationGuard,
  type PrintingFixtures,
} from './_helpers';

const { isIntegrationEnvironment } = printingIntegrationGuard();
const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

const PRINTER = 'loopback-windows';

async function instrumentCounts(fx: PrintingFixtures): Promise<{
  coupons: number;
  programs: number;
  ledger: number;
}> {
  const coupon = await fx.setupClient
    .from('promo_coupon')
    .select('*', { count: 'exact', head: true })
    .eq('casino_id', fx.casinoId);
  const program = await fx.setupClient
    .from('promo_program')
    .select('*', { count: 'exact', head: true })
    .eq('casino_id', fx.casinoId);
  const ledger = await fx.setupClient
    .from('loyalty_ledger')
    .select('*', { count: 'exact', head: true })
    .eq('casino_id', fx.casinoId);
  return {
    coupons: coupon.count ?? -1,
    programs: program.count ?? -1,
    ledger: ledger.count ?? -1,
  };
}

describeIntegration('WS_W8 Windows audit-contract parity (PRD-093)', () => {
  let fx: PrintingFixtures;

  beforeAll(async () => {
    fx = await setupPrintingFixtures('win-audit');
  });

  afterAll(async () => {
    if (fx) await fx.cleanup();
  });

  it('submitted: Windows outcome equals the persisted cups audit row + GATE-DOM-1 (only print_attempt written)', async () => {
    const before = await instrumentCounts(fx);

    // Controlled path (cups) persists the canonical `submitted` audit row.
    const cupsAgent = makeInProcessAgentClient({ outcome: 'accepted' });
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: cupsAgent.client,
      printerTargetId: PRINTER,
    });
    const persisted = await http.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'win-audit-submitted',
    });
    expect(persisted.outcome.status).toBe('submitted');
    expect(persisted.outcome.failure).toBeNull();

    // The raw row carries the §5.4 schema (result_status + null failure columns).
    const { data: row } = await fx.setupClient
      .from('print_attempt')
      .select(
        'result_status, failure_domain, failure_code, idempotency_key, instrument_kind',
      )
      .eq('print_attempt_id', persisted.attempt.printAttemptId)
      .single();
    expect(row?.result_status).toBe('submitted');
    expect(row?.failure_domain).toBeNull();
    expect(row?.failure_code).toBeNull();

    // The Windows adapter (same agent seam) yields a byte-identical outcome → the
    // row the Windows path WOULD persist is contract-identical.
    const windows = createWindowsAdapter({
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      renderer: createCupsRenderer(),
    });
    const windowsOutcome = await windows.print({
      printerTargetId: PRINTER,
      document: buildReceiptDocument(entitlementPayload(fx)),
    });
    expect(windowsOutcome).toEqual({ status: 'submitted' });
    expect(windowsOutcome.status).toBe(row?.result_status);

    // GATE-DOM-1: no instrument tables mutated by the controlled print.
    const after = await instrumentCounts(fx);
    expect(after).toEqual(before);
  });

  it('failed: Windows outcome maps to the SAME terminal vocabulary as the persisted cups row', async () => {
    // Controlled path (cups) with a spooler rejection → failed/transport_submission.
    const cupsAgent = makeInProcessAgentClient({
      rejectAll: true,
      rejectReason: 'no media',
    });
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: cupsAgent.client,
      printerTargetId: PRINTER,
    });
    const persisted = await http.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'win-audit-failed',
    });
    expect(persisted.outcome.status).toBe('failed');
    expect(persisted.outcome.failure).toMatchObject({
      domain: 'transport_submission',
      code: 'spooler_rejected',
    });

    const { data: row } = await fx.setupClient
      .from('print_attempt')
      .select('result_status, failure_domain, failure_code')
      .eq('print_attempt_id', persisted.attempt.printAttemptId)
      .single();
    // §7a: failure_domain is transport_submission, never device.
    expect(row?.failure_domain).toBe('transport_submission');
    expect(row?.failure_domain).not.toBe('device');

    // Windows adapter over the same rejected agent → identical terminal vocabulary.
    const windows = createWindowsAdapter({
      client: makeInProcessAgentClient({
        rejectAll: true,
        rejectReason: 'no media',
      }).client,
      renderer: createCupsRenderer(),
    });
    const windowsOutcome = await windows.print({
      printerTargetId: PRINTER,
      document: buildReceiptDocument(entitlementPayload(fx)),
    });
    expect(windowsOutcome.status).toBe(row?.result_status);
    expect(windowsOutcome.failure?.domain).toBe(row?.failure_domain);
    expect(windowsOutcome.failure?.code).toBe(row?.failure_code);
  });

  it('GATE-DUP-1: the Windows path spools the same instrument document EXACTLY ONCE (jobKey dedupe)', async () => {
    const agent = makeInProcessAgentClient({ outcome: 'accepted' });
    const windows = createWindowsAdapter({
      client: agent.client,
      renderer: createCupsRenderer(),
    });
    const document = buildReceiptDocument(entitlementPayload(fx));

    const first = await windows.print({ printerTargetId: PRINTER, document });
    const repeat = await windows.print({ printerTargetId: PRINTER, document });

    expect(first).toEqual({ status: 'submitted' });
    expect(repeat).toEqual({ status: 'submitted' });
    // Same instrument document → same jobKey → the agent dedupe collapses to ONE
    // physical spool (the real physical-once boundary on the Windows path).
    expect(agent.spoolerSpy).toHaveBeenCalledTimes(1);
  });
});
