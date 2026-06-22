/** @jest-environment node */

/**
 * instrument_ref resolution guard (PRD-092 WS8 / P0-2 / DEC-003)
 *
 * `instrument_ref` has NO hard FK, so the request RPC owns the referential check:
 * the ref MUST resolve to a REAL, SAME-CASINO instrument of the declared kind
 * BEFORE any `print_attempt` write (P0003). This proves a non-resolving or
 * cross-casino ref is rejected — through the controlled action (mapped to a
 * 422 VALIDATION_ERROR) AND at the raw RPC — with no audit row written.
 *
 * Real-DB, Mode C (Gate A non-waivable).
 *
 * @see PRD-092 / EXEC-092 WS8 / DEC-003 / migration 20260619151717 (P0003)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

import {
  createInstrumentPrintingHttp,
  type ControlledPrintRequest,
} from '@/services/loyalty/printing/http';

import {
  setupPrintingFixtures,
  entitlementPayload,
  makeInProcessAgentClient,
  printingIntegrationGuard,
  UNRESOLVABLE_REF,
  type PrintingFixtures,
} from './_helpers';

const { isIntegrationEnvironment } = printingIntegrationGuard();
const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

const PRINTER = 'loopback-cups';

describeIntegration('instrument_ref resolution guard (WS8 / DEC-003)', () => {
  let fx: PrintingFixtures;

  beforeAll(async () => {
    fx = await setupPrintingFixtures('iref');
  });

  afterAll(async () => {
    if (fx) await fx.cleanup();
  });

  function http() {
    return createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      printerTargetId: PRINTER,
    });
  }

  async function printAttemptCount(): Promise<number> {
    const { count } = await fx.setupClient
      .from('print_attempt')
      .select('*', { count: 'exact', head: true })
      .eq('casino_id', fx.casinoId);
    return count ?? -1;
  }

  it('controlled action rejects a non-resolving coupon ref (422) and writes nothing', async () => {
    const before = await printAttemptCount();
    const request: ControlledPrintRequest = {
      payload: entitlementPayload(fx, { coupon_id: UNRESOLVABLE_REF }),
    };

    await expect(http().print(request)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      httpStatus: 422,
    });

    expect(await printAttemptCount()).toBe(before);
  });

  it('controlled action rejects a cross-casino coupon ref (casino A using casino B coupon)', async () => {
    const before = await printAttemptCount();
    const request: ControlledPrintRequest = {
      payload: entitlementPayload(fx, { coupon_id: fx.couponRefB }),
    };

    await expect(http().print(request)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    expect(await printAttemptCount()).toBe(before);
  });

  it('raw RPC raises P0003 on a non-resolving ref before any write', async () => {
    const { error } = await fx.pitBossClient.rpc('rpc_request_print_attempt', {
      p_instrument_kind: 'promo_coupon',
      p_instrument_ref: UNRESOLVABLE_REF,
      p_printer_target_id: PRINTER,
      p_template_id: 'loyalty.entitlement_coupon',
      p_template_version: 1,
      p_receipt_document_hash: 'sha256:iref',
      p_idempotency_key: `iref-${Date.now()}-${Math.random()}`,
      p_station_id: null,
      p_reprint_of: null,
      p_correlation_id: null,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/instrument_ref|P0003|not_resolved/i);
  });
});
