/** @jest-environment node */

/**
 * Visit Live View Route — Phase 1.2B-C Route-Boundary Test Matrix
 *
 * 4-case matrix: 401 unauthorized, 404 visit not found, 500 service error,
 * success with integer-cents FinancialValue shape (RULE-5).
 *
 * @see EXEC-076 WS2 — Phase 1.2B-C contract expansion
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
    jest.clearAllMocks();
    mockGetVisitLiveView.mockResolvedValue(LIVE_VIEW_FIXTURE);
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
      `http://localhost:3000/api/v1/visits/${VISIT_ID}/live-view`,
    );
    const params = Promise.resolve({ visitId: VISIT_ID });

    const response = await GET(request, { params });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  // ── Case 2: 404 Visit not found ───────────────────────────────────────────

  it('returns 404 when visit does not exist', async () => {
    // Route throws DomainError('VISIT_NOT_FOUND', ..., { httpStatus: 404 })
    // when getVisitLiveView returns null. See live-view/route.ts.
    mockGetVisitLiveView.mockResolvedValueOnce(null);

    const NONEXISTENT_VISIT_ID = '550e8400-e29b-41d4-a716-446655440099';
    const request = new NextRequest(
      `http://localhost:3000/api/v1/visits/${NONEXISTENT_VISIT_ID}/live-view`,
    );
    const params = Promise.resolve({ visitId: NONEXISTENT_VISIT_ID });

    const response = await GET(request, { params });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });

  // ── Case 3: 500 Service error ─────────────────────────────────────────────

  it('returns 500 when service layer throws an unexpected error', async () => {
    mockGetVisitLiveView.mockRejectedValueOnce(new Error('RPC timeout'));

    const request = new NextRequest(
      `http://localhost:3000/api/v1/visits/${VISIT_ID}/live-view`,
    );
    const params = Promise.resolve({ visitId: VISIT_ID });

    const response = await GET(request, { params });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });

  // ── Case 4: Success — integer-cents FinancialValue shape (RULE-5) ─────────

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

    // RULE-5 (EXEC-076): Number.isInteger asserts integer-cents, not dollar-float
    expect(Number.isInteger(liveView.session_total_buy_in.value)).toBe(true);
    expect(liveView.session_total_buy_in.value).toBe(7500);
    expect(typeof liveView.session_total_buy_in.type).toBe('string');
    expect(typeof liveView.session_total_buy_in.source).toBe('string');
    expect(['complete', 'partial', 'unknown']).toContain(
      liveView.session_total_buy_in.completeness.status,
    );

    expect(Number.isInteger(liveView.session_total_cash_out.value)).toBe(true);
    expect(liveView.session_total_cash_out.value).toBe(0);
    expect(typeof liveView.session_total_cash_out.type).toBe('string');
    expect(typeof liveView.session_total_cash_out.source).toBe('string');
    expect(['complete', 'partial', 'unknown']).toContain(
      liveView.session_total_cash_out.completeness.status,
    );

    expect(Number.isInteger(liveView.session_net.value)).toBe(true);
    expect(liveView.session_net.value).toBe(-7500);
    expect(typeof liveView.session_net.type).toBe('string');
    expect(typeof liveView.session_net.source).toBe('string');
    expect(['complete', 'partial', 'unknown']).toContain(
      liveView.session_net.completeness.status,
    );
  });
});
