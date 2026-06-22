/** @jest-environment node */

/**
 * Render-validation fail-closed (PRD-092 WS8 / FR-6 / FR-7)
 *
 * The controlled action FAILS CLOSED before any device call: a non-canonical
 * renderer (html-preview) is rejected at the FR-7 runtime guard BEFORE the audit
 * row is requested and BEFORE the adapter/agent is touched. A misconfigured
 * preview payload can never reach a printer and can never leave a `requested`
 * audit row stranded.
 *
 * Real-DB, Mode C (Gate A non-waivable).
 *
 * @see PRD-092 / EXEC-092 WS8 / PRD-FR-6 / FR-7 / GATE-UX-1
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

import { createInstrumentPrintingHttp } from '@/services/loyalty/printing/http';
import { createHtmlPreviewRenderer } from '@/services/loyalty/printing/renderers/html-preview-renderer';

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

describeIntegration('render-validation fail-closed (WS8 / FR-7)', () => {
  let fx: PrintingFixtures;

  beforeAll(async () => {
    fx = await setupPrintingFixtures('render');
  });

  afterAll(async () => {
    if (fx) await fx.cleanup();
  });

  it('rejects a non-canonical renderer before any audit write or adapter call', async () => {
    const agent = makeInProcessAgentClient({ outcome: 'accepted' });
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: agent.client,
      printerTargetId: PRINTER,
      renderer: createHtmlPreviewRenderer(), // canonical === false
    });

    const before = await fx.setupClient
      .from('print_attempt')
      .select('*', { count: 'exact', head: true })
      .eq('casino_id', fx.casinoId);

    await expect(
      http.print({ payload: entitlementPayload(fx) }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      details: { responseCode: 'LOYALTY_PRINT_NON_CANONICAL_RENDERER' },
    });

    // Fail-closed: the agent was never touched and NO audit row was written.
    expect(agent.submitJobSpy).not.toHaveBeenCalled();
    const after = await fx.setupClient
      .from('print_attempt')
      .select('*', { count: 'exact', head: true })
      .eq('casino_id', fx.casinoId);
    expect(after.count).toBe(before.count);
  });

  it('the canonical renderer path still succeeds (guard is renderer-specific, not blanket)', async () => {
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: makeInProcessAgentClient({ outcome: 'accepted' }).client,
      printerTargetId: PRINTER,
      // default renderer is the canonical cups renderer
    });

    const result = await http.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'render-ok-1',
    });
    expect(result.outcome.status).toBe('submitted');
  });
});
