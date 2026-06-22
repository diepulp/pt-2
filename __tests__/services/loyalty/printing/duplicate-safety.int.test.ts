/** @jest-environment node */

/**
 * GATE-DUP-1: duplicate-safety (PRD-092 WS8 / DA P1-B / DEC-004 / DEC-005)
 *
 *   (a) idempotent first_print REPLAY emits one physical copy — a repeated
 *       first_print returns the prior terminal row (replayed=true) and the agent
 *       `submitJob` is invoked EXACTLY ONCE across both calls (sequential path,
 *       where adapter-once is deterministic — exactly_once_nuance).
 *   (b) reprint nonce = a DISTINCT lineage — a new audit row, a different
 *       idempotency_key, and reprint_of set.
 *   (c) NO auto-print on issuance (DEC-004) — building the controlled action and
 *       NOT calling print() writes nothing and never touches the agent; nothing
 *       prints without an explicit operator action.
 *   (d) two CONCURRENT first_print collapse to ONE audit row (DB single-flight)
 *       resolving to the same attempt id; the agent jobKey dedupe collapses to a
 *       SINGLE physical document (no second distinct spool) — the real
 *       physical-once boundary under true concurrency (exactly_once_nuance).
 *
 * Real-DB, Mode C (Gate A non-waivable).
 *
 * @see PRD-092 / EXEC-092 WS8 / PRD-GATE-DUP-1 / DEC-005
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

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

async function rowCountForKey(
  fx: PrintingFixtures,
  idempotencyKey: string,
): Promise<number> {
  const { count } = await fx.setupClient
    .from('print_attempt')
    .select('*', { count: 'exact', head: true })
    .eq('casino_id', fx.casinoId)
    .eq('idempotency_key', idempotencyKey);
  return count ?? -1;
}

describeIntegration('GATE-DUP-1 duplicate-safety (WS8)', () => {
  let fx: PrintingFixtures;

  beforeAll(async () => {
    fx = await setupPrintingFixtures('dup');
  });

  afterAll(async () => {
    if (fx) await fx.cleanup();
  });

  it('(a) idempotent first_print replay → one row, one physical submission', async () => {
    const agent = makeInProcessAgentClient({ outcome: 'accepted' });
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: agent.client,
      printerTargetId: PRINTER,
    });

    const first = await http.print({ payload: entitlementPayload(fx) });
    expect(first.outcome.status).toBe('submitted');
    expect(first.replayed).toBe(false);

    const replay = await http.print({ payload: entitlementPayload(fx) });
    expect(replay.replayed).toBe(true);
    expect(replay.attempt.printAttemptId).toBe(first.attempt.printAttemptId);

    // The adapter/agent fired EXACTLY ONCE — the replay short-circuited at the
    // terminal-prior row and never reached transport (no second copy).
    expect(agent.submitJobSpy).toHaveBeenCalledTimes(1);
    expect(await rowCountForKey(fx, first.attempt.idempotencyKey)).toBe(1);
  });

  it('(b) reprint nonce forks a distinct lineage (new row, new key, reprint_of set)', async () => {
    const agent = makeInProcessAgentClient({ outcome: 'accepted' });
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: agent.client,
      printerTargetId: PRINTER,
    });

    const original = await http.print({ payload: entitlementPayload(fx) });
    const reprint = await http.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'reprint-nonce-xyz',
      reprintOf: original.attempt.printAttemptId,
    });

    expect(reprint.attempt.printAttemptId).not.toBe(
      original.attempt.printAttemptId,
    );
    expect(reprint.attempt.idempotencyKey).not.toBe(
      original.attempt.idempotencyKey,
    );
    expect(reprint.attempt.reprintOf).toBe(original.attempt.printAttemptId);
    expect(reprint.replayed).toBe(false);
  });

  it('(c) DEC-004: building the action prints nothing until print() is called', async () => {
    const agent = makeInProcessAgentClient({ outcome: 'accepted' });
    // Use a brand-new instrument-independent reprint nonce so this row is
    // distinguishable; the point is nothing happens WITHOUT an explicit print().
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: agent.client,
      printerTargetId: PRINTER,
    });

    const before = await fx.setupClient
      .from('print_attempt')
      .select('*', { count: 'exact', head: true })
      .eq('casino_id', fx.casinoId);

    // No print() call — no auto-fire.
    expect(agent.submitJobSpy).not.toHaveBeenCalled();

    const mid = await fx.setupClient
      .from('print_attempt')
      .select('*', { count: 'exact', head: true })
      .eq('casino_id', fx.casinoId);
    expect(mid.count).toBe(before.count);

    // Exactly one explicit print() produces exactly one attempt + one submission.
    await http.print({
      payload: entitlementPayload(fx),
      reprintNonce: 'manual-only-1',
    });
    expect(agent.submitJobSpy).toHaveBeenCalledTimes(1);
  });

  it('(d) two concurrent first_print → one audit row, one physical document', async () => {
    const agent = makeInProcessAgentClient({ outcome: 'accepted' });
    const http = createInstrumentPrintingHttp({
      supabase: fx.pitBossClient,
      client: agent.client,
      printerTargetId: PRINTER,
    });

    // A fresh reprint nonce gives this race its own idempotency key, isolated
    // from the other sub-cases' first_print key.
    const payload = entitlementPayload(fx);
    const [a, b] = await Promise.all([
      http.print({ payload, reprintNonce: 'race-1' }),
      http.print({ payload, reprintNonce: 'race-1' }),
    ]);

    // DB single-flight: exactly ONE audit row, both calls see the same attempt.
    expect(a.attempt.printAttemptId).toBe(b.attempt.printAttemptId);
    expect(a.attempt.idempotencyKey).toBe(b.attempt.idempotencyKey);
    expect(await rowCountForKey(fx, a.attempt.idempotencyKey)).toBe(1);

    // Physical-once boundary (exactly_once_nuance): under true concurrency both
    // peers MAY reach the adapter (both observed `requested`), but the agent
    // jobKey dedupe collapses them to a SINGLE physical document — every spooler
    // submission for this job resolves to the same job id (no second distinct
    // copy). The agent is the real physical-once boundary here, not call count.
    const spoolResults = await Promise.all(
      agent.spoolerSpy.mock.results
        .filter((r) => r.type === 'return')
        .map((r) => r.value as Promise<{ jobId?: string }>),
    );
    const jobIds = spoolResults
      .map((v) => v.jobId)
      .filter((id): id is string => Boolean(id));
    expect(jobIds.length).toBeGreaterThanOrEqual(1);
    expect(new Set(jobIds).size).toBe(1);
  });
});
