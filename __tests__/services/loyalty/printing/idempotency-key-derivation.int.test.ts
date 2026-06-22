/** @jest-environment node */

/**
 * Idempotency-key derivation (PRD-092 WS8 / DEC-005)
 *
 * The idempotency key is SERVER-derived — the client never mints it. This proves
 * the exact derivation the controlled action persists:
 *   - first_print:  hash(instrument_kind, instrument_ref, intent='first_print')
 *     → two first_prints of the same instrument COLLAPSE onto one key / one row.
 *   - reprint:      hash(instrument_kind, instrument_ref, intent='reprint', nonce)
 *     → a nonce-bearing reprint FORKS a distinct key / distinct row.
 *
 * Real-DB, Mode C (Gate A non-waivable).
 *
 * @see PRD-092 / EXEC-092 WS8 / DEC-005 / lib/idempotency.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

import { hashIdempotencyKey } from '@/lib/idempotency';
import { createInstrumentPrintingHttp } from '@/services/loyalty/printing/http';

import {
  setupPrintingFixtures,
  entitlementPayload,
  makeInProcessAgentClient,
  printingIntegrationGuard,
  type PrintingFixtures,
} from './_helpers';

const { isIntegrationEnvironment } = printingIntegrationGuard();
const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

const PRINTER = 'loopback-cups';

describeIntegration('idempotency-key derivation (WS8 / DEC-005)', () => {
  let fx: PrintingFixtures;

  beforeAll(async () => {
    fx = await setupPrintingFixtures('idem');
  });

  afterAll(async () => {
    if (fx) await fx.cleanup();
  });

  it('first_print key = hash(kind, ref, intent=first_print) and collapses retries', async () => {
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      printerTargetId: PRINTER,
    });

    const expectedKey = hashIdempotencyKey({
      kind: 'promo_coupon',
      ref: fx.couponRefA,
      intent: 'first_print',
    });

    const first = await http.print({ payload: entitlementPayload(fx) });
    expect(first.attempt.idempotencyKey).toBe(expectedKey);

    // A second first_print of the same instrument derives the SAME key → same row.
    const retry = await http.print({ payload: entitlementPayload(fx) });
    expect(retry.attempt.idempotencyKey).toBe(expectedKey);
    expect(retry.attempt.printAttemptId).toBe(first.attempt.printAttemptId);
  });

  it('reprint key = hash(kind, ref, intent=reprint, nonce) and forks a new row', async () => {
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      printerTargetId: PRINTER,
    });

    const nonce = 'derivation-nonce-001';
    const expectedReprintKey = hashIdempotencyKey({
      kind: 'promo_coupon',
      ref: fx.couponRefA,
      intent: 'reprint',
      nonce,
    });

    const firstPrint = await http.print({ payload: entitlementPayload(fx) });
    const reprint = await http.print({
      payload: entitlementPayload(fx),
      reprintNonce: nonce,
    });

    expect(reprint.attempt.idempotencyKey).toBe(expectedReprintKey);
    expect(reprint.attempt.idempotencyKey).not.toBe(
      firstPrint.attempt.idempotencyKey,
    );
    expect(reprint.attempt.printAttemptId).not.toBe(
      firstPrint.attempt.printAttemptId,
    );
  });

  it('distinct reprint nonces derive distinct keys (each forks its own instance)', async () => {
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      printerTargetId: PRINTER,
    });

    const r1 = await http.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'nonce-A',
    });
    const r2 = await http.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'nonce-B',
    });

    expect(r1.attempt.idempotencyKey).not.toBe(r2.attempt.idempotencyKey);
    expect(r1.attempt.printAttemptId).not.toBe(r2.attempt.printAttemptId);
  });
});
