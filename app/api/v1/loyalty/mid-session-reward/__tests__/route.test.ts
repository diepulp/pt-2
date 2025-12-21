/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/loyalty/mid-session-reward
 *
 * Tests POST (mid-session-reward) endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS5 (LoyaltyService Route Handler Tests)
 *
 * Note: This route is a stub - TODO implementation pending.
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { POST } from '../route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

const VALID_PLAYER_ID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_CASINO_ID = '123e4567-e89b-12d3-a456-426614174001';
const VALID_RATING_SLIP_ID = '123e4567-e89b-12d3-a456-426614174002';
const VALID_STAFF_ID = '123e4567-e89b-12d3-a456-426614174003';

describe('POST /api/v1/loyalty/mid-session-reward', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/loyalty/mid-session-reward',
      {
        body: {
          casino_id: VALID_CASINO_ID,
          player_id: VALID_PLAYER_ID,
          rating_slip_id: VALID_RATING_SLIP_ID,
          staff_id: VALID_STAFF_ID,
          points: 100,
        },
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 200 response (stub)', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/loyalty/mid-session-reward',
      {
        headers: {
          'Idempotency-Key': 'test-key-123',
          'Content-Type': 'application/json',
        },
        body: {
          casino_id: VALID_CASINO_ID,
          player_id: VALID_PLAYER_ID,
          rating_slip_id: VALID_RATING_SLIP_ID,
          staff_id: VALID_STAFF_ID,
          points: 100,
        },
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('validates request body', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/loyalty/mid-session-reward',
      {
        headers: {
          'Idempotency-Key': 'test-key-456',
          'Content-Type': 'application/json',
        },
        body: {
          // Missing required fields
        },
      },
    );
    const response = await POST(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('accepts valid input', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/loyalty/mid-session-reward',
      {
        headers: {
          'Idempotency-Key': 'test-key-789',
          'Content-Type': 'application/json',
        },
        body: {
          casino_id: VALID_CASINO_ID,
          player_id: VALID_PLAYER_ID,
          rating_slip_id: VALID_RATING_SLIP_ID,
          staff_id: VALID_STAFF_ID,
          points: 100,
        },
      },
    );
    const response = await POST(request);

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
  });
});
