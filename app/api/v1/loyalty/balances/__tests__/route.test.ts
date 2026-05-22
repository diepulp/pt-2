/**
 * @jest-environment node
 *
 * Route Handler Tests: /api/v1/loyalty/balances
 *
 * Tests GET (balances) endpoint.
 * Validates HTTP boundary layer compliance with ServiceHttpResult envelope.
 * DEC-3 (EXEC-071 WS3): casino_id REMOVE — service always receives RLS context casino_id.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS5 (LoyaltyService Route Handler Tests)
 *
 * Wired to LoyaltyService.getBalance() per PRD-052 FR-11.
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Service-level mock — casino_id always from RLS context (DEC-3, EXEC-071 WS1)
const mockGetBalance = jest
  .fn()
  .mockResolvedValue({ balance: 1000, tier: 'gold' });
jest.mock('@/services/loyalty', () => ({
  createLoyaltyService: jest.fn(() => ({
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
  })),
}));

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: { casinoId: 'c1', actorId: 'a1', staffRole: 'pit_boss' },
    }),
  ),
}));

// Import route handler AFTER mocks so module-level mock variables are initialized
import { GET } from '../route';

const VALID_PLAYER_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('GET /api/v1/loyalty/balances', () => {
  beforeEach(() => {
    mockGetBalance.mockClear();
    mockGetBalance.mockResolvedValue({ balance: 1000, tier: 'gold' });
  });

  it('exports GET handler', () => {
    expect(typeof GET).toBe('function');
  });

  it('returns 200 with balance data', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/balances', {
      searchParams: { player_id: VALID_PLAYER_ID },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it('validates query params — missing player_id returns 400', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/balances', {
      searchParams: {},
    });
    const response = await GET(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('returns ServiceHttpResult envelope', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/balances', {
      searchParams: { player_id: VALID_PLAYER_ID },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.any(Object),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  // ── DEC-3 (EXEC-071 WS1/WS3): casino_id REMOVE ─────────────────────────────
  // casino_id is never accepted from clients. The service always receives
  // mwCtx.rlsContext!.casinoId regardless of any query param.

  it('DEC-3: does not forward spoofed casino_id query param to service', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/balances', {
      searchParams: {
        player_id: VALID_PLAYER_ID,
        casino_id: 'spoofed-casino-999',
      },
    });
    await GET(request);

    expect(mockGetBalance).toHaveBeenCalledWith(VALID_PLAYER_ID, 'c1');
    expect(mockGetBalance).not.toHaveBeenCalledWith(
      VALID_PLAYER_ID,
      'spoofed-casino-999',
    );
  });

  it('DEC-3: request with spoofed casino_id still returns 200 (param is stripped)', async () => {
    const request = createMockRequest('GET', '/api/v1/loyalty/balances', {
      searchParams: {
        player_id: VALID_PLAYER_ID,
        casino_id: 'spoofed-casino-999',
      },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
