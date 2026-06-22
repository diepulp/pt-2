/** @jest-environment node */

/**
 * Controlled-write boundary (PRD-092 WS8 / P0-1 / DEC-007)
 *
 * `print_attempt` is RPC-ONLY for writes. A direct authenticated PostgREST
 * INSERT or UPDATE must be RLS-denied — the WS2 SECURITY DEFINER RPCs are the
 * only sanctioned mutation path. This closes the forge-a-submitted-row hole: a
 * client cannot fabricate a `submitted` audit row that never reached an adapter,
 * nor flip an existing row's status out from under the lifecycle trigger.
 *
 * Real-DB, Mode C (Gate A non-waivable).
 *
 * @see PRD-092 / EXEC-092 WS8 / DEC-007 / migration 20260619145557 (deny-DML RLS)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

import {
  setupPrintingFixtures,
  printingIntegrationGuard,
  type PrintingFixtures,
} from './_helpers';

const { isIntegrationEnvironment } = printingIntegrationGuard();
const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

function requestArgs(
  fx: PrintingFixtures,
  overrides: Record<string, unknown> = {},
) {
  return {
    p_instrument_kind: 'promo_coupon',
    p_instrument_ref: fx.couponRefA,
    p_printer_target_id: 'loopback-cups',
    p_template_id: 'loyalty.entitlement_coupon',
    p_template_version: 1,
    p_receipt_document_hash: 'sha256:boundary',
    p_idempotency_key: `cwb-${Date.now()}-${Math.random()}`,
    p_station_id: null,
    p_reprint_of: null,
    p_correlation_id: null,
    ...overrides,
  };
}

describeIntegration('controlled-write boundary (WS8 / DEC-007)', () => {
  let fx: PrintingFixtures;

  beforeAll(async () => {
    fx = await setupPrintingFixtures('cwb');
  });

  afterAll(async () => {
    if (fx) await fx.cleanup();
  });

  it('denies a direct authenticated INSERT into print_attempt (RLS WITH CHECK false)', async () => {
    const { error } = await fx.pitBossClient.from('print_attempt').insert({
      instrument_kind: 'promo_coupon',
      instrument_ref: fx.couponRefA,
      casino_id: fx.casinoId,
      operator_id: fx.pitBossId,
      printer_target_id: 'loopback-cups',
      template_id: 'loyalty.entitlement_coupon',
      template_version: 1,
      receipt_document_hash: 'sha256:forged',
      idempotency_key: `direct-${Date.now()}-${Math.random()}`,
      result_status: 'submitted', // fabricated success — must be blocked
    });
    expect(error).not.toBeNull();
  });

  it('denies a direct authenticated UPDATE of a print_attempt (RLS USING false)', async () => {
    // Create a legitimate `requested` row through the only sanctioned path.
    const created = await fx.pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs(fx),
    );
    expect(created.error).toBeNull();
    const row = created.data as unknown as { print_attempt_id: string };

    // A direct status flip matches 0 rows (USING false) — silently no-ops.
    await fx.pitBossClient
      .from('print_attempt')
      .update({ result_status: 'submitted' })
      .eq('print_attempt_id', row.print_attempt_id);

    const { data: still } = await fx.setupClient
      .from('print_attempt')
      .select('result_status')
      .eq('print_attempt_id', row.print_attempt_id)
      .single();
    expect(still?.result_status).toBe('requested');
  });

  it('denies a direct authenticated DELETE of a print_attempt (append-only audit)', async () => {
    const created = await fx.pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs(fx),
    );
    const row = created.data as unknown as { print_attempt_id: string };

    await fx.pitBossClient
      .from('print_attempt')
      .delete()
      .eq('print_attempt_id', row.print_attempt_id);

    const { count } = await fx.setupClient
      .from('print_attempt')
      .select('*', { count: 'exact', head: true })
      .eq('print_attempt_id', row.print_attempt_id);
    expect(count).toBe(1); // still present — DELETE was denied
  });
});
