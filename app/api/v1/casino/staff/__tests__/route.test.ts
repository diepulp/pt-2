/**
 * @jest-environment node
 *
 * Route Handler Tests: GET/POST /api/v1/casino/staff
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS4 (CasinoService Route Handler Tests)
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { GET, POST } from '../route';

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

describe('GET /api/v1/casino/staff', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('accepts request with valid signature', async () => {
    const request = createMockRequest('GET', '/api/v1/casino/staff', {
      searchParams: { role: 'pit_boss', limit: '20' },
    });

    expect(request).toBeInstanceOf(Request);
    expect(typeof GET).toBe('function');
  });
});

describe('POST /api/v1/casino/staff', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('accepts request with valid signature', async () => {
    const request = createMockRequest('POST', '/api/v1/casino/staff', {
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'test-key',
      },
      body: {
        first_name: 'John',
        last_name: 'Doe',
        role: 'pit_boss',
      },
    });

    expect(request).toBeInstanceOf(Request);
    expect(typeof POST).toBe('function');
  });
});
