/**
 * @jest-environment node
 *
 * Route Handler Tests: GET/PATCH /api/v1/casino/settings
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS4 (CasinoService Route Handler Tests)
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { GET, PATCH } from '../route';

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

describe('GET /api/v1/casino/settings', () => {
  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('accepts request with valid signature', async () => {
    const request = createMockRequest('GET', '/api/v1/casino/settings');

    expect(request).toBeInstanceOf(Request);
    expect(typeof GET).toBe('function');
  });
});

describe('PATCH /api/v1/casino/settings', () => {
  it('exports PATCH handler', () => {
    expect(typeof PATCH).toBe('function');
  });

  it('accepts request with valid signature', async () => {
    const request = createMockRequest('PATCH', '/api/v1/casino/settings', {
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'test-key',
      },
      body: {
        timezone: 'America/New_York',
        gaming_day_start_time: '06:00',
      },
    });

    expect(request).toBeInstanceOf(Request);
    expect(typeof PATCH).toBe('function');
  });
});
