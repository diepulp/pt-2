/** @jest-environment node */

/**
 * Unit tests for GET /api/internal/outbox-observability (PRD-086 WS2 + PRD-088 WS2).
 *
 * Auth model:
 *   401 — no session (getUser returns null user)
 *   403 — authenticated but staff.role !== 'admin'
 *   400 — invalid status or non-UUID search_id
 *   200 — admin session + valid params → { health, events, operationalBacklog }
 *
 * Two-client pattern:
 *   createClient  → session verification + staff role lookup
 *   createServiceClient → RPC calls + finance_outbox count queries (after auth)
 *
 * Phase 2.4 (PRD-088): operationalBacklog: { claimable, deadLetter } added.
 */

import { GET } from '../route';

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: jest.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/internal/outbox-observability');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

function buildSessionClient(
  user: { id: string } | null,
  staffRow: { role: string; casino_id: string } | null,
) {
  const getUser = jest.fn().mockResolvedValue({ data: { user } });
  const singleResult = { data: staffRow, error: null };
  const queryChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(singleResult),
  };
  return {
    auth: { getUser },
    from: jest.fn().mockReturnValue(queryChain),
  };
}

/**
 * Build a service client mock for the Phase 2.4 route.
 *
 * Promise.all order:
 *   [0] rpc('rpc_get_outbox_relay_health')
 *   [1] rpc('rpc_get_outbox_event_page')
 *   [2] from('finance_outbox')...lt(5)   — claimable count
 *   [3] from('finance_outbox')...gte(5)  — dead-letter count
 */
function buildServiceClient(opts: {
  health?: unknown;
  events?: unknown[];
  claimable?: number;
  deadLetter?: number;
}) {
  const mockRpc = jest
    .fn()
    .mockResolvedValueOnce({
      data: opts.health ? [opts.health] : [],
      error: null,
    })
    .mockResolvedValueOnce({ data: opts.events ?? [], error: null });

  function makeCountChain(count: number) {
    const chain: Record<string, jest.Mock> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
    };
    chain['lt'] = jest.fn().mockResolvedValue({ count, error: null });
    chain['gte'] = jest.fn().mockResolvedValue({ count, error: null });
    chain['select'] = jest.fn().mockReturnValue(chain);
    chain['eq'] = jest.fn().mockReturnValue(chain);
    chain['is'] = jest.fn().mockReturnValue(chain);
    return chain;
  }

  const fromFn = jest
    .fn()
    .mockReturnValueOnce(makeCountChain(opts.claimable ?? 0))
    .mockReturnValueOnce(makeCountChain(opts.deadLetter ?? 0));

  return { rpc: mockRpc, from: fromFn };
}

const MOCK_HEALTH = {
  pending_count: 2,
  oldest_pending_age_seconds: 90,
  retry_row_count: 1,
  poison_candidate_count: 0,
  processed_count_24h: 50,
};

const MOCK_EVENTS = [
  {
    event_id: 'e0000000-0000-0000-0000-000000000001',
    event_type: 'buyin.recorded',
    fact_class: 'ledger',
    origin_label: 'actual',
    casino_id: 'casino-abc',
    table_id: 't0000000-0000-0000-0000-000000000001',
    player_id: 'p0000000-0000-0000-0000-000000000001',
    aggregate_id: 'a0000000-0000-0000-0000-000000000001',
    payload: { amount_cents: 10000 },
    created_at: '2026-05-19T01:00:00Z',
    processed_at: null,
    delivery_attempts: 0,
    last_attempted_at: null,
    last_error: null,
  },
];

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/internal/outbox-observability — auth', () => {
  it('returns 401 when session is absent', async () => {
    const { createClient } = jest.requireMock<{ createClient: jest.Mock }>(
      '@/lib/supabase/server',
    );
    createClient.mockResolvedValue(buildSessionClient(null, null));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 for authenticated non-admin session (pit_boss)', async () => {
    const { createClient } = jest.requireMock<{ createClient: jest.Mock }>(
      '@/lib/supabase/server',
    );
    createClient.mockResolvedValue(
      buildSessionClient(
        { id: 'user-001' },
        { role: 'pit_boss', casino_id: 'casino-abc' },
      ),
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });
});

describe('GET /api/internal/outbox-observability — input validation', () => {
  beforeEach(() => {
    const { createClient } = jest.requireMock<{ createClient: jest.Mock }>(
      '@/lib/supabase/server',
    );
    createClient.mockResolvedValue(
      buildSessionClient(
        { id: 'user-001' },
        { role: 'admin', casino_id: 'casino-abc' },
      ),
    );
  });

  it('returns 400 for unrecognized status value', async () => {
    const res = await GET(makeRequest({ status: 'unknown-status' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid status');
  });

  it('returns 400 for malformed search_id (non-UUID)', async () => {
    const res = await GET(makeRequest({ search_id: 'not-a-uuid' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid search_id');
  });
});

describe('GET /api/internal/outbox-observability — success', () => {
  beforeEach(() => {
    const { createClient } = jest.requireMock<{ createClient: jest.Mock }>(
      '@/lib/supabase/server',
    );
    createClient.mockResolvedValue(
      buildSessionClient(
        { id: 'user-001' },
        { role: 'admin', casino_id: 'casino-abc' },
      ),
    );
  });

  it('returns 200 with health, events, and operationalBacklog for admin session', async () => {
    const { createServiceClient } = jest.requireMock<{
      createServiceClient: jest.Mock;
    }>('@/lib/supabase/service');
    createServiceClient.mockReturnValue(
      buildServiceClient({ health: MOCK_HEALTH, events: MOCK_EVENTS }),
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('health');
    expect(body).toHaveProperty('events');
    expect(body).toHaveProperty('operationalBacklog');
    expect(body.health.pending_count).toBe(2);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].event_type).toBe('buyin.recorded');
  });

  it('operationalBacklog.claimable and .deadLetter are returned correctly', async () => {
    const { createServiceClient } = jest.requireMock<{
      createServiceClient: jest.Mock;
    }>('@/lib/supabase/service');
    createServiceClient.mockReturnValue(
      buildServiceClient({
        health: MOCK_HEALTH,
        events: [],
        claimable: 4,
        deadLetter: 2,
      }),
    );

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.operationalBacklog).toEqual({ claimable: 4, deadLetter: 2 });
  });

  it('claimable queries delivery_attempts < 5; deadLetter queries delivery_attempts >= 5', async () => {
    const { createServiceClient } = jest.requireMock<{
      createServiceClient: jest.Mock;
    }>('@/lib/supabase/service');
    const serviceClient = buildServiceClient({
      health: MOCK_HEALTH,
      events: [],
    });
    createServiceClient.mockReturnValue(serviceClient);

    await GET(makeRequest());

    // fromFn called twice for the two backlog queries
    expect(serviceClient.from).toHaveBeenCalledTimes(2);
    expect(serviceClient.from).toHaveBeenCalledWith('finance_outbox');

    // First chain ends with .lt('delivery_attempts', 5) → claimable
    const claimableChain = serviceClient.from.mock.results[0].value;
    expect(claimableChain.lt).toHaveBeenCalledWith('delivery_attempts', 5);

    // Second chain ends with .gte('delivery_attempts', 5) → deadLetter
    const deadLetterChain = serviceClient.from.mock.results[1].value;
    expect(deadLetterChain.gte).toHaveBeenCalledWith('delivery_attempts', 5);
  });

  it('derives casino_id from staff row — not from request query params', async () => {
    const { createServiceClient } = jest.requireMock<{
      createServiceClient: jest.Mock;
    }>('@/lib/supabase/service');
    const serviceClient = buildServiceClient({
      health: MOCK_HEALTH,
      events: [],
    });
    createServiceClient.mockReturnValue(serviceClient);

    await GET(makeRequest({ casino_id: 'attacker-casino' }));

    expect(serviceClient.rpc).toHaveBeenCalledTimes(2);
    expect(serviceClient.rpc.mock.calls[0][1].p_casino_id).toBe('casino-abc');
    expect(serviceClient.rpc.mock.calls[1][1].p_casino_id).toBe('casino-abc');
  });

  it('passes filter params correctly to rpc_get_outbox_event_page', async () => {
    const { createServiceClient } = jest.requireMock<{
      createServiceClient: jest.Mock;
    }>('@/lib/supabase/service');
    createServiceClient.mockReturnValue(
      buildServiceClient({ health: MOCK_HEALTH, events: [] }),
    );

    await GET(
      makeRequest({
        event_type: 'buyin.recorded',
        status: 'pending',
        search_id: 'a0000000-0000-0000-0000-000000000001',
      }),
    );

    const eventsArgs = (
      jest.requireMock<{ createServiceClient: jest.Mock }>(
        '@/lib/supabase/service',
      ).createServiceClient.mock.results[0].value.rpc as jest.Mock
    ).mock.calls[1][1];
    expect(eventsArgs.p_event_type).toBe('buyin.recorded');
    expect(eventsArgs.p_status).toBe('pending');
    expect(eventsArgs.p_search_id).toBe('a0000000-0000-0000-0000-000000000001');
  });
});
