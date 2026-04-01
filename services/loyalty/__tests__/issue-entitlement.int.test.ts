/** @jest-environment node */

/**
 * NOTE: Despite the .int.test.ts naming, this file is a fully mocked unit test.
 * It does not hit the database. The RUN_INTEGRATION_TESTS gate is retained for
 * consistency but all operations are mocked via jest.mock().
 * Reclassified as Unit (Mocked) per LOYALTY-POSTURE.md.
 */

/**
 * issueEntitlement() Integration Tests (PRD-052 WS6)
 *
 * Unit-level tests that mock supabase.rpc() and supabase.from() to verify
 * input mapping, error handling, and catalog validation logic for entitlement issuance.
 *
 * @see PRD-052 §7.3
 * @see EXEC-052 WS6
 */

import { DomainError } from '@/lib/errors/domain-errors';

import * as promoCrud from '../promo/crud';

// === Mock Setup ===

// Mock the reward catalog module (lazy-imported by issueEntitlement)
const mockGetReward = jest.fn();
jest.mock('../reward/crud', () => ({
  getReward: (...args: unknown[]) => mockGetReward(...args),
}));

// Mock promo mappers
jest.mock('../promo/mappers', () => ({
  parseIssueCouponResponse: jest.fn(),
  parsePromoCouponRow: jest.fn(),
  parsePromoProgramRow: jest.fn(),
  parseReplaceCouponResponse: jest.fn(),
  parseVoidCouponResponse: jest.fn(),
  parseInventoryResponse: jest.fn(),
  toErrorShape: jest.fn((err: unknown) => {
    if (err instanceof Error) return { message: err.message };
    return { message: String(err) };
  }),
}));

import * as promoMappers from '../promo/mappers';

// === Test Fixtures ===

const PLAYER_ID = '11111111-1111-1111-1111-111111111111';
const REWARD_ID = '22222222-2222-2222-2222-222222222222';
const IDEMPOTENCY_KEY = '44444444-4444-4444-4444-444444444444';
const PROGRAM_ID = '55555555-5555-5555-5555-555555555555';

function makeEntitlementReward(overrides: Record<string, unknown> = {}) {
  return {
    id: REWARD_ID,
    casinoId: 'casino-uuid',
    code: 'ENT-MATCHPLAY-25',
    family: 'entitlement',
    kind: 'match_play',
    name: '$25 Match Play',
    isActive: true,
    fulfillment: 'coupon',
    metadata: {
      face_value_cents: 2500,
      instrument_type: 'match_play',
      match_wager_cents: 2500,
    },
    uiTags: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    pricePoints: null,
    entitlementTiers: [],
    limits: [],
    eligibility: null,
    ...overrides,
  };
}

const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';

(RUN_INTEGRATION ? describe : describe.skip)('issueEntitlement', () => {
  const mockRpc = jest.fn();
  const mockFrom = jest.fn();
  const mockSelect = jest.fn();
  const mockEq = jest.fn();
  const mockLimit = jest.fn();
  const mockMaybeSingle = jest.fn();

  const supabase = {
    rpc: mockRpc,
    from: mockFrom,
  } as unknown as Parameters<typeof promoCrud.issueEntitlement>[0];

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup chained query methods for promo_program lookup
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({
      eq: mockEq,
      limit: mockLimit,
      maybeSingle: mockMaybeSingle,
    });
    mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle });
  });

  it('issues entitlement and returns result with catalog context on happy path', async () => {
    // Arrange: reward exists, active, family=entitlement, metadata complete
    mockGetReward.mockResolvedValue(makeEntitlementReward());

    // promo_program lookup returns active program
    mockMaybeSingle.mockResolvedValue({
      data: { id: PROGRAM_ID },
      error: null,
    });

    // RPC returns coupon issuance result
    const rpcResponse = {
      coupon_id: 'coupon-uuid-1',
      validation_number: 'VAL-12345',
      status: 'issued',
      face_value_amount: 25,
      issued_at: '2026-03-19T10:00:00Z',
      expires_at: null,
      is_existing: false,
    };
    mockRpc.mockResolvedValue({ data: rpcResponse, error: null });
    (promoMappers.parseIssueCouponResponse as jest.Mock).mockReturnValue({
      coupon: {
        id: 'coupon-uuid-1',
        validationNumber: 'VAL-12345',
        status: 'issued',
        faceValueAmount: 25,
        requiredMatchWagerAmount: 25,
        issuedAt: '2026-03-19T10:00:00Z',
        expiresAt: null,
        playerId: PLAYER_ID,
        visitId: null,
      },
      isExisting: false,
    });

    // Act
    const result = await promoCrud.issueEntitlement(supabase, {
      playerId: PLAYER_ID,
      rewardId: REWARD_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    // Assert: rpc_issue_promo_coupon called
    expect(mockRpc).toHaveBeenCalledWith('rpc_issue_promo_coupon', {
      p_promo_program_id: PROGRAM_ID,
      p_validation_number: expect.any(String),
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_player_id: PLAYER_ID,
      p_visit_id: undefined,
    });

    // Assert: result enriched with catalog context
    expect(result.family).toBe('entitlement');
    expect(result.couponId).toBe('coupon-uuid-1');
    expect(result.faceValueCents).toBe(2500);
    expect(result.matchWagerCents).toBe(2500);
    expect(result.rewardId).toBe(REWARD_ID);
    expect(result.rewardCode).toBe('ENT-MATCHPLAY-25');
    expect(result.rewardName).toBe('$25 Match Play');
    expect(result.isExisting).toBe(false);
  });

  it('throws CATALOG_CONFIG_INVALID when face_value_cents is missing from metadata', async () => {
    mockGetReward.mockResolvedValue(
      makeEntitlementReward({
        metadata: {
          // face_value_cents missing
          instrument_type: 'match_play',
        },
      }),
    );

    await expect(
      promoCrud.issueEntitlement(supabase, {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_CONFIG_INVALID' });
  });

  it('throws CATALOG_CONFIG_INVALID when instrument_type is missing from metadata', async () => {
    mockGetReward.mockResolvedValue(
      makeEntitlementReward({
        metadata: {
          face_value_cents: 2500,
          // instrument_type missing
        },
      }),
    );

    await expect(
      promoCrud.issueEntitlement(supabase, {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_CONFIG_INVALID' });
  });

  it('throws CATALOG_CONFIG_INVALID when no active promo program found', async () => {
    mockGetReward.mockResolvedValue(makeEntitlementReward());

    // promo_program lookup returns null (no active program)
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(
      promoCrud.issueEntitlement(supabase, {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_CONFIG_INVALID' });
  });

  it('throws REWARD_NOT_FOUND when reward does not exist', async () => {
    mockGetReward.mockResolvedValue(null);

    await expect(
      promoCrud.issueEntitlement(supabase, {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({ code: 'REWARD_NOT_FOUND' });
  });

  it('throws REWARD_INACTIVE when reward is not active', async () => {
    mockGetReward.mockResolvedValue(makeEntitlementReward({ isActive: false }));

    await expect(
      promoCrud.issueEntitlement(supabase, {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({ code: 'REWARD_INACTIVE' });
  });

  it('throws REWARD_FAMILY_MISMATCH when family is not entitlement', async () => {
    mockGetReward.mockResolvedValue(
      makeEntitlementReward({ family: 'points_comp' }),
    );

    await expect(
      promoCrud.issueEntitlement(supabase, {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({ code: 'REWARD_FAMILY_MISMATCH' });
  });

  it('all errors thrown are DomainError instances', async () => {
    mockGetReward.mockResolvedValue(null);

    await expect(
      promoCrud.issueEntitlement(supabase, {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('resolves promo_type correctly for free_play instrument type', async () => {
    mockGetReward.mockResolvedValue(
      makeEntitlementReward({
        code: 'ENT-FREEPLAY-50',
        name: '$50 Free Play',
        metadata: {
          face_value_cents: 5000,
          instrument_type: 'free_play',
          match_wager_cents: null,
        },
      }),
    );

    // promo_program lookup returns active program
    mockMaybeSingle.mockResolvedValue({
      data: { id: PROGRAM_ID },
      error: null,
    });

    mockRpc.mockResolvedValue({
      data: {
        coupon_id: 'coupon-uuid-2',
        validation_number: 'VAL-67890',
        status: 'issued',
        face_value_amount: 50,
        issued_at: '2026-03-19T10:00:00Z',
        expires_at: null,
        is_existing: false,
      },
      error: null,
    });
    (promoMappers.parseIssueCouponResponse as jest.Mock).mockReturnValue({
      coupon: {
        id: 'coupon-uuid-2',
        validationNumber: 'VAL-67890',
        status: 'issued',
        faceValueAmount: 50,
        requiredMatchWagerAmount: 0,
        issuedAt: '2026-03-19T10:00:00Z',
        expiresAt: null,
        playerId: PLAYER_ID,
        visitId: null,
      },
      isExisting: false,
    });

    await promoCrud.issueEntitlement(supabase, {
      playerId: PLAYER_ID,
      rewardId: REWARD_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    // Verify promo_type filter uses 'free_play' for free_play instrument_type
    expect(mockFrom).toHaveBeenCalledWith('promo_program');
    expect(mockEq).toHaveBeenCalledWith('promo_type', 'free_play');
  });
});
