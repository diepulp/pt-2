/** @jest-environment node */

/**
 * Visit Live View Route — Phase 1.2B-A Integer Cents Assertion
 *
 * Minimum: one success case asserting FinancialValue envelope shape.
 * Value is integer cents after BRIDGE-001 retirement (Phase 1.2B-A).
 * Full test matrix (unauthorized, invalid-params, 404) deferred to Phase 1.2B-B.
 *
 * @see EXEC-074 WS3 — BRIDGE-001 retirement
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Fixture — FinancialValue integer cents (BRIDGE-001 retired, Phase 1.2B-A)
// ---------------------------------------------------------------------------

const LIVE_VIEW_FIXTURE = {
  visit_id: '550e8400-e29b-41d4-a716-446655440010',
  player_id: '550e8400-e29b-41d4-a716-446655440011',
  player_first_name: 'John',
  player_last_name: 'Doe',
  visit_status: 'open' as const,
  started_at: '2026-04-24T10:00:00Z',
  current_segment_slip_id: null,
  current_segment_table_id: null,
  current_segment_table_name: null,
  current_segment_seat_number: null,
  current_segment_status: null,
  current_segment_started_at: null,
  current_segment_average_bet: null,
  session_total_duration_seconds: 3600,
  session_total_buy_in: {
    value: 7500,
    type: 'actual' as const,
    source: 'visit_financial_summary.total_in',
    completeness: { status: 'complete' as const },
  },
  session_total_cash_out: {
    value: 0,
    type: 'actual' as const,
    source: 'visit_financial_summary.total_out',
    completeness: { status: 'complete' as const },
  },
  session_net: {
    value: -7500,
    type: 'actual' as const,
    source: 'visit_financial_summary.net_amount',
    completeness: { status: 'complete' as const },
  },
  session_points_earned: 50,
  session_segment_count: 1,
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

const mockGetVisitLiveView = jest.fn();

jest.mock('@/services/rating-slip', () => ({
  createRatingSlipService: jest.fn(() => ({
    getVisitLiveView: mockGetVisitLiveView,
  })),
}));

// ---------------------------------------------------------------------------
// Import route handler (after mocks)
// ---------------------------------------------------------------------------

import { GET } from '../route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/visits/[visitId]/live-view', () => {
  const VISIT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    mockGetVisitLiveView.mockResolvedValue(LIVE_VIEW_FIXTURE);
  });

  it('returns FinancialValue envelope on session financial fields with integer cents (Phase 1.2B-A)', async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/v1/visits/${VISIT_ID}/live-view`,
    );
    const params = Promise.resolve({ visitId: VISIT_ID });

    const response = await GET(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);

    const liveView = body.data;
    expect(liveView).toBeDefined();

    // BRIDGE-001 retired (Phase 1.2B-A): value is integer cents.
    expect(liveView.session_total_buy_in.value).toBe(7500);
    expect(liveView.session_total_buy_in.type).toBe('actual');
    expect(typeof liveView.session_total_buy_in.source).toBe('string');
    expect(liveView.session_total_buy_in.completeness.status).toBe('complete');

    expect(liveView.session_total_cash_out.value).toBe(0);
    expect(liveView.session_total_cash_out.type).toBe('actual');
    expect(typeof liveView.session_total_cash_out.source).toBe('string');
    expect(liveView.session_total_cash_out.completeness.status).toBe(
      'complete',
    );

    expect(liveView.session_net.value).toBe(-7500);
    expect(liveView.session_net.type).toBe('actual');
    expect(typeof liveView.session_net.source).toBe('string');
    expect(liveView.session_net.completeness.status).toBe('complete');
  });
});
