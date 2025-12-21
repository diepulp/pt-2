/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/loyalty/manual-credit
 *
 * Tests POST (manual-credit) endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS5 (LoyaltyService Route Handler Tests)
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { POST } from '../route';

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
    manualCredit: jest.fn().mockResolvedValue({
      ledgerEntryId: '123e4567-e89b-12d3-a456-426614174000',
      pointsAwarded: 100,
      isExisting: false,
    }),
  })),
}));

const VALID_PLAYER_ID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_CASINO_ID = '123e4567-e89b-12d3-a456-426614174001';
const VALID_STAFF_ID = '123e4567-e89b-12d3-a456-426614174002';
const VALID_IDEMPOTENCY_KEY = '123e4567-e89b-12d3-a456-426614174003';

describe('POST /api/v1/loyalty/manual-credit', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('requires Idempotency-Key header', async () => {
    const request = createMockRequest('POST', '/api/v1/loyalty/manual-credit', {
      body: {
        playerId: VALID_PLAYER_ID,
        casinoId: VALID_CASINO_ID,
        points: 100,
        awardedByStaffId: VALID_STAFF_ID,
        note: 'Service recovery',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 201 on new credit', async () => {
    const request = createMockRequest('POST', '/api/v1/loyalty/manual-credit', {
      headers: {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'Content-Type': 'application/json',
      },
      body: {
        playerId: VALID_PLAYER_ID,
        casinoId: VALID_CASINO_ID,
        points: 100,
        awardedByStaffId: VALID_STAFF_ID,
        note: 'Service recovery',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        ledgerEntryId: expect.any(String),
        pointsAwarded: expect.any(Number),
      }),
    });
  });

  it('validates request body', async () => {
    const request = createMockRequest('POST', '/api/v1/loyalty/manual-credit', {
      headers: {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'Content-Type': 'application/json',
      },
      body: {
        // Missing required fields
      },
    });
    const response = await POST(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('accepts valid input', async () => {
    const request = createMockRequest('POST', '/api/v1/loyalty/manual-credit', {
      headers: {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'Content-Type': 'application/json',
      },
      body: {
        playerId: VALID_PLAYER_ID,
        casinoId: VALID_CASINO_ID,
        points: 100,
        awardedByStaffId: VALID_STAFF_ID,
        note: 'Service recovery',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      },
    });
    const response = await POST(request);

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
  });
});
