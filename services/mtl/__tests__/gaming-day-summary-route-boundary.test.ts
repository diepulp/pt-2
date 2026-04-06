/** @jest-environment node */

/**
 * MTL Gaming Day Summary Route Handler — Boundary Test
 *
 * Tests GET /api/v1/mtl/gaming-day-summary at the HTTP boundary layer.
 * Validates request → response shape, casino_id passthrough from RLS context,
 * and error handling when the service returns an error result.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 * - createMtlService: mocked to return controlled service responses
 * - assertRole: mocked to avoid role-check side effects
 *
 * @see CONTEXT-ROLLOUT-TEMPLATE.md Step 5
 * @see settings-route-boundary.test.ts (Casino exemplar)
 */

import { NextRequest } from 'next/server';

import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Test UUIDs (valid format for Zod schema validation)
// ---------------------------------------------------------------------------
const TEST_CASINO_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PATRON_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_GAMING_DAY = '2025-01-15';

// ---------------------------------------------------------------------------
// Fixture: minimal MtlGamingDaySummaryDTO shape
// ---------------------------------------------------------------------------
const SUMMARY_FIXTURE = {
  items: [
    {
      casino_id: TEST_CASINO_ID,
      patron_uuid: TEST_PATRON_UUID,
      patron_first_name: 'John',
      patron_last_name: 'Doe',
      patron_date_of_birth: '1985-06-15',
      gaming_day: TEST_GAMING_DAY,
      total_in: 1500000,
      count_in: 3,
      max_single_in: 800000,
      first_in_at: '2025-01-15T10:00:00Z',
      last_in_at: '2025-01-15T14:30:00Z',
      agg_badge_in: 'agg_ctr_met',
      total_out: 700000,
      count_out: 2,
      max_single_out: 450000,
      first_out_at: '2025-01-15T11:00:00Z',
      last_out_at: '2025-01-15T13:00:00Z',
      agg_badge_out: 'none',
      total_volume: 2200000,
      entry_count: 5,
    },
  ],
  next_cursor: null,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockGetGamingDaySummary = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/supabase/rls-context', () => ({
  assertRole: jest.fn(),
}));

jest.mock('@/services/mtl', () => ({
  createMtlService: jest.fn(() => ({
    getGamingDaySummary: mockGetGamingDaySummary,
  })),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn(
    async (
      _supabase: unknown,
      handler: (
        ctx: Record<string, unknown>,
      ) => Promise<ServiceResult<unknown>>,
    ) => {
      return handler({
        supabase: {},
        correlationId: 'test-correlation-id',
        startedAt: Date.now(),
        rlsContext: {
          actorId: 'actor-001',
          casinoId: TEST_CASINO_ID,
          staffRole: 'pit_boss',
        },
      });
    },
  ),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are in place
// ---------------------------------------------------------------------------
import { GET } from '@/app/api/v1/mtl/gaming-day-summary/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/mtl/gaming-day-summary — boundary test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGamingDaySummary.mockResolvedValue(SUMMARY_FIXTURE);
  });

  it('returns 200 with gaming day summary shape', async () => {
    const url = new URL(
      `/api/v1/mtl/gaming-day-summary?casino_id=${TEST_CASINO_ID}&gaming_day=${TEST_GAMING_DAY}`,
      'http://localhost:3000',
    );
    const request = new NextRequest(url, { method: 'GET' });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({
            casino_id: TEST_CASINO_ID,
            patron_uuid: TEST_PATRON_UUID,
            gaming_day: TEST_GAMING_DAY,
            total_in: 1500000,
            agg_badge_in: 'agg_ctr_met',
            total_out: 700000,
            entry_count: 5,
          }),
        ]),
        next_cursor: null,
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('passes casino_id from query params through to service filters', async () => {
    const url = new URL(
      `/api/v1/mtl/gaming-day-summary?casino_id=${TEST_CASINO_ID}&gaming_day=${TEST_GAMING_DAY}`,
      'http://localhost:3000',
    );
    const request = new NextRequest(url, { method: 'GET' });

    await GET(request);

    expect(mockGetGamingDaySummary).toHaveBeenCalledWith(
      expect.objectContaining({
        casino_id: TEST_CASINO_ID,
        gaming_day: TEST_GAMING_DAY,
      }),
    );
  });

  it('returns error when service throws a domain error', async () => {
    // Import DomainError to simulate a service-layer failure
    const { DomainError } = jest.requireActual(
      '@/lib/errors/domain-errors',
    ) as typeof import('@/lib/errors/domain-errors');

    mockGetGamingDaySummary.mockRejectedValue(
      new DomainError('INTERNAL_ERROR', 'Database connection failed'),
    );

    const url = new URL(
      `/api/v1/mtl/gaming-day-summary?casino_id=${TEST_CASINO_ID}&gaming_day=${TEST_GAMING_DAY}`,
      'http://localhost:3000',
    );
    const request = new NextRequest(url, { method: 'GET' });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      code: 'INTERNAL_ERROR',
      error: expect.stringContaining('Database connection failed'),
    });
  });
});
