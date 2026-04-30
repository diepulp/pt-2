/** @jest-environment node */

/**
 * Recent Sessions Route — Phase 1.2B-A Integer Cents Assertion
 *
 * Minimum: one success case asserting FinancialValue envelope shape.
 * Value is integer cents after BRIDGE-001 retirement (Phase 1.2B-A).
 * Full test matrix (unauthorized, invalid-params, 404) deferred to Phase 1.2B-B.
 *
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
    mockGetPlayerRecentSessions.mockResolvedValue({
      sessions: [SESSION_FIXTURE],
      next_cursor: null,
      open_visit: null,
    });
  });

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

    // BRIDGE-001 retired (Phase 1.2B-A): value is integer cents.
    expect(session.total_buy_in.value).toBe(50000);
    expect(session.total_buy_in.type).toBe('actual');
    expect(typeof session.total_buy_in.source).toBe('string');
    expect(session.total_buy_in.completeness.status).toBe('complete');

    expect(session.total_cash_out.value).toBe(45000);
    expect(session.total_cash_out.type).toBe('actual');
    expect(typeof session.total_cash_out.source).toBe('string');
    expect(session.total_cash_out.completeness.status).toBe('complete');

    expect(session.net.value).toBe(-5000);
    expect(session.net.type).toBe('actual');
    expect(typeof session.net.source).toBe('string');
    expect(session.net.completeness.status).toBe('complete');
  });
});
