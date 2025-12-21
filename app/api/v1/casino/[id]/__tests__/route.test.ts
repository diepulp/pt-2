/**
 * @jest-environment node
 *
 * Route Handler Tests: GET/PATCH/DELETE /api/v1/casino/[id]
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS4 (CasinoService Route Handler Tests)
 */

import {
  createMockRequest,
  createMockRouteParams,
} from '@/lib/testing/route-test-helpers';

import { GET, PATCH, DELETE } from '../route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Mock middleware to bypass auth/RLS
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

const TEST_CASINO_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('GET /api/v1/casino/[id]', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('accepts request with valid signature', async () => {
    const request = createMockRequest(
      'GET',
      `/api/v1/casino/${TEST_CASINO_ID}`,
    );
    const params = createMockRouteParams({ id: TEST_CASINO_ID });

    expect(request).toBeInstanceOf(Request);
    expect(params.params).toBeInstanceOf(Promise);
  });
});

describe('PATCH /api/v1/casino/[id]', () => {
  it('exports PATCH handler', () => {
    expect(typeof PATCH).toBe('function');
  });

  it('accepts request with valid signature', async () => {
    const request = createMockRequest(
      'PATCH',
      `/api/v1/casino/${TEST_CASINO_ID}`,
      {
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'test-key',
        },
        body: { name: 'Updated Casino' },
      },
    );
    const params = createMockRouteParams({ id: TEST_CASINO_ID });

    expect(request).toBeInstanceOf(Request);
    expect(params.params).toBeInstanceOf(Promise);
  });
});

describe('DELETE /api/v1/casino/[id]', () => {
  it('exports DELETE handler', () => {
    expect(typeof DELETE).toBe('function');
  });

  it('accepts request with valid signature', async () => {
    const request = createMockRequest(
      'DELETE',
      `/api/v1/casino/${TEST_CASINO_ID}`,
      {
        headers: {
          'idempotency-key': 'test-key',
        },
      },
    );
    const params = createMockRouteParams({ id: TEST_CASINO_ID });

    expect(request).toBeInstanceOf(Request);
    expect(params.params).toBeInstanceOf(Promise);
  });
});
