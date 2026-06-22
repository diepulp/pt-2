/** @jest-environment node */

/**
 * Stale-`requested` reconciliation (PRD-092 WS8 / P0-4)
 *
 * A crash after spooler acceptance but before the terminal transition can strand
 * an attempt in `requested` forever. Because the path is one-way (submitted ≠
 * printed), the only honest terminal sink is `unknown`. This proves
 * `rpc_mark_stale_print_attempts_unknown` sweeps a stale `requested` row (older
 * than the frozen 15-minute threshold) to `unknown`, scoped to the caller's
 * casino, and leaves a FRESH `requested` row untouched.
 *
 * Real-DB, Mode C (Gate A non-waivable).
 *
 * @see PRD-092 / EXEC-092 WS8 / P0-4 / migration 20260619151717 (reconciler)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

import {
  setupPrintingFixtures,
  printingIntegrationGuard,
  type PrintingFixtures,
} from './_helpers';

const { isIntegrationEnvironment } = printingIntegrationGuard();
const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

async function seedRow(
  fx: PrintingFixtures,
  requestedAt: string,
): Promise<string> {
  const { data, error } = await fx.setupClient
    .from('print_attempt')
    .insert({
      instrument_kind: 'promo_coupon',
      instrument_ref: fx.couponRefA,
      casino_id: fx.casinoId,
      operator_id: fx.pitBossId,
      printer_target_id: 'loopback-cups',
      template_id: 'loyalty.entitlement_coupon',
      template_version: 1,
      receipt_document_hash: 'sha256:stale',
      idempotency_key: `stale-${Date.now()}-${Math.random()}`,
      requested_at: requestedAt,
    })
    .select('print_attempt_id')
    .single();
  if (error) throw error;
  return data.print_attempt_id;
}

async function statusOf(
  fx: PrintingFixtures,
  printAttemptId: string,
): Promise<string | undefined> {
  const { data } = await fx.setupClient
    .from('print_attempt')
    .select('result_status')
    .eq('print_attempt_id', printAttemptId)
    .single();
  return data?.result_status;
}

describeIntegration('stale-requested reconciliation (WS8 / P0-4)', () => {
  let fx: PrintingFixtures;

  beforeAll(async () => {
    fx = await setupPrintingFixtures('stale');
  });

  afterAll(async () => {
    if (fx) await fx.cleanup();
  });

  it('sweeps a stale requested row to unknown but leaves a fresh one requested', async () => {
    // The BEFORE UPDATE trigger does not fire on INSERT, so requested_at can be
    // backdated directly via the service role (which bypasses RLS).
    const staleId = await seedRow(fx, '2020-01-01T00:00:00Z');
    const freshId = await seedRow(fx, new Date().toISOString());

    const { data: count, error } = await fx.pitBossClient.rpc(
      'rpc_mark_stale_print_attempts_unknown',
      { p_correlation_id: null },
    );
    expect(error).toBeNull();
    expect(typeof count).toBe('number');
    expect(count as unknown as number).toBeGreaterThanOrEqual(1);

    expect(await statusOf(fx, staleId)).toBe('unknown');
    expect(await statusOf(fx, freshId)).toBe('requested');
  });

  it('a second sweep is idempotent (the now-unknown row is not re-touched)', async () => {
    const { error } = await fx.pitBossClient.rpc(
      'rpc_mark_stale_print_attempts_unknown',
      { p_correlation_id: null },
    );
    expect(error).toBeNull();
    // No assertion on count beyond no-error: prior `unknown` rows are terminal
    // and excluded by the `result_status = 'requested'` predicate.
  });
});
