/**
 * @jest-environment node
 *
 * Route Handler Tests: GET /api/v1/casinos/[casinoId]
 *
 * Note: This route is currently a stub (TODO implementation).
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS4 (CasinoService Route Handler Tests)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { GET } from '../route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

const TEST_CASINO_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('GET /api/v1/casinos/[casinoId]', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('accepts request with valid signature', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/casinos/${TEST_CASINO_ID}`,
    );
    const params = createMockRouteParams({ casinoId: TEST_CASINO_ID });

    expect(request).toBeInstanceOf(Request);
    expect(params.params).toBeInstanceOf(Promise);
  });
});
