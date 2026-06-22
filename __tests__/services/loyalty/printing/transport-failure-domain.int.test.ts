/** @jest-environment node */

/**
 * Transport-failure domain (PRD-092 WS8 / DEC-006)
 *
 * A transport fault is NOT a device fault. DEC-006 admits a `transport_submission`
 * failure domain (agent-unreachable / spooler-reject) — distinct from the §7a
 * forbidden `device` domain. This proves the persisted audit row carries
 * `transport_submission` on the FAILED transport paths, and that a post-submission
 * ambiguity surfaces as `unknown` (the job MAY have printed) rather than a false
 * `failed`. `device` is never written on any path.
 *
 * Real-DB, Mode C (Gate A non-waivable).
 *
 * @see PRD-092 / EXEC-092 WS8 / DEC-006 / PRD-TERMINOLOGY-7a
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

describeIntegration('transport-failure domain (WS8 / DEC-006)', () => {
  let fx: PrintingFixtures;

  beforeAll(async () => {
    fx = await setupPrintingFixtures('transport');
  });

  afterAll(async () => {
    if (fx) await fx.cleanup();
  });

  async function persistedRow(printAttemptId: string) {
    const { data } = await fx.setupClient
      .from('print_attempt')
      .select('result_status, failure_domain, failure_code')
      .eq('print_attempt_id', printAttemptId)
      .single();
    return data;
  }

  it('agent unreachable → failed / transport_submission / agent_unreachable (non-null domain)', async () => {
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeTransportErrorClient('agent_unreachable').client,
      printerTargetId: PRINTER,
    });

    const result = await http.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'transport-unreachable',
    });

    expect(result.outcome.status).toBe('failed');
    const row = await persistedRow(result.attempt.printAttemptId);
    expect(row?.result_status).toBe('failed');
    expect(row?.failure_domain).toBe('transport_submission');
    expect(row?.failure_code).toBe('agent_unreachable');
    expect(row?.failure_domain).not.toBe('device');
  });

  it('spooler rejected → failed / transport_submission / spooler_rejected', async () => {
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeInProcessAgentClient({
        rejectAll: true,
        rejectReason: 'no media',
      }).client,
      printerTargetId: PRINTER,
    });

    const result = await http.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'transport-rejected',
    });

    expect(result.outcome.status).toBe('failed');
    const row = await persistedRow(result.attempt.printAttemptId);
    expect(row?.failure_domain).toBe('transport_submission');
    expect(row?.failure_code).toBe('spooler_rejected');
    expect(row?.failure_domain).not.toBe('device');
  });

  it('malformed reply → unknown (MAY have printed); per schema, no failure domain persisted on a non-failed row', async () => {
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeTransportErrorClient('malformed_agent_response').client,
      printerTargetId: PRINTER,
    });

    const result = await http.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'transport-malformed',
    });

    // Truthful ambiguity: not reported as a false `failed`.
    expect(result.outcome.status).toBe('unknown');
    const row = await persistedRow(result.attempt.printAttemptId);
    expect(row?.result_status).toBe('unknown');
    // WS3 schema refine: failure_domain/code are persisted ONLY on `failed`.
    expect(row?.failure_domain).toBeNull();
    expect(row?.failure_domain).not.toBe('device');
  });
});
