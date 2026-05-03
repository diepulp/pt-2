/** @jest-environment node */

/**
 * Recent Sessions Route — Phase 1.2B-C Route-Boundary Test Matrix
 *
 * 4-case matrix: 401 unauthorized, 400 invalid params, 200 empty (cross-tenant),
 * success with integer-cents FinancialValue shape (RULE-5).
 *
 * @see EXEC-076 WS2 — Phase 1.2B-C contract expansion
 * @see EXEC-074 WS3 — BRIDGE-001 retirement
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Fixtures — FinancialValue integer cents (BRIDGE-001 retired, Phase 1.2B-A)
// ---------------------------------------------------------------------------

const FINANCIAL_VALUE_FIXTURE = {
  value: 50000,
  type: 'actual' as const,
  source: 'visit_financial_summary.total_in',
  completeness: { status: 'complete' as const },
};

const SESSION_FIXTURE = {
  visit_id: '550e8400-e29b-41d4-a716-446655440001',
  visit_group_id: '550e8400-e29b-41d4-a716-446655440002',
  started_at: '2026-04-24T10:00:00Z',
  ended_at: '2026-04-24T12:00:00Z',
  last_table_id: '550e8400-e29b-41d4-a716-446655440003',
  last_table_name: 'BJ-01',
  last_seat_number: 3,
  total_duration_seconds: 7200,
  total_buy_in: FINANCIAL_VALUE_FIXTURE,
  total_cash_out: {
    value: 45000,
    type: 'actual' as const,
    source: 'visit_financial_summary.total_out',
    completeness: { status: 'complete' as const },
  },
  net: {
    value: -5000,
    type: 'actual' as const,
    source: 'visit_financial_summary.net_amount',
    completeness: { status: 'complete' as const },
  },
  points_earned: 100,
  segment_count: 2,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn(
    (
      _supabase: unknown,
      handler: (ctx: Record<string, unknown>) => Promise<unknown>,
    ) =>
      handler({
        supabase: {},
        correlationId: 'test-correlation-id',
        rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
      }),
  ),
}));

const mockGetPlayerRecentSessions = jest.fn();

jest.mock('@/services/visit/index', () => ({
  createVisitService: jest.fn(() => ({
    getPlayerRecentSessions: mockGetPlayerRecentSessions,
  })),
}));

// ---------------------------------------------------------------------------
// Import route handler (after mocks)
// ---------------------------------------------------------------------------

import { GET } from '../route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/players/[playerId]/recent-sessions', () => {
  const PLAYER_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPlayerRecentSessions.mockResolvedValue({
      sessions: [SESSION_FIXTURE],
      next_cursor: null,
      open_visit: null,
    });
  });

  // ── Case 1: 401 Unauthorized ──────────────────────────────────────────────

  it('returns 401 when auth middleware rejects the request', async () => {
    const { withServerAction } = jest.requireMock(
      '@/lib/server-actions/middleware',
    ) as { withServerAction: jest.Mock };

    withServerAction.mockImplementationOnce(async () => ({
      ok: false,
      code: 'UNAUTHORIZED',
      error: 'Unauthorized',
      status: 401,
      requestId: 'test-401-id',
      timestamp: new Date().toISOString(),
    }));

    const request = new NextRequest(
      `http://localhost:3000/api/v1/players/${PLAYER_ID}/recent-sessions`,
    );
    const params = Promise.resolve({ playerId: PLAYER_ID });

    const response = await GET(request, { params });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  // ── Case 2: 400 Invalid params ────────────────────────────────────────────

  it('returns 400 when playerId is not a valid UUID', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/v1/players/not-a-uuid/recent-sessions',
    );
    const params = Promise.resolve({ playerId: 'not-a-uuid' });

    const response = await GET(request, { params });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // ── Case 3: 200 Empty — cross-tenant player ───────────────────────────────

  it('returns 200 with empty sessions for cross-tenant player', async () => {
    // Route-boundary coverage only — not formal RLS proof; cross-tenant player
    // has no sessions visible in this RLS context. RLS policy scopes sessions
    // to casino_id; a player from another tenant returns an empty result set.
    mockGetPlayerRecentSessions.mockResolvedValueOnce({
      sessions: [],
      next_cursor: null,
      open_visit: null,
    });

    const CROSS_TENANT_PLAYER_ID = '550e8400-e29b-41d4-a716-446655440099';
    const request = new NextRequest(
      `http://localhost:3000/api/v1/players/${CROSS_TENANT_PLAYER_ID}/recent-sessions`,
    );
    const params = Promise.resolve({ playerId: CROSS_TENANT_PLAYER_ID });

    const response = await GET(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.sessions).toEqual([]);
    expect(body.data.sessions).toHaveLength(0);
  });

  // ── Case 4: Success — integer-cents FinancialValue shape (RULE-5) ─────────

  it('returns FinancialValue envelope on session financial fields with integer cents (Phase 1.2B-A)', async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/v1/players/${PLAYER_ID}/recent-sessions`,
    );
    const params = Promise.resolve({ playerId: PLAYER_ID });

    const response = await GET(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);

    const session = body.data.sessions[0];
    expect(session).toBeDefined();

    // RULE-5 (EXEC-076): Number.isInteger asserts integer-cents, not dollar-float
    expect(Number.isInteger(session.total_buy_in.value)).toBe(true);
    expect(session.total_buy_in.value).toBe(50000);
    expect(typeof session.total_buy_in.type).toBe('string');
    expect(typeof session.total_buy_in.source).toBe('string');
    expect(['complete', 'partial', 'unknown']).toContain(
      session.total_buy_in.completeness.status,
    );

    expect(Number.isInteger(session.total_cash_out.value)).toBe(true);
    expect(session.total_cash_out.value).toBe(45000);
    expect(typeof session.total_cash_out.type).toBe('string');
    expect(typeof session.total_cash_out.source).toBe('string');
    expect(['complete', 'partial', 'unknown']).toContain(
      session.total_cash_out.completeness.status,
    );

    expect(Number.isInteger(session.net.value)).toBe(true);
    expect(session.net.value).toBe(-5000);
    expect(typeof session.net.type).toBe('string');
    expect(typeof session.net.source).toBe('string');
    expect(['complete', 'partial', 'unknown']).toContain(
      session.net.completeness.status,
    );

    // No dollar-float: integer values must not contain a decimal point
    expect(String(session.total_buy_in.value)).not.toContain('.');
    expect(String(session.total_cash_out.value)).not.toContain('.');
    expect(String(session.net.value)).not.toContain('.');
  });
});
