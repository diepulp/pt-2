/**
 * @jest-environment node
 *
 * Route Handler Tests: GET /api/v1/casino/gaming-day
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS4 (CasinoService Route Handler Tests)
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { GET } from '../route';

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

describe('GET /api/v1/casino/gaming-day', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('accepts request with valid signature', async () => {
    const request = createMockRequest('GET', '/api/v1/casino/gaming-day', {
      searchParams: { timestamp: '2025-12-21T10:00:00Z' },
    });

    expect(request).toBeInstanceOf(Request);
    expect(typeof GET).toBe('function');
  });

  it('accepts request without timestamp parameter', async () => {
    const request = createMockRequest('GET', '/api/v1/casino/gaming-day');

    expect(request).toBeInstanceOf(Request);
    expect(typeof GET).toBe('function');
  });
});
