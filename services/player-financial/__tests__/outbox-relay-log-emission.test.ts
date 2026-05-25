/** @jest-environment node */

import { GET, POST } from '@/app/api/internal/outbox-relay/route';
import { createServiceClient as createServiceClientReal } from '@/lib/supabase/service';
import { runConsumer as runConsumerReal } from '@/services/player-financial/outbox-consumer';
import { runOperationalConsumer as runOperationalConsumerReal } from '@/services/player-financial/outbox-operational-consumer';

import type { FinancialOutboxEventDTO } from '../dtos';

jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: jest.fn(),
}));
jest.mock('@/services/player-financial/outbox-consumer', () => {
  // Preserve the real helpers (aggregateLagSamples, collectLagSamplesMs,
  // collectOutboxBacklog) so the route exercises them; mock only runConsumer.
  const actual = jest.requireActual(
    '@/services/player-financial/outbox-consumer',
  );
  return { ...actual, runConsumer: jest.fn() };
});
jest.mock('@/services/player-financial/outbox-operational-consumer', () => ({
  runOperationalConsumer: jest.fn(),
}));

const createServiceClient = createServiceClientReal as unknown as jest.Mock;
const runConsumer = runConsumerReal as unknown as jest.Mock;
const runOperationalConsumer =
  runOperationalConsumerReal as unknown as jest.Mock;

const FAKE_SECRET = 'test-cron-secret-xyz';

type FromCall = {
  selectArgs?: unknown[];
  eqCalls: unknown[][];
  inCalls: unknown[][];
  isCalls: unknown[][];
  ltCalls: unknown[][];
  gteCalls: unknown[][];
};

type FromResult =
  | { kind: 'data'; data: unknown[]; error?: null }
  | { kind: 'count'; count: number; error?: null };

function makeFromMock(results: FromResult[]) {
  const captured: FromCall[] = [];
  let index = 0;

  function makeChain(result: FromResult, current: FromCall) {
    const chain = {
      select: (...args: unknown[]) => {
        current.selectArgs = args;
        return chain;
      },
      eq: (...args: unknown[]) => {
        current.eqCalls.push(args);
        return chain;
      },
      in: (...args: unknown[]) => {
        current.inCalls.push(args);
        return chain;
      },
      is: (...args: unknown[]) => {
        current.isCalls.push(args);
        return chain;
      },
      lt: (...args: unknown[]) => {
        current.ltCalls.push(args);
        return chain;
      },
      gte: (...args: unknown[]) => {
        current.gteCalls.push(args);
        return chain;
      },
      then: (
        onFulfilled: (value: {
          data: unknown[] | null;
          error: null;
          count: number | null;
        }) => unknown,
      ) =>
        onFulfilled(
          result.kind === 'data'
            ? { data: result.data, error: null, count: null }
            : { data: null, error: null, count: result.count },
        ),
    };
    return chain;
  }

  const fromFn = jest.fn(() => {
    const result = results[index++] ?? { kind: 'data' as const, data: [] };
    const current: FromCall = {
      eqCalls: [],
      inCalls: [],
      isCalls: [],
      ltCalls: [],
      gteCalls: [],
    };
    captured.push(current);
    return makeChain(result, current);
  });

  return { fromFn, captured };
}

function makeRequest(opts?: {
  auth?: string;
  noAuth?: boolean;
  method?: 'GET' | 'POST';
}): Request {
  const headers: Record<string, string> = {};
  if (!opts?.noAuth) {
    headers['Authorization'] = opts?.auth ?? `Bearer ${FAKE_SECRET}`;
  }
  return new Request('http://localhost/api/internal/outbox-relay', {
    method: opts?.method ?? 'POST',
    headers,
  });
}

function makeRow(
  overrides: Partial<FinancialOutboxEventDTO> = {},
): FinancialOutboxEventDTO {
  return {
    event_id: 'ev-log-0001',
    event_type: 'buyin.recorded',
    casino_id: 'cas-log-1',
    table_id: 'tbl-log-1',
    player_id: 'player-log-1',
    aggregate_id: 'agg-log-1',
    gaming_day: '2026-05-21',
    created_at: '2026-05-21T00:00:00.000Z',
    processed_at: null,
    fact_class: 'ledger',
    origin_label: 'actual',
    payload: {},
    ...overrides,
  };
}

describe('outbox relay log emission (PRD-089 WS1_LOG)', () => {
  let originalSecret: string | undefined;
  let logSpy: jest.SpyInstance;

  beforeAll(() => {
    originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = FAKE_SECRET;
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    runOperationalConsumer.mockResolvedValue({
      processed: 0,
      duplicate: 0,
      errors: [],
      lagSamplesMs: [],
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function getEmittedLog(): Record<string, unknown> {
    const callsWithCycle = logSpy.mock.calls.filter((args: unknown[]) => {
      if (typeof args[0] !== 'string') return false;
      try {
        const parsed = JSON.parse(args[0]) as { cycle?: unknown };
        return parsed.cycle === 'outbox_relay_cycle';
      } catch {
        return false;
      }
    });
    if (callsWithCycle.length === 0) {
      throw new Error('no outbox_relay_cycle log line was emitted');
    }
    if (callsWithCycle.length > 1) {
      throw new Error(
        `expected exactly one outbox_relay_cycle log line per cycle; got ${callsWithCycle.length}`,
      );
    }
    return JSON.parse(callsWithCycle[0][0] as string) as Record<
      string,
      unknown
    >;
  }

  // ── FR-2: Unauthenticated variant ──────────────────────────────────────
  describe('FR-2 unauthenticated log variant', () => {
    it('emits auth_fail log with minimal fields when Authorization header is missing', async () => {
      const res = await POST(makeRequest({ noAuth: true }));

      expect(res.status).toBe(401);
      const log = getEmittedLog();
      expect(log).toEqual({
        cycle: 'outbox_relay_cycle',
        outcome: 'auth_fail',
        relay_duration_ms: expect.any(Number),
      });
      // FR-2: no backlog/lag fields on the auth_fail variant.
      expect(log).not.toHaveProperty('outbox_backlog_size');
      expect(log).not.toHaveProperty('lag_ms');
      expect(log).not.toHaveProperty('class_a_branch');
      expect(log).not.toHaveProperty('operational_branch');
    });

    it('emits auth_fail log when CRON_SECRET env var is missing', async () => {
      const saved = process.env.CRON_SECRET;
      delete process.env.CRON_SECRET;
      const res = await POST(makeRequest({ auth: 'Bearer anything' }));
      process.env.CRON_SECRET = saved;

      expect(res.status).toBe(401);
      const log = getEmittedLog();
      expect(log.outcome).toBe('auth_fail');
    });

    it('emits auth_fail log when Authorization header value is wrong', async () => {
      const res = await POST(makeRequest({ auth: 'Bearer wrong-value' }));

      expect(res.status).toBe(401);
      const log = getEmittedLog();
      expect(log.outcome).toBe('auth_fail');
    });

    it('does NOT construct service client or query DB on auth_fail', async () => {
      await POST(makeRequest({ noAuth: true }));
      expect(createServiceClient).not.toHaveBeenCalled();
    });
  });

  // ── FR-1: Authenticated variant, empty cycle ───────────────────────────
  describe('FR-1 authenticated log variant — empty cycle', () => {
    it('emits ok log with zero counts and null lag_ms when queue is empty', async () => {
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [], error: null }) // claim
        .mockResolvedValue({ data: null, error: null });
      const { fromFn } = makeFromMock([
        { kind: 'count', count: 0 }, // ledger
        { kind: 'count', count: 0 }, // op-claimable
        { kind: 'count', count: 0 }, // op-dead-letter
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });

      await POST(makeRequest());

      const log = getEmittedLog();
      expect(log).toMatchObject({
        cycle: 'outbox_relay_cycle',
        outcome: 'ok',
        outbox_backlog_size: {
          ledger: { total: 0 },
          operational: { claimable: 0, dead_letter: 0, total: 0 },
        },
        lag_ms: null,
        class_a_branch: { processed: 0, failed: 0 },
        operational_branch: { processed: 0, duplicate: 0, errors: 0 },
      });
      expect(log.relay_duration_ms).toEqual(expect.any(Number));
    });
  });

  // ── FR-1: Authenticated variant, populated cycle ───────────────────────
  describe('FR-1 authenticated log variant — populated cycle', () => {
    it('populates lag_ms aggregate from DB-derived per-row lag samples (Class A branch)', async () => {
      const row1 = makeRow({ event_id: 'ev-A' });
      const row2 = makeRow({ event_id: 'ev-B' });
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [row1, row2], error: null }) // claim
        .mockResolvedValue({ data: null, error: null }); // acks
      const { fromFn } = makeFromMock([
        // Lag samples: ev-A processed 100ms after creation; ev-B 500ms after.
        {
          kind: 'data',
          data: [
            {
              event_id: 'ev-A',
              created_at: '2026-05-21T00:00:00.000Z',
              processed_at: '2026-05-21T00:00:00.100Z',
            },
            {
              event_id: 'ev-B',
              created_at: '2026-05-21T00:00:01.000Z',
              processed_at: '2026-05-21T00:00:01.500Z',
            },
          ],
        },
        { kind: 'count', count: 0 }, // ledger
        { kind: 'count', count: 0 }, // op-claimable
        { kind: 'count', count: 0 }, // op-dead-letter
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });
      runConsumer.mockResolvedValue('processed');

      await POST(makeRequest());

      const log = getEmittedLog();
      expect(log.class_a_branch).toEqual({ processed: 2, failed: 0 });
      expect(log.lag_ms).toEqual({
        min: 100,
        p50: 100,
        p95: 500,
        max: 500,
      });
    });

    it('combines Class A and operational lag samples in the aggregate', async () => {
      const row = makeRow({ event_id: 'ev-A' });
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [row], error: null })
        .mockResolvedValue({ data: null, error: null });
      const { fromFn } = makeFromMock([
        {
          kind: 'data',
          data: [
            {
              event_id: 'ev-A',
              created_at: '2026-05-21T00:00:00.000Z',
              processed_at: '2026-05-21T00:00:00.200Z',
            },
          ],
        },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });
      runConsumer.mockResolvedValue('processed');
      // Operational branch contributes its own lag samples through its result.
      runOperationalConsumer.mockResolvedValue({
        processed: 3,
        duplicate: 0,
        errors: [],
        lagSamplesMs: [50, 1000, 2000],
      });

      await POST(makeRequest());

      const log = getEmittedLog();
      // Combined samples: [200, 50, 1000, 2000] → sorted [50, 200, 1000, 2000]
      // min=50, max=2000, p50=ceil(0.5*4)-1=1 → sorted[1]=200, p95=ceil(0.95*4)-1=3 → sorted[3]=2000
      expect(log.lag_ms).toEqual({
        min: 50,
        p50: 200,
        p95: 2000,
        max: 2000,
      });
      expect(log.operational_branch).toEqual({
        processed: 3,
        duplicate: 0,
        errors: 0,
      });
    });

    it('exclusion by construction: duplicate Class A outcomes do NOT contribute lag samples', async () => {
      // Two rows: ev-A processes new (contributes lag), ev-B is duplicate (does not).
      const row1 = makeRow({ event_id: 'ev-A' });
      const row2 = makeRow({ event_id: 'ev-B' });
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [row1, row2], error: null })
        .mockResolvedValue({ data: null, error: null });
      const { fromFn, captured } = makeFromMock([
        // Lag query should only include ev-A (ev-B excluded by construction)
        {
          kind: 'data',
          data: [
            {
              event_id: 'ev-A',
              created_at: '2026-05-21T00:00:00.000Z',
              processed_at: '2026-05-21T00:00:00.250Z',
            },
          ],
        },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });
      runConsumer
        .mockResolvedValueOnce('processed')
        .mockResolvedValueOnce('duplicate');

      await POST(makeRequest());

      // First .from() call is the lag-sample query. Inspect its `.in('event_id', [...])`.
      const lagCall = captured[0]!;
      expect(lagCall.inCalls).toHaveLength(1);
      const [inColumn, inValues] = lagCall.inCalls[0]!;
      expect(inColumn).toBe('event_id');
      expect(inValues).toEqual(['ev-A']); // ev-B excluded
      const log = getEmittedLog();
      expect(log.class_a_branch).toEqual({ processed: 2, failed: 0 });
    });

    it('class A failed rows do NOT contribute lag samples', async () => {
      const row = makeRow({ event_id: 'ev-fail' });
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [row], error: null })
        .mockResolvedValue({ data: null, error: null });
      const { fromFn, captured } = makeFromMock([
        { kind: 'data', data: [] }, // no event_ids in lag query
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });
      runConsumer.mockResolvedValue(new Error('downstream timeout'));

      await POST(makeRequest());

      const lagCall = captured[0]!;
      // Lag query was issued but with empty event_id array (so the helper short-circuits early).
      // collectLagSamplesMs returns [] without calling from() when eventIds is empty.
      // Therefore captured[0] is the FIRST backlog query, not a lag query.
      // We assert that no .in('event_id', [...]) call was made (no lag query).
      expect(lagCall.inCalls.some(([col]) => col === 'event_id')).toBe(false);
      const log = getEmittedLog();
      expect(log.class_a_branch).toEqual({ processed: 0, failed: 1 });
      expect(log.lag_ms).toBeNull();
    });
  });

  // ── Backlog predicate parity (P1-BACKLOG-CLAIMABILITY-DEFINITION) ──────
  describe('backlog predicate parity with claim RPCs', () => {
    it('ledger.total predicate matches rpc_claim_class_a_outbox_batch (fact_class=ledger, processed_at IS NULL)', async () => {
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValue({ data: null, error: null });
      const { fromFn, captured } = makeFromMock([
        { kind: 'count', count: 7 }, // ledger
        { kind: 'count', count: 0 }, // op-claimable
        { kind: 'count', count: 0 }, // op-dead-letter
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });

      await POST(makeRequest());

      // With empty batch + no processed rows, first from() = ledger backlog query.
      const ledgerCall = captured[0]!;
      expect(ledgerCall.eqCalls).toContainEqual(['fact_class', 'ledger']);
      expect(ledgerCall.isCalls).toContainEqual(['processed_at', null]);
      // No event_type filter on ledger (claim RPC has none either).
      expect(ledgerCall.inCalls.some(([col]) => col === 'event_type')).toBe(
        false,
      );
      // No delivery_attempts filter on ledger.
      expect(ledgerCall.ltCalls).toHaveLength(0);
      expect(ledgerCall.gteCalls).toHaveLength(0);

      const log = getEmittedLog();
      expect(
        (log.outbox_backlog_size as Record<string, { total: number }>).ledger
          .total,
      ).toBe(7);
    });

    it('operational.claimable predicate includes event_type whitelist + delivery_attempts < 5 (RPC source of truth)', async () => {
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValue({ data: null, error: null });
      const { fromFn, captured } = makeFromMock([
        { kind: 'count', count: 0 },
        { kind: 'count', count: 12 },
        { kind: 'count', count: 0 },
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });

      await POST(makeRequest());

      // Second from() call is the operational-claimable query.
      const opClaimableCall = captured[1]!;
      expect(opClaimableCall.eqCalls).toContainEqual([
        'fact_class',
        'operational',
      ]);
      expect(opClaimableCall.isCalls).toContainEqual(['processed_at', null]);
      expect(opClaimableCall.ltCalls).toContainEqual(['delivery_attempts', 5]);
      // Event-type whitelist matches rpc_claim_operational_outbox_batch verbatim.
      const evtWhitelistCall = opClaimableCall.inCalls.find(
        ([col]) => col === 'event_type',
      );
      expect(evtWhitelistCall).toBeDefined();
      const [, whitelist] = evtWhitelistCall as [string, string[]];
      expect(whitelist).toEqual([
        'grind.observed',
        'fill.recorded',
        'credit.recorded',
      ]);

      const log = getEmittedLog();
      expect(
        (
          log.outbox_backlog_size as {
            operational: { claimable: number };
          }
        ).operational.claimable,
      ).toBe(12);
    });

    it('operational.dead_letter predicate uses delivery_attempts >= 5 + same event_type whitelist', async () => {
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValue({ data: null, error: null });
      const { fromFn, captured } = makeFromMock([
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 4 },
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });

      await POST(makeRequest());

      const opDeadLetterCall = captured[2]!;
      expect(opDeadLetterCall.eqCalls).toContainEqual([
        'fact_class',
        'operational',
      ]);
      expect(opDeadLetterCall.isCalls).toContainEqual(['processed_at', null]);
      expect(opDeadLetterCall.gteCalls).toContainEqual([
        'delivery_attempts',
        5,
      ]);
      const evtWhitelistCall = opDeadLetterCall.inCalls.find(
        ([col]) => col === 'event_type',
      );
      expect(evtWhitelistCall).toBeDefined();

      const log = getEmittedLog();
      expect(
        (
          log.outbox_backlog_size as {
            operational: { dead_letter: number };
          }
        ).operational.dead_letter,
      ).toBe(4);
    });

    it('operational.total is the TS-computed sum of claimable + dead_letter', async () => {
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValue({ data: null, error: null });
      const { fromFn } = makeFromMock([
        { kind: 'count', count: 0 },
        { kind: 'count', count: 8 },
        { kind: 'count', count: 3 },
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });

      await POST(makeRequest());

      const log = getEmittedLog();
      expect(
        (log.outbox_backlog_size as { operational: { total: number } })
          .operational.total,
      ).toBe(11);
    });
  });

  // ── Outcome discrimination ──────────────────────────────────────────────
  describe('outcome field discrimination', () => {
    it('outcome is "error" when class A has failed rows', async () => {
      const row = makeRow({ event_id: 'ev-x' });
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [row], error: null })
        .mockResolvedValue({ data: null, error: null });
      const { fromFn } = makeFromMock([
        { kind: 'data', data: [] },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });
      runConsumer.mockResolvedValue(new Error('fail'));

      await POST(makeRequest());

      const log = getEmittedLog();
      expect(log.outcome).toBe('error');
    });

    it('outcome is "error" when operational has errors', async () => {
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValue({ data: null, error: null });
      const { fromFn } = makeFromMock([
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });
      runOperationalConsumer.mockResolvedValue({
        processed: 0,
        duplicate: 0,
        errors: [new Error('op-fail')],
        lagSamplesMs: [],
      });

      await POST(makeRequest());

      const log = getEmittedLog();
      expect(log.outcome).toBe('error');
      expect((log.operational_branch as { errors: number }).errors).toBe(1);
    });

    it('outcome is "error" when Class A claim RPC fails (still emits one log line)', async () => {
      const rpcFn = jest.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'claim rpc broke' },
      });
      const { fromFn } = makeFromMock([
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });

      const res = await POST(makeRequest());

      expect(res.status).toBe(500);
      const log = getEmittedLog();
      expect(log.outcome).toBe('error');
      expect(log.class_a_branch).toEqual({ processed: 0, failed: 0 });
      expect(log.lag_ms).toBeNull();
    });
  });

  // ── GET parity with POST ────────────────────────────────────────────────
  describe('GET handler shares the same processing path', () => {
    it('GET emits the same log shape as POST on a successful cycle', async () => {
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValue({ data: null, error: null });
      const { fromFn } = makeFromMock([
        { kind: 'count', count: 2 },
        { kind: 'count', count: 1 },
        { kind: 'count', count: 0 },
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });

      const res = await GET(makeRequest({ method: 'GET' }));

      expect(res.status).toBe(200);
      const log = getEmittedLog();
      expect(log.cycle).toBe('outbox_relay_cycle');
      expect(log.outcome).toBe('ok');
      expect(
        (log.outbox_backlog_size as { ledger: { total: number } }).ledger.total,
      ).toBe(2);
    });

    it('GET returns 401 + auth_fail log when CRON_SECRET is wrong', async () => {
      const res = await GET(
        makeRequest({ method: 'GET', auth: 'Bearer wrong' }),
      );

      expect(res.status).toBe(401);
      const log = getEmittedLog();
      expect(log.outcome).toBe('auth_fail');
      expect(createServiceClient).not.toHaveBeenCalled();
    });
  });

  // ── HTTP response shape preserved ──────────────────────────────────────
  describe('HTTP response shape preserves prior contract', () => {
    it('does NOT expose lagSamplesMs in the HTTP body (internal contract only)', async () => {
      const row = makeRow({ event_id: 'ev-Z' });
      const rpcFn = jest
        .fn()
        .mockResolvedValueOnce({ data: [row], error: null })
        .mockResolvedValue({ data: null, error: null });
      const { fromFn } = makeFromMock([
        {
          kind: 'data',
          data: [
            {
              event_id: 'ev-Z',
              created_at: '2026-05-21T00:00:00.000Z',
              processed_at: '2026-05-21T00:00:00.075Z',
            },
          ],
        },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
        { kind: 'count', count: 0 },
      ]);
      createServiceClient.mockReturnValue({ rpc: rpcFn, from: fromFn });
      runConsumer.mockResolvedValue('processed');
      runOperationalConsumer.mockResolvedValue({
        processed: 1,
        duplicate: 0,
        errors: [],
        lagSamplesMs: [999],
      });

      const res = await POST(makeRequest());
      const body = await res.json();

      // Prior contract: { classA: { processed, failed }, operational: { processed, duplicate, errors } }
      expect(body.classA).toEqual({ processed: 1, failed: 0 });
      expect(body.classA).not.toHaveProperty('lagSamplesMs');
      expect(body.operational).toEqual({
        processed: 1,
        duplicate: 0,
        errors: [],
      });
      expect(body.operational).not.toHaveProperty('lagSamplesMs');
    });
  });
});
