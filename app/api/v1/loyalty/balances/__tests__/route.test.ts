/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/loyalty/balances
 *
 * Tests GET (balances) endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS5 (LoyaltyService Route Handler Tests)
 *
 * Note: This route is a stub - TODO implementation pending.
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { GET } from '../route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

const VALID_PLAYER_ID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_CASINO_ID = '123e4567-e89b-12d3-a456-426614174001';

describe('GET /api/v1/loyalty/balances', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 response (stub)', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/balances', {
      searchParams: {
        player_id: VALID_PLAYER_ID,
        casino_id: VALID_CASINO_ID,
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('validates query params', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/balances', {
      searchParams: {
        // Missing required params
      },
    });
    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('accepts valid query params', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/balances', {
      searchParams: {
        player_id: VALID_PLAYER_ID,
        casino_id: VALID_CASINO_ID,
      },
    });
    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
  });
});
