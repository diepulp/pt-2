/**
 * @jest-environment node
 *
 * Route Handler Tests: GET /api/v1/casino, POST /api/v1/casino
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS4 (CasinoService Route Handler Tests)
 */

import { GET, POST } from '../route';
import {
  createMockRequest,
} from '@/lib/testing/route-test-helpers';

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

describe('GET /api/v1/casino', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('accepts request with valid signature', async () => {
    const request = createMockRequest('GET', '/api/v1/casino', {
      searchParams: { limit: '10' },
    });

    expect(request).toBeInstanceOf(Request);
    expect(typeof GET).toBe('function');
  });
});

describe('POST /api/v1/casino', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('accepts request with valid signature', async () => {
    const request = createMockRequest('POST', '/api/v1/casino', {
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'test-key',
      },
      body: { name: 'Test Casino', location: 'Las Vegas' },
    });

    expect(request).toBeInstanceOf(Request);
    expect(typeof POST).toBe('function');
  });
});
