/**
 * @jest-environment node
 *
 * Recognition Route Handler Contract Tests
 *
 * Tests HTTP boundary layer compliance with ServiceHttpResult envelope.
 * Validates Zod input validation, idempotency enforcement, and error mapping.
 *
 * @see EXEC-051 WS5
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { POST as lookupHandler } from '@/app/api/v1/players/lookup-company/route';
import { POST as activateHandler } from '@/app/api/v1/players/activate-locally/route';
import { POST as redeemHandler } from '@/app/api/v1/players/redeem-loyalty/route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    rpc: jest.fn(),
  }),
}));

// Mock middleware — bypass auth/RLS, return ServiceResult from handler
jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_supabase, handler, _opts) =>
    handler({
      supabase: {
        rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
      },
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'casino-1', actorId: 'actor-1' },
    }),
  ),
}));

// Mock recognition service
jest.mock('@/services/recognition', () => ({
  createRecognitionService: jest.fn(() => ({
    lookupCompany: jest.fn().mockResolvedValue([
      {
        playerId: 'p1',
        fullName: 'John Doe',
        birthDate: '1985-03-15',
        enrolledCasinos: [],
        loyaltyEntitlement: {
          portfolioTotal: 0,
          localBalance: 0,
          localTier: null,
          redeemableHere: 0,
          properties: [],
        },
        activeLocally: false,
        lastCompanyVisit: null,
        hasSisterExclusions: null,
        maxExclusionSeverity: null,
      },
    ]),
    activateLocally: jest.fn().mockResolvedValue({
      activated: true,
      alreadyEnrolled: false,
    }),
    redeemLocally: jest.fn().mockResolvedValue({
      redeemed: true,
      amount: 1000,
      localBalance: 3500,
      portfolioTotal: 11500,
      redeemableHere: 3500,
      ledgerId: 'ledger-123',
    }),
  })),
}));

// === Lookup Company ===

describe('POST /api/v1/players/lookup-company', () => {
  it('exports POST handler', () => {
    expect(typeof lookupHandler).toBe('function');
  });

  it('returns 200 with ServiceHttpResult envelope', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/lookup-company',
      {
        body: { search_term: 'john' },
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const response = await lookupHandler(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
    });
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns 400 for search_term too short', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/lookup-company',
      {
        body: { search_term: 'j' },
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const response = await lookupHandler(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 for missing search_term', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/lookup-company',
      {
        body: {},
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const response = await lookupHandler(request);
    expect(response.status).toBe(400);
  });
});

// === Activate Locally ===

describe('POST /api/v1/players/activate-locally', () => {
  it('exports POST handler', () => {
    expect(typeof activateHandler).toBe('function');
  });

  it('returns 200 with activation result', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/activate-locally',
      {
        body: { player_id: '550e8400-e29b-41d4-a716-446655440000' },
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'test-idempotency-key',
        },
      },
    );

    const response = await activateHandler(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
    });
  });

  it('returns 400 for invalid player_id format', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/activate-locally',
      {
        body: { player_id: 'not-a-uuid' },
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'test-key',
        },
      },
    );

    const response = await activateHandler(request);
    expect(response.status).toBe(400);
  });

  it('rejects request without Idempotency-Key', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/activate-locally',
      {
        body: { player_id: '550e8400-e29b-41d4-a716-446655440000' },
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const response = await activateHandler(request);
    // Should fail at idempotency check
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

// === Redeem Loyalty ===

describe('POST /api/v1/players/redeem-loyalty', () => {
  it('exports POST handler', () => {
    expect(typeof redeemHandler).toBe('function');
  });

  it('returns 200 with redemption result', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/redeem-loyalty',
      {
        body: {
          player_id: '550e8400-e29b-41d4-a716-446655440000',
          amount: 1000,
          reason: 'Comp dinner',
        },
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'test-idempotency-key',
        },
      },
    );

    const response = await redeemHandler(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
    });
  });

  it('returns 400 for negative amount', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/redeem-loyalty',
      {
        body: {
          player_id: '550e8400-e29b-41d4-a716-446655440000',
          amount: -100,
          reason: 'test',
        },
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'test-key',
        },
      },
    );

    const response = await redeemHandler(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 for missing reason', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/redeem-loyalty',
      {
        body: {
          player_id: '550e8400-e29b-41d4-a716-446655440000',
          amount: 100,
        },
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'test-key',
        },
      },
    );

    const response = await redeemHandler(request);
    expect(response.status).toBe(400);
  });

  it('returns 400 for zero amount', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/redeem-loyalty',
      {
        body: {
          player_id: '550e8400-e29b-41d4-a716-446655440000',
          amount: 0,
          reason: 'test',
        },
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'test-key',
        },
      },
    );

    const response = await redeemHandler(request);
    expect(response.status).toBe(400);
  });

  it('rejects request without Idempotency-Key', async () => {
    const request = createMockRequest(
      'POST',
      '/api/v1/players/redeem-loyalty',
      {
        body: {
          player_id: '550e8400-e29b-41d4-a716-446655440000',
          amount: 100,
          reason: 'test',
        },
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const response = await redeemHandler(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
