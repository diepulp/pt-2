/** @jest-environment node */

/**
 * issueComp() Integration Tests (PRD-052 WS6)
 *
 * Unit-level tests that mock supabase.rpc() and supabase.from() to verify
 * input mapping, error handling, and catalog validation logic.
 *
 * @see PRD-052 §5.1 FR-5
 * @see EXEC-052 WS6
 */

import { DomainError } from '@/lib/errors/domain-errors';

import * as crud from '../crud';

// === Mock Setup ===

// Mock the reward catalog module (lazy-imported by issueComp)
const mockGetReward = jest.fn();
jest.mock('../reward/crud', () => ({
  getReward: (...args: unknown[]) => mockGetReward(...args),
}));

// Mock mappers used by issueComp (via redeem path)
jest.mock('../mappers', () => ({
  parseAccrueOnCloseResponse: jest.fn(),
  parseRedeemResponse: jest.fn(),
  parseManualCreditResponse: jest.fn(),
  parseApplyPromotionResponse: jest.fn(),
  parseSessionSuggestionResponse: jest.fn(),
  toPlayerLoyaltyDTOOrNull: jest.fn(),
  parseLedgerPageResponse: jest.fn(),
}));

// Mock schema decoder (used by getLedger, not issueComp, but needed to avoid import errors)
jest.mock('../schemas', () => ({
  decodeLedgerCursor: jest.fn(),
}));

// Import mappers after mock setup
import * as mappers from '../mappers';

// === Test Fixtures ===

const PLAYER_ID = '11111111-1111-1111-1111-111111111111';
const REWARD_ID = '22222222-2222-2222-2222-222222222222';
const CASINO_ID = '33333333-3333-3333-3333-333333333333';
const IDEMPOTENCY_KEY = '44444444-4444-4444-4444-444444444444';

function makeRewardDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: REWARD_ID,
    casinoId: CASINO_ID,
    code: 'COMP-DINNER',
    family: 'points_comp',
    kind: 'food_beverage',
    name: 'Dinner Comp',
    isActive: true,
    fulfillment: 'comp_slip',
    metadata: { face_value_cents: 5000 },
    uiTags: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    pricePoints: {
      rewardId: REWARD_ID,
      casinoId: CASINO_ID,
      pointsCost: 100,
      allowOverdraw: false,
    },
    entitlementTiers: [],
    limits: [],
    eligibility: null,
    ...overrides,
  };
}

describe('issueComp', () => {
  const mockRpc = jest.fn();
  const mockFrom = jest.fn();
  const mockSelect = jest.fn();
  const mockEq = jest.fn();
  const mockMaybeSingle = jest.fn();

  const supabase = {
    rpc: mockRpc,
    from: mockFrom,
  } as unknown as Parameters<typeof crud.issueComp>[0];

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup chained query methods for getBalance
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ eq: mockEq, maybeSingle: mockMaybeSingle });
  });

  it('calls rpc_redeem with correct params on happy path', async () => {
    // Arrange: reward exists, is active, family=points_comp, balance sufficient
    mockGetReward.mockResolvedValue(makeRewardDetail());

    // Balance query returns sufficient balance
    mockMaybeSingle.mockResolvedValue({
      data: {
        player_id: PLAYER_ID,
        casino_id: CASINO_ID,
        current_balance: 500,
        tier: 'gold',
        preferences: {},
        updated_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    (mappers.toPlayerLoyaltyDTOOrNull as jest.Mock).mockReturnValue({
      playerId: PLAYER_ID,
      casinoId: CASINO_ID,
      currentBalance: 500,
      tier: 'gold',
      preferences: {},
      updatedAt: '2026-01-01T00:00:00Z',
    });

    // RPC returns successful debit
    const rpcResponse = {
      ledger_id: 'ledger-uuid-1',
      points_delta: -100,
      balance_before: 500,
      balance_after: 400,
      overdraw_applied: false,
      is_existing: false,
    };
    mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });
    (mappers.parseRedeemResponse as jest.Mock).mockReturnValue({
      ledgerId: 'ledger-uuid-1',
      pointsDelta: -100,
      balanceBefore: 500,
      balanceAfter: 400,
      overdrawApplied: false,
      isExisting: false,
    });

    // Act
    const result = await crud.issueComp(
      supabase,
      {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      },
      CASINO_ID,
    );

    // Assert: rpc_redeem called with correct params
    expect(mockRpc).toHaveBeenCalledWith('rpc_redeem', {
      p_player_id: PLAYER_ID,
      p_points: 100,
      p_note: 'Comp: Dinner Comp',
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_allow_overdraw: false,
      p_reward_id: REWARD_ID,
      p_reference: `reward_catalog:${REWARD_ID}:COMP-DINNER`,
    });

    // Assert: result enriched with catalog context
    expect(result.family).toBe('points_comp');
    expect(result.ledgerId).toBe('ledger-uuid-1');
    expect(result.pointsDebited).toBe(100);
    expect(result.balanceBefore).toBe(500);
    expect(result.balanceAfter).toBe(400);
    expect(result.rewardId).toBe(REWARD_ID);
    expect(result.rewardCode).toBe('COMP-DINNER');
    expect(result.rewardName).toBe('Dinner Comp');
    expect(result.faceValueCents).toBe(5000);
    expect(result.isExisting).toBe(false);
    expect(result.issuedAt).toBeDefined();
  });

  it('uses custom note when provided', async () => {
    mockGetReward.mockResolvedValue(makeRewardDetail());
    mockMaybeSingle.mockResolvedValue({
      data: {
        player_id: PLAYER_ID,
        casino_id: CASINO_ID,
        current_balance: 500,
        tier: 'gold',
        preferences: {},
        updated_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    (mappers.toPlayerLoyaltyDTOOrNull as jest.Mock).mockReturnValue({
      currentBalance: 500,
    });
    mockRpc.mockResolvedValue({
      data: [
        {
          ledger_id: 'ledger-uuid-1',
          points_delta: -100,
          balance_before: 500,
          balance_after: 400,
          overdraw_applied: false,
          is_existing: false,
        },
      ],
      error: null,
    });
    (mappers.parseRedeemResponse as jest.Mock).mockReturnValue({
      ledgerId: 'ledger-uuid-1',
      pointsDelta: -100,
      balanceBefore: 500,
      balanceAfter: 400,
      overdrawApplied: false,
      isExisting: false,
    });

    await crud.issueComp(
      supabase,
      {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        note: 'VIP dinner comp',
      },
      CASINO_ID,
    );

    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_redeem',
      expect.objectContaining({ p_note: 'VIP dinner comp' }),
    );
  });

  it('throws REWARD_INACTIVE when reward is not active', async () => {
    mockGetReward.mockResolvedValue(makeRewardDetail({ isActive: false }));
    mockMaybeSingle.mockResolvedValue({
      data: {
        player_id: PLAYER_ID,
        casino_id: CASINO_ID,
        current_balance: 500,
        tier: null,
        preferences: {},
        updated_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    (mappers.toPlayerLoyaltyDTOOrNull as jest.Mock).mockReturnValue({
      currentBalance: 500,
    });

    await expect(
      crud.issueComp(
        supabase,
        {
          playerId: PLAYER_ID,
          rewardId: REWARD_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        CASINO_ID,
      ),
    ).rejects.toMatchObject({ code: 'REWARD_INACTIVE' });
  });

  it('throws REWARD_NOT_FOUND when reward does not exist', async () => {
    mockGetReward.mockResolvedValue(null);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      crud.issueComp(
        supabase,
        {
          playerId: PLAYER_ID,
          rewardId: REWARD_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        CASINO_ID,
      ),
    ).rejects.toMatchObject({ code: 'REWARD_NOT_FOUND' });
  });

  it('throws INSUFFICIENT_BALANCE when balance is insufficient', async () => {
    mockGetReward.mockResolvedValue(makeRewardDetail());
    mockMaybeSingle.mockResolvedValue({
      data: {
        player_id: PLAYER_ID,
        casino_id: CASINO_ID,
        current_balance: 50,
        tier: null,
        preferences: {},
        updated_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    (mappers.toPlayerLoyaltyDTOOrNull as jest.Mock).mockReturnValue({
      currentBalance: 50,
    });

    await expect(
      crud.issueComp(
        supabase,
        {
          playerId: PLAYER_ID,
          rewardId: REWARD_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        CASINO_ID,
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
  });

  it('throws REWARD_FAMILY_MISMATCH when family is not points_comp', async () => {
    mockGetReward.mockResolvedValue(
      makeRewardDetail({ family: 'entitlement' }),
    );
    mockMaybeSingle.mockResolvedValue({
      data: {
        player_id: PLAYER_ID,
        casino_id: CASINO_ID,
        current_balance: 500,
        tier: null,
        preferences: {},
        updated_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    (mappers.toPlayerLoyaltyDTOOrNull as jest.Mock).mockReturnValue({
      currentBalance: 500,
    });

    await expect(
      crud.issueComp(
        supabase,
        {
          playerId: PLAYER_ID,
          rewardId: REWARD_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        CASINO_ID,
      ),
    ).rejects.toMatchObject({ code: 'REWARD_FAMILY_MISMATCH' });
  });

  it('throws CATALOG_CONFIG_INVALID when no valid points cost configured', async () => {
    mockGetReward.mockResolvedValue(makeRewardDetail({ pricePoints: null }));
    mockMaybeSingle.mockResolvedValue({
      data: {
        player_id: PLAYER_ID,
        casino_id: CASINO_ID,
        current_balance: 500,
        tier: null,
        preferences: {},
        updated_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    (mappers.toPlayerLoyaltyDTOOrNull as jest.Mock).mockReturnValue({
      currentBalance: 500,
    });

    await expect(
      crud.issueComp(
        supabase,
        {
          playerId: PLAYER_ID,
          rewardId: REWARD_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        CASINO_ID,
      ),
    ).rejects.toMatchObject({ code: 'CATALOG_CONFIG_INVALID' });
  });

  it('all errors thrown are DomainError instances', async () => {
    mockGetReward.mockResolvedValue(null);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      crud.issueComp(
        supabase,
        {
          playerId: PLAYER_ID,
          rewardId: REWARD_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        CASINO_ID,
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
