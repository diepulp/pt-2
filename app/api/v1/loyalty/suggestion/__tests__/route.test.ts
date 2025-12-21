/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/loyalty/suggestion
 *
 * Tests GET (suggestion) endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS5 (LoyaltyService Route Handler Tests)
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { GET } from '../route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Mock middleware to bypass auth/RLS in unit tests
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

// Mock loyalty service
jest.mock('@/services/loyalty', () => ({
  createLoyaltyService: jest.fn(() => ({
    evaluateSuggestion: jest.fn().mockResolvedValue({
      suggestedPoints: 150,
      reason: 'session_end',
    }),
  })),
}));

const VALID_RATING_SLIP_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('GET /api/v1/loyalty/suggestion', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with suggestion data', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/suggestion', {
      searchParams: {
        ratingSlipId: VALID_RATING_SLIP_ID,
      },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        suggestedPoints: expect.any(Number),
      }),
    });
  });

  it('validates query params', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/suggestion', {
      searchParams: {
        // Missing required params
      },
    });
    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('accepts valid query params', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/suggestion', {
      searchParams: {
        ratingSlipId: VALID_RATING_SLIP_ID,
      },
    });
    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
  });

  it('accepts optional asOfTs param', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/suggestion', {
      searchParams: {
        ratingSlipId: VALID_RATING_SLIP_ID,
        asOfTs: new Date().toISOString(),
      },
    });
    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
  });
});
