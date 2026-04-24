/** @jest-environment node */

/**
 * Recent Sessions Route — Phase 1.1 Envelope Smoke Test
 *
 * Minimum: one success case asserting FinancialValue envelope shape.
 * Value is a dollar float (e.g. 500.00), NOT integer cents — Phase 1.1.
 * Full test matrix (unauthorized, invalid-params, 404) deferred to Phase 1.2.
 *
 * @see EXEC-072 WS3 — route-boundary-tests-born gate
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Fixtures — FinancialValue dollar floats, not cents
// ---------------------------------------------------------------------------

const FINANCIAL_VALUE_FIXTURE = {
  value: 500.0,
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
    value: 450.0,
    type: 'actual' as const,
    source: 'visit_financial_summary.total_out',
    completeness: { status: 'complete' as const },
  },
  net: {
    value: -50.0,
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
  withServerAction: jest.fn((_supabase: unknown, handler: Function) =>
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

  it('returns FinancialValue envelope on session financial fields (dollar float, Phase 1.1)', async () => {
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

    // FinancialValue shape: type, source, completeness.status, value is number
    expect(session.total_buy_in.type).toBe('actual');
    expect(session.total_buy_in.source).toBeTruthy();
    expect(session.total_buy_in.completeness.status).toBeDefined();
    expect(typeof session.total_buy_in.value).toBe('number');
  });
});
