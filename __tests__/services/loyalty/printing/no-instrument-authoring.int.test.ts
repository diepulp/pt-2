/** @jest-environment node */

/**
 * GATE-DOM-1: no-instrument-authoring invariant (PRD-092 WS8)
 *
 * The InstrumentPrinting submodule writes ONLY `print_attempt`. Across EVERY
 * terminal outcome (submitted / failed / unknown) a controlled print must add
 * rows to `print_attempt` and ZERO rows to `promo_coupon` / `promo_program` /
 * `loyalty_ledger`. This is the structural guarantee that printing can never
 * mint, mutate, or re-issue a redeemable instrument.
 *
 * Real-DB, Mode C (Gate A non-waivable).
 *
 * @see PRD-092 / EXEC-092 WS8 / PRD-GATE-DOM-1 / DEC-003 / DEC-007
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

import { createInstrumentPrintingHttp } from '@/services/loyalty/printing/http';

import {
  setupPrintingFixtures,
  entitlementPayload,
  makeInProcessAgentClient,
  makeTransportErrorClient,
  printingIntegrationGuard,
  type PrintingFixtures,
} from './_helpers';

const { isIntegrationEnvironment } = printingIntegrationGuard();
const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

const PRINTER = 'loopback-cups';

describeIntegration('GATE-DOM-1 no-instrument-authoring (WS8)', () => {
  let fx: PrintingFixtures;

  beforeAll(async () => {
    fx = await setupPrintingFixtures('domain');
  });

  afterAll(async () => {
    if (fx) await fx.cleanup();
  });

  async function instrumentCounts(): Promise<{
    coupons: number;
    programs: number;
    ledger: number;
  }> {
    const [coupons, programs, ledger] = await Promise.all([
      fx.setupClient
        .from('promo_coupon')
        .select('*', { count: 'exact', head: true })
        .eq('casino_id', fx.casinoId),
      fx.setupClient
        .from('promo_program')
        .select('*', { count: 'exact', head: true })
        .eq('casino_id', fx.casinoId),
      fx.setupClient
        .from('loyalty_ledger')
        .select('*', { count: 'exact', head: true })
        .eq('casino_id', fx.casinoId),
    ]);
    return {
      coupons: coupons.count ?? -1,
      programs: programs.count ?? -1,
      ledger: ledger.count ?? -1,
    };
  }

  async function printAttemptCount(): Promise<number> {
    const { count } = await fx.setupClient
      .from('print_attempt')
      .select('*', { count: 'exact', head: true })
      .eq('casino_id', fx.casinoId);
    return count ?? -1;
  }

  it('adds print_attempt rows but never authors an instrument across submitted/failed/unknown', async () => {
    const before = await instrumentCounts();
    const printsBefore = await printAttemptCount();

    // submitted — accepted spooler
    const submitted = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      printerTargetId: PRINTER,
    });
    const s = await submitted.print({ payload: entitlementPayload(fx) });
    expect(s.outcome.status).toBe('submitted');

    // failed — spooler rejected (distinct reprint nonce → distinct attempt)
    const failed = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeInProcessAgentClient({ rejectAll: true }).client,
      printerTargetId: PRINTER,
    });
    const f = await failed.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'dom-fail-1',
    });
    expect(f.outcome.status).toBe('failed');

    // unknown — malformed post-submission reply (distinct reprint nonce)
    const unknown = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeTransportErrorClient('malformed_agent_response').client,
      printerTargetId: PRINTER,
    });
    const u = await unknown.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'dom-unknown-1',
    });
    expect(u.outcome.status).toBe('unknown');

    const after = await instrumentCounts();
    const printsAfter = await printAttemptCount();

    // ZERO instrument authoring across all three outcomes.
    expect(after).toEqual(before);
    // print_attempt grew by exactly the three distinct attempts.
    expect(printsAfter).toBe(printsBefore + 3);
  });
});
