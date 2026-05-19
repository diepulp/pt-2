/** @jest-environment node */

/**
 * Unit tests for GET /api/internal/outbox-observability (PRD-086 WS2).
 *
 * Auth model:
 *   401 — no session (getUser returns null user)
 *   403 — authenticated but staff.role !== 'admin'
 *   400 — invalid status or non-UUID search_id
 *   200 — admin session + valid params → { health, events }
 *
 * Two-client pattern:
 *   createClient  → session verification + staff role lookup
 *   createServiceClient → RPC calls (constructed only after auth passes)
 */

import { GET } from '../route';

// ── Mocks ───────────────────────────────────────────────────────────────────
// jest.mock is hoisted before const declarations — configure return values
// in beforeEach via jest.requireMock() to avoid TDZ errors.

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

  it('returns 200 with health and events for admin session', async () => {
    const { createServiceClient } = jest.requireMock<{
      createServiceClient: jest.Mock;
    }>('@/lib/supabase/service');
    const mockRpc = jest
      .fn()
      .mockResolvedValueOnce({ data: [MOCK_HEALTH], error: null })
      .mockResolvedValueOnce({ data: MOCK_EVENTS, error: null });
    createServiceClient.mockReturnValue({ rpc: mockRpc });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('health');
    expect(body).toHaveProperty('events');
    expect(body.health.pending_count).toBe(2);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].event_type).toBe('buyin.recorded');
  });

  it('derives casino_id from staff row — not from request query params', async () => {
    const { createServiceClient } = jest.requireMock<{
      createServiceClient: jest.Mock;
    }>('@/lib/supabase/service');
    const mockRpc = jest
      .fn()
      .mockResolvedValueOnce({ data: [MOCK_HEALTH], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    createServiceClient.mockReturnValue({ rpc: mockRpc });

    await GET(makeRequest({ casino_id: 'attacker-casino' }));

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[0][1].p_casino_id).toBe('casino-abc');
    expect(mockRpc.mock.calls[1][1].p_casino_id).toBe('casino-abc');
  });

  it('passes filter params correctly to rpc_get_outbox_event_page', async () => {
    const { createServiceClient } = jest.requireMock<{
      createServiceClient: jest.Mock;
    }>('@/lib/supabase/service');
    const mockRpc = jest
      .fn()
      .mockResolvedValueOnce({ data: [MOCK_HEALTH], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    createServiceClient.mockReturnValue({ rpc: mockRpc });

    await GET(
      makeRequest({
        event_type: 'buyin.recorded',
        status: 'pending',
        search_id: 'a0000000-0000-0000-0000-000000000001',
      }),
    );

    const eventsArgs = mockRpc.mock.calls[1][1];
    expect(eventsArgs.p_event_type).toBe('buyin.recorded');
    expect(eventsArgs.p_status).toBe('pending');
    expect(eventsArgs.p_search_id).toBe('a0000000-0000-0000-0000-000000000001');
  });
});
