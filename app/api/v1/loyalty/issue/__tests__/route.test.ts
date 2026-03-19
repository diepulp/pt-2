/**
 * @jest-environment node
 *
 * Route Handler Tests: POST /api/v1/loyalty/issue
 *
 * Tests the unified issuance endpoint for role gating, input validation,
 * family dispatch, and error mapping.
 *
 * @see PRD-052 §5.1 FR-5
 * @see EXEC-052 WS6
 */

import { createMockRequest } from '@/lib/testing/route-test-helpers';

import { POST } from '../route';

// === Mock Setup ===

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}));

// Mock reward lookup (used by route to resolve family)
const mockGetReward = jest.fn();
jest.mock('@/services/loyalty/reward/crud', () => ({
  getReward: (...args: unknown[]) => mockGetReward(...args),
}));

// Mock loyalty service
const mockIssueComp = jest.fn();
jest.mock('@/services/loyalty', () => ({
  createLoyaltyService: jest.fn(() => ({
    issueComp: mockIssueComp,
  })),
}));

// Mock promo service
const mockIssueEntitlement = jest.fn();
jest.mock('@/services/loyalty/promo', () => ({
  createPromoService: jest.fn(() => ({
    issueEntitlement: mockIssueEntitlement,
  })),
}));

// Mock middleware to bypass auth/RLS in unit tests — default to pit_boss role
let mockRlsContext: Record<string, unknown> = {
  casinoId: 'casino-1',
  actorId: 'actor-1',
  staffRole: 'pit_boss',
};

jest.mock('@/lib/server-actions/middleware', () => ({
  withServerAction: jest.fn((_, handler) =>
    handler({
      supabase: {},
      correlationId: 'test-correlation-id',
      rlsContext: mockRlsContext,
    }),
  ),
}));

// === Test Fixtures ===

const VALID_PLAYER_ID = '11111111-1111-1111-1111-111111111111';
const VALID_REWARD_ID = '22222222-2222-2222-2222-222222222222';
const VALID_IDEMPOTENCY_KEY = '44444444-4444-4444-4444-444444444444';

describe('POST /api/v1/loyalty/issue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to pit_boss role by default
    mockRlsContext = {
      casinoId: 'casino-1',
      actorId: 'actor-1',
      staffRole: 'pit_boss',
    };
  });

  it('exports POST handler', () => {
    expect(typeof POST).toBe('function');
  });

  it('returns 201 on successful new comp issuance', async () => {
    // Mock reward lookup: points_comp family
    mockGetReward.mockResolvedValue({
      id: VALID_REWARD_ID,
      family: 'points_comp',
      isActive: true,
      name: 'Dinner Comp',
      code: 'COMP-DINNER',
    });

    // Mock issueComp result
    mockIssueComp.mockResolvedValue({
      family: 'points_comp',
      ledgerId: 'ledger-uuid-1',
      pointsDebited: 100,
      balanceBefore: 500,
      balanceAfter: 400,
      rewardId: VALID_REWARD_ID,
      rewardCode: 'COMP-DINNER',
      rewardName: 'Dinner Comp',
      faceValueCents: 5000,
      isExisting: false,
      issuedAt: '2026-03-19T10:00:00Z',
    });

    const request = createMockRequest('POST', '/api/v1/loyalty/issue', {
      headers: {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'Content-Type': 'application/json',
      },
      body: {
        player_id: VALID_PLAYER_ID,
        reward_id: VALID_REWARD_ID,
        idempotency_key: VALID_IDEMPOTENCY_KEY,
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      ok: true,
      code: 'OK',
      data: expect.objectContaining({
        family: 'points_comp',
        ledgerId: 'ledger-uuid-1',
        pointsDebited: 100,
      }),
    });
  });

  it('returns 400 when player_id is missing', async () => {
    const request = createMockRequest('POST', '/api/v1/loyalty/issue', {
      headers: {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'Content-Type': 'application/json',
      },
      body: {
        // player_id missing
        reward_id: VALID_REWARD_ID,
        idempotency_key: VALID_IDEMPOTENCY_KEY,
      },
    });

    const response = await POST(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it('returns 400 when Idempotency-Key header is missing', async () => {
    const request = createMockRequest('POST', '/api/v1/loyalty/issue', {
      headers: {
        'Content-Type': 'application/json',
        // No Idempotency-Key header
      },
      body: {
        player_id: VALID_PLAYER_ID,
        reward_id: VALID_REWARD_ID,
        idempotency_key: VALID_IDEMPOTENCY_KEY,
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 403 when role is not pit_boss or admin', async () => {
    // Override to dealer role
    mockRlsContext = {
      casinoId: 'casino-1',
      actorId: 'actor-1',
      staffRole: 'dealer',
    };

    mockGetReward.mockResolvedValue({
      id: VALID_REWARD_ID,
      family: 'points_comp',
      isActive: true,
    });

    const request = createMockRequest('POST', '/api/v1/loyalty/issue', {
      headers: {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'Content-Type': 'application/json',
      },
      body: {
        player_id: VALID_PLAYER_ID,
        reward_id: VALID_REWARD_ID,
        idempotency_key: VALID_IDEMPOTENCY_KEY,
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 403 when role is cashier', async () => {
    // Override to cashier role
    mockRlsContext = {
      casinoId: 'casino-1',
      actorId: 'actor-1',
      staffRole: 'cashier',
    };

    mockGetReward.mockResolvedValue({
      id: VALID_REWARD_ID,
      family: 'points_comp',
      isActive: true,
    });

    const request = createMockRequest('POST', '/api/v1/loyalty/issue', {
      headers: {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'Content-Type': 'application/json',
      },
      body: {
        player_id: VALID_PLAYER_ID,
        reward_id: VALID_REWARD_ID,
        idempotency_key: VALID_IDEMPOTENCY_KEY,
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
  });

  it('accepts admin role for issuance', async () => {
    // Override to admin role
    mockRlsContext = {
      casinoId: 'casino-1',
      actorId: 'actor-1',
      staffRole: 'admin',
    };

    mockGetReward.mockResolvedValue({
      id: VALID_REWARD_ID,
      family: 'points_comp',
      isActive: true,
      name: 'Dinner Comp',
      code: 'COMP-DINNER',
    });

    mockIssueComp.mockResolvedValue({
      family: 'points_comp',
      ledgerId: 'ledger-uuid-2',
      pointsDebited: 100,
      balanceBefore: 500,
      balanceAfter: 400,
      rewardId: VALID_REWARD_ID,
      rewardCode: 'COMP-DINNER',
      rewardName: 'Dinner Comp',
      faceValueCents: 5000,
      isExisting: false,
      issuedAt: '2026-03-19T10:00:00Z',
    });

    const request = createMockRequest('POST', '/api/v1/loyalty/issue', {
      headers: {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'Content-Type': 'application/json',
      },
      body: {
        player_id: VALID_PLAYER_ID,
        reward_id: VALID_REWARD_ID,
        idempotency_key: VALID_IDEMPOTENCY_KEY,
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
  });

  it('returns 404 when reward is not found', async () => {
    // Mock reward lookup returns null
    mockGetReward.mockResolvedValue(null);

    const request = createMockRequest('POST', '/api/v1/loyalty/issue', {
      headers: {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'Content-Type': 'application/json',
      },
      body: {
        player_id: VALID_PLAYER_ID,
        reward_id: VALID_REWARD_ID,
        idempotency_key: VALID_IDEMPOTENCY_KEY,
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
  });

  it('validates request body — missing reward_id returns 400', async () => {
    const request = createMockRequest('POST', '/api/v1/loyalty/issue', {
      headers: {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'Content-Type': 'application/json',
      },
      body: {
        player_id: VALID_PLAYER_ID,
        // reward_id missing
        idempotency_key: VALID_IDEMPOTENCY_KEY,
      },
    });

    const response = await POST(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it('dispatches to issueEntitlement for entitlement family', async () => {
    mockGetReward.mockResolvedValue({
      id: VALID_REWARD_ID,
      family: 'entitlement',
      isActive: true,
      name: '$25 Match Play',
      code: 'ENT-MP-25',
    });

    mockIssueEntitlement.mockResolvedValue({
      family: 'entitlement',
      couponId: 'coupon-uuid-1',
      validationNumber: 'VAL-123',
      faceValueCents: 2500,
      matchWagerCents: 2500,
      status: 'issued',
      expiresAt: null,
      rewardId: VALID_REWARD_ID,
      rewardCode: 'ENT-MP-25',
      rewardName: '$25 Match Play',
      isExisting: false,
      issuedAt: '2026-03-19T10:00:00Z',
    });

    const request = createMockRequest('POST', '/api/v1/loyalty/issue', {
      headers: {
        'Idempotency-Key': VALID_IDEMPOTENCY_KEY,
        'Content-Type': 'application/json',
      },
      body: {
        player_id: VALID_PLAYER_ID,
        reward_id: VALID_REWARD_ID,
        idempotency_key: VALID_IDEMPOTENCY_KEY,
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.family).toBe('entitlement');
    expect(mockIssueEntitlement).toHaveBeenCalled();
  });
});
