/** @jest-environment node */

/**
 * Measurement Summary Route Handler -- Boundary Test
 *
 * Tests GET /api/v1/measurement/summary at the HTTP boundary layer.
 * Validates request -> response shape, casino_id scoping from RLS context,
 * role gate enforcement, and error handling.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 * - createMeasurementService: mocked to control service layer output
 *
 * @see MEASUREMENT-POSTURE.md
 */

import { NextRequest } from 'next/server';

import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Fixture: minimal MeasurementSummaryResponse shape
// ---------------------------------------------------------------------------
const SUMMARY_FIXTURE = {
  theoDiscrepancy: {
    totalSlips: 10,
    discrepantSlips: 2,
    discrepancyRate: 0.2,
    totalDiscrepancyCents: 5000,
    avgDiscrepancyPercent: 0.05,
    breakdown: null,
    supportedDimensions: ['pit', 'table'],
  },
  auditCorrelation: {
    totalSlips: 10,
    slipsWithPft: 8,
    slipsWithMtl: 6,
    slipsWithLoyalty: 5,
    fullChainCount: 4,
    fullChainRate: 0.4,
    supportedDimensions: [],
  },
  ratingCoverage: {
    totalSessions: 5,
    avgCoverageRatio: 0.75,
    ratedSeconds: 18000,
    openSeconds: 24000,
    untrackedSeconds: 3000,
    breakdown: null,
    supportedDimensions: ['pit', 'table'],
  },
  loyaltyLiability: {
    totalOutstandingPoints: 50000,
    estimatedMonetaryValueCents: 25000,
    centsPerPoint: 50,
    playerCount: 100,
    snapshotDate: '2026-03-07',
    supportedDimensions: [],
  },
  errors: {},
  filters: {},
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
let mockSupabase: Record<string, unknown>;

const mockGetSummary = jest.fn().mockResolvedValue(SUMMARY_FIXTURE);

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/services/measurement', () => ({
  createMeasurementService: jest.fn(() => ({
    getSummary: mockGetSummary,
  })),
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
import { GET } from '@/app/api/v1/measurement/summary/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/measurement/summary -- boundary test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSummary.mockResolvedValue(SUMMARY_FIXTURE);
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
  });

  it('returns 200 with measurement summary shape when casino context is set', async () => {
    const request = new NextRequest(
      new URL('/api/v1/measurement/summary', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: {
        theoDiscrepancy: expect.objectContaining({
          totalSlips: 10,
          discrepancyRate: 0.2,
        }),
        auditCorrelation: expect.objectContaining({
          totalSlips: 10,
          fullChainRate: 0.4,
        }),
        ratingCoverage: expect.objectContaining({
          totalSessions: 5,
          avgCoverageRatio: 0.75,
        }),
        errors: {},
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('passes casino_id from RLS context to service.getSummary', async () => {
    const request = new NextRequest(
      new URL('/api/v1/measurement/summary', 'http://localhost:3000'),
      { method: 'GET' },
    );

    await GET(request);

    // Verify the service getSummary was called with the casino_id from RLS context
    expect(mockGetSummary).toHaveBeenCalledWith(
      'casino-abc-123',
      expect.any(Object),
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
      new URL('/api/v1/measurement/summary', 'http://localhost:3000'),
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
    mockGetSummary.mockRejectedValueOnce(
      new Error('Database connection error'),
    );

    const request = new NextRequest(
      new URL('/api/v1/measurement/summary', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
