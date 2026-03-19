/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/loyalty/mid-session-reward
 *
 * Tests POST (mid-session-reward) endpoint.
 * Validates 501 Not Implemented response per PRD §7.4 scope exclusion.
 *
 * Issue: PRD-052 (Loyalty Operator Issuance)
 * Workstream: WS3 (Stub Dispositions)
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { POST } from '../route';

// Mock Supabase client (route calls createClient for withServerAction)
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Mock middleware to bypass auth/RLS — 501 route still runs through withServerAction
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'c1', actorId: 'a1', staffRole: 'pit_boss' },
    }),
  ),
}));

describe('POST /api/v1/loyalty/mid-session-reward', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('returns 501 Not Implemented', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/loyalty/mid-session-reward',
      {
        headers: {
          'Idempotency-Key': 'test-key-123',
          'Content-Type': 'application/json',
        },
        body: {
          casino_id: '123e4567-e89b-12d3-a456-426614174001',
          player_id: '123e4567-e89b-12d3-a456-426614174000',
          rating_slip_id: '123e4567-e89b-12d3-a456-426614174002',
          staff_id: '123e4567-e89b-12d3-a456-426614174003',
          points: 100,
        },
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(501);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe('LOYALTY_NOT_IMPLEMENTED');
    expect(json.requestId).toBeDefined();
  });

  it('returns 501 regardless of request body', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/loyalty/mid-session-reward',
      {
        headers: {
          'Idempotency-Key': 'test-key-456',
          'Content-Type': 'application/json',
        },
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(501);
    const json = await response.json();
    expect(json.code).toBe('LOYALTY_NOT_IMPLEMENTED');
  });

  it('includes error message citing PRD §7.4', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/loyalty/mid-session-reward',
      {
        headers: {
          'Idempotency-Key': 'test-key-789',
          'Content-Type': 'application/json',
        },
      },
    );
    const response = await POST(request);

    const json = await response.json();
    expect(json.error).toContain('PRD §7.4');
    expect(json.error).toContain('/api/v1/loyalty/issue');
  });
});
