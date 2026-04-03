/** @jest-environment node */

/**
 * Anomaly Alerts Route Handler -- Boundary Test
 *
 * Tests GET /api/v1/shift-intelligence/anomaly-alerts at the HTTP boundary layer.
 * Validates request -> response shape, casino_id scoping from RLS context,
 * role gate enforcement, and error handling.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 * - getAnomalyAlerts: mocked to control service layer output
 *
 * @see SHIFT-INTELLIGENCE-POSTURE.md
 */

import { NextRequest } from 'next/server';

import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Fixture: minimal AnomalyAlertsResponseDTO shape
// ---------------------------------------------------------------------------
const ALERTS_FIXTURE = {
  alerts: [
    {
      tableId: 'table-abc',
      tableLabel: 'BJ-01',
      metricType: 'drop_total',
      readinessState: 'ready',
      observedValue: 15000,
      baselineMedian: 12000,
      baselineMad: 1500,
      deviationScore: 2.0,
      isAnomaly: false,
      severity: null,
      direction: 'above',
      thresholdValue: 4500,
      baselineGamingDay: '2026-03-22',
      baselineSampleCount: 7,
      message: 'Within normal range',
      sessionCount: 3,
      peakDeviation: 2.5,
      recommendedAction: null,
    },
  ],
  gamingDay: '2026-03-22',
  computedAt: '2026-03-22T12:00:00Z',
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
let mockSupabase: Record<string, unknown>;

const mockGetAnomalyAlerts = jest.fn().mockResolvedValue(ALERTS_FIXTURE);

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/services/shift-intelligence/anomaly', () => ({
  getAnomalyAlerts: (...args: unknown[]) => mockGetAnomalyAlerts(...args),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn(
    async (
      _supabase: unknown,
      handler: (
        ctx: Record<string, unknown>,
      ) => Promise<ServiceResult<unknown>>,
      _options: unknown,
    ) => {
      return handler({
        supabase: mockSupabase,
        correlationId: 'test-correlation-id',
        startedAt: Date.now(),
        rlsContext: {
          actorId: 'actor-001',
          casinoId: 'casino-abc-123',
          staffRole: 'pit_boss',
        },
      });
    },
  ),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are in place
// ---------------------------------------------------------------------------
import { GET } from '@/app/api/v1/shift-intelligence/anomaly-alerts/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/shift-intelligence/anomaly-alerts -- boundary test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAnomalyAlerts.mockResolvedValue(ALERTS_FIXTURE);
    mockSupabase = {};
  });

  it('returns 200 with alerts shape when casino context is set', async () => {
    const request = new NextRequest(
      new URL(
        '/api/v1/shift-intelligence/anomaly-alerts?window_start=2026-03-22T00:00:00Z&window_end=2026-03-22T23:59:59Z',
        'http://localhost:3000',
      ),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: {
        alerts: expect.any(Array),
        gamingDay: '2026-03-22',
        computedAt: expect.any(String),
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
    expect(body.data.alerts).toHaveLength(1);
    expect(body.data.alerts[0].tableId).toBe('table-abc');
  });

  it('passes parsed query params through to service layer', async () => {
    const request = new NextRequest(
      new URL(
        '/api/v1/shift-intelligence/anomaly-alerts?window_start=2026-03-22T00:00:00Z&window_end=2026-03-22T23:59:59Z',
        'http://localhost:3000',
      ),
      { method: 'GET' },
    );

    await GET(request);

    // Verify the service was called with the parsed query
    expect(mockGetAnomalyAlerts).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        window_start: expect.any(String),
        window_end: expect.any(String),
      }),
    );
  });

  it('returns FORBIDDEN when role is not pit_boss or admin', async () => {
    // Re-wire the mock to use a dealer role (not authorized)
    const { withServerAction } = jest.requireMock(
      '@/lib/server-actions/middleware',
    ) as { withServerAction: jest.Mock };

    withServerAction.mockImplementationOnce(
      async (
        _supabase: unknown,
        handler: (
          ctx: Record<string, unknown>,
        ) => Promise<ServiceResult<unknown>>,
      ) => {
        return handler({
          supabase: mockSupabase,
          correlationId: 'test-forbidden-correlation',
          startedAt: Date.now(),
          rlsContext: {
            actorId: 'actor-002',
            casinoId: 'casino-abc-123',
            staffRole: 'dealer',
          },
        });
      },
    );

    const request = new NextRequest(
      new URL(
        '/api/v1/shift-intelligence/anomaly-alerts?window_start=2026-03-22T00:00:00Z&window_end=2026-03-22T23:59:59Z',
        'http://localhost:3000',
      ),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('returns error when service layer throws', async () => {
    mockGetAnomalyAlerts.mockRejectedValueOnce(new Error('RPC timeout'));

    const request = new NextRequest(
      new URL(
        '/api/v1/shift-intelligence/anomaly-alerts?window_start=2026-03-22T00:00:00Z&window_end=2026-03-22T23:59:59Z',
        'http://localhost:3000',
      ),
      { method: 'GET' },
    );

    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
