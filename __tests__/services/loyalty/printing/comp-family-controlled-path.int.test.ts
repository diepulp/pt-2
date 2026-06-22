/** @jest-environment node */

/**
 * Comp-family controlled path (PRD-092 WS8 / DA §7 / DEC-003)
 *
 * DEC-003 exists so BOTH instrument families route through the single controlled
 * path. WS9's E2E covers the entitlement family; this proves the points_comp
 * (ledger_entry) family end-to-end at the service boundary: a comp payload
 * resolves its ledger ref, renders the comp template, submits, and persists a
 * `print_attempt` row with instrument_kind='ledger_entry'. The comp family is
 * exercised, not merely declared.
 *
 * Real-DB, Mode C (Gate A non-waivable).
 *
 * @see PRD-092 / EXEC-092 WS8 / DEC-003
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

import { createInstrumentPrintingHttp } from '@/services/loyalty/printing/http';

import {
  setupPrintingFixtures,
  compPayload,
  makeInProcessAgentClient,
  printingIntegrationGuard,
  type PrintingFixtures,
} from './_helpers';

const { isIntegrationEnvironment } = printingIntegrationGuard();
const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

const PRINTER = 'loopback-cups';

describeIntegration('comp-family controlled path (WS8 / DA §7)', () => {
  let fx: PrintingFixtures;

  beforeAll(async () => {
    fx = await setupPrintingFixtures('comp');
  });

  afterAll(async () => {
    if (fx) await fx.cleanup();
  });

  it('routes a points_comp payload through the controlled path and persists ledger_entry', async () => {
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      printerTargetId: PRINTER,
    });

    const result = await http.print({ payload: compPayload(fx) });

    expect(result.outcome.status).toBe('submitted');
    expect(result.attempt.instrumentKind).toBe('ledger_entry');
    expect(result.attempt.instrumentRef).toBe(fx.ledgerRefA);

    // Confirm the persisted row reflects the comp family + comp template.
    const { data: persisted } = await fx.setupClient
      .from('print_attempt')
      .select('instrument_kind, instrument_ref, template_id, result_status')
      .eq('print_attempt_id', result.attempt.printAttemptId)
      .single();

    expect(persisted?.instrument_kind).toBe('ledger_entry');
    expect(persisted?.instrument_ref).toBe(fx.ledgerRefA);
    expect(persisted?.template_id).toBe('loyalty.points_comp_slip');
    expect(persisted?.result_status).toBe('submitted');
  });

  it('rejects a comp payload whose ledger ref does not resolve (P0003), no write', async () => {
    const before = await fx.setupClient
      .from('print_attempt')
      .select('*', { count: 'exact', head: true })
      .eq('casino_id', fx.casinoId);

    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      printerTargetId: PRINTER,
    });

    await expect(
      http.print({
        payload: compPayload(fx, {
          ledger_id: '99999999-9999-4999-8999-999999999999',
        }),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const after = await fx.setupClient
      .from('print_attempt')
      .select('*', { count: 'exact', head: true })
      .eq('casino_id', fx.casinoId);
    expect(after.count).toBe(before.count);
  });
});
