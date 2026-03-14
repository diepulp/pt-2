/** @jest-environment node */

/**
 * Casino Settings Route Handler — Boundary Test
 *
 * Tests GET /api/v1/casino/settings at the HTTP boundary layer.
 * Validates request → response shape, casino_id passthrough from RLS context,
 * and error handling when middleware returns an error result.
 *
 * Mock strategy:
 * - withServerAction: intercepted to inject controlled MiddlewareContext
 * - createClient: mocked to avoid next/headers cookies() in Jest
 *
 * @see EXEC-SLICE-ONE-testing-posture.md WS3
 */

import { NextRequest } from 'next/server';

import type { ServiceResult } from '@/lib/http/service-response';

// ---------------------------------------------------------------------------
// Track .eq() calls to assert casino_id passthrough
// ---------------------------------------------------------------------------
const eqSpy = jest.fn();

function createChainableSupabase(mockData: unknown, mockError: unknown = null) {
  const single = jest
    .fn()
    .mockResolvedValue({ data: mockData, error: mockError });
  const eq = jest.fn().mockReturnValue({ single });
  const select = jest.fn().mockReturnValue({ eq });

  // Record eq calls on the shared spy so assertions can inspect them
  eq.mockImplementation((...args: unknown[]) => {
    eqSpy(...args);
    return { single };
  });

  return {
    from: jest.fn().mockReturnValue({ select }),
    _internals: { select, eq, single },
  };
}

// ---------------------------------------------------------------------------
// Fixture: minimal CasinoSettingsWithAlertsDTO shape
// ---------------------------------------------------------------------------
const SETTINGS_FIXTURE = {
  id: 'settings-001',
  casino_id: 'casino-abc-123',
  gaming_day_start_time: '06:00',
  timezone: 'America/Los_Angeles',
  watchlist_floor: 300000,
  ctr_threshold: 1000000,
  alert_thresholds: {
    table_idle: { enabled: true, warn_minutes: 30, critical_minutes: 60 },
    slip_duration: { enabled: true, warn_hours: 6, critical_hours: 12 },
    pause_duration: { enabled: true, warn_minutes: 30 },
    drop_anomaly: { enabled: true, mad_multiplier: 3, fallback_percent: 50 },
    hold_deviation: {
      enabled: false,
      deviation_pp: 10,
      extreme_low: -5,
      extreme_high: 40,
    },
    promo_issuance_spike: {
      enabled: true,
      mad_multiplier: 3,
      fallback_percent: 100,
    },
    promo_void_rate: { enabled: true, warn_percent: 5 },
    outstanding_aging: {
      enabled: true,
      max_age_hours: 24,
      max_value_dollars: 2000,
      max_coupon_count: 25,
    },
    baseline: { window_days: 7, method: 'median_mad', min_history_days: 3 },
  },
  updated_at: '2025-06-01T00:00:00Z',
  promo_require_exact_match: true,
  promo_allow_anonymous_issuance: false,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
let mockSupabase: ReturnType<typeof createChainableSupabase>;

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
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
      // Inject our controlled context — the handler receives MiddlewareContext
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
import { GET } from '@/app/api/v1/casino/settings/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/casino/settings — boundary test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eqSpy.mockClear();
    // Default: happy-path supabase returning valid settings
    mockSupabase = createChainableSupabase(SETTINGS_FIXTURE);
  });

  it('returns 200 with settings shape when casino context is set', async () => {
    const request = new NextRequest(
      new URL('/api/v1/casino/settings', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: {
        id: SETTINGS_FIXTURE.id,
        casino_id: SETTINGS_FIXTURE.casino_id,
        gaming_day_start_time: SETTINGS_FIXTURE.gaming_day_start_time,
        timezone: SETTINGS_FIXTURE.timezone,
        watchlist_floor: SETTINGS_FIXTURE.watchlist_floor,
        ctr_threshold: SETTINGS_FIXTURE.ctr_threshold,
        alert_thresholds: expect.objectContaining({
          table_idle: expect.objectContaining({ enabled: true }),
        }),
        updated_at: SETTINGS_FIXTURE.updated_at,
        promo_require_exact_match: true,
        promo_allow_anonymous_issuance: false,
      },
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('passes casino_id from RLS context through to query', async () => {
    const request = new NextRequest(
      new URL('/api/v1/casino/settings', 'http://localhost:3000'),
      { method: 'GET' },
    );

    await GET(request);

    // Verify the query chain was: from('casino_settings').select(...).eq('casino_id', '<RLS casino_id>').single()
    expect(mockSupabase.from).toHaveBeenCalledWith('casino_settings');
    expect(eqSpy).toHaveBeenCalledWith('casino_id', 'casino-abc-123');
  });

  it('returns error when no casino context (PGRST116 — settings not found)', async () => {
    // Simulate PGRST116 — the "no rows" Supabase error that occurs when
    // casino_settings doesn't exist for the derived casino_id.
    mockSupabase = createChainableSupabase(null, {
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
    });

    // Re-wire the mock to use the new mockSupabase
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
          correlationId: 'test-err-correlation',
          startedAt: Date.now(),
          rlsContext: {
            actorId: 'actor-001',
            casinoId: 'casino-no-settings',
            staffRole: 'pit_boss',
          },
        });
      },
    );

    const request = new NextRequest(
      new URL('/api/v1/casino/settings', 'http://localhost:3000'),
      { method: 'GET' },
    );

    const response = await GET(request);
    const body = await response.json();

    // DomainError('CASINO_SETTINGS_NOT_FOUND') maps to 404 via domain-errors
    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      ok: false,
      code: 'CASINO_SETTINGS_NOT_FOUND',
      error: expect.stringContaining('not found'),
    });
  });
});
