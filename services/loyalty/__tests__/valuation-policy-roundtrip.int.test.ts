/** @jest-environment node */

/**
 * NOTE: Despite the .int.test.ts naming, this file is a fully mocked unit test.
 * It does not hit the database. The RUN_INTEGRATION_TESTS gate is retained for
 * consistency but all operations are mocked via jest.mock().
 * Reclassified as Unit (Mocked) per LOYALTY-POSTURE.md.
 */

/**
 * Valuation Policy Round-Trip Integration Tests (PRD-053 WS5f)
 *
 * Tests the full service flow: update rate -> verify read returns new rate ->
 * verify comp issuance uses the updated rate.
 *
 * Uses Supabase mocks (no live DB) but validates the integration between
 * service layer functions.
 *
 * @see EXEC-054 WS5f -- Admin Surface Tests
 */

import * as crud from '../crud';

// === Mock Setup ===

const mockGetReward = jest.fn();
jest.mock('../reward/crud', () => ({
  getReward: (...args: unknown[]) => mockGetReward(...args),
}));

jest.mock('../mappers', () => ({
  parseAccrueOnCloseResponse: jest.fn(),
  parseRedeemResponse: jest.fn(),
  parseManualCreditResponse: jest.fn(),
  parseApplyPromotionResponse: jest.fn(),
  parseSessionSuggestionResponse: jest.fn(),
  toPlayerLoyaltyDTOOrNull: jest.fn(),
  parseLedgerPageResponse: jest.fn(),
}));

jest.mock('../schemas', () => ({
  ...jest.requireActual('../schemas'),
  decodeLedgerCursor: jest.fn(),
}));

import * as mappers from '../mappers';

// === Fixtures ===

const CASINO_ID = '33333333-3333-3333-3333-333333333333';
const STAFF_ID = '55555555-5555-5555-5555-555555555555';
const PLAYER_ID = '11111111-1111-1111-1111-111111111111';
const REWARD_ID = '22222222-2222-2222-2222-222222222222';

const NEW_POLICY = {
  id: 'new-policy-id',
  casino_id: CASINO_ID,
  cents_per_point: 5,
  effective_date: '2026-04-01',
  version_identifier: 'admin-2026-04-01',
  is_active: true,
  created_by_staff_id: STAFF_ID,
  created_at: '2026-03-20T12:00:00Z',
};

function makeReward() {
  return {
    id: REWARD_ID,
    casinoId: CASINO_ID,
    code: 'COMP-MEAL',
    family: 'points_comp',
    kind: 'food_beverage',
    name: 'Meal Comp',
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
  };
}

// === Round-Trip Tests ===

describe('valuation policy round-trip', () => {
  beforeEach(() => jest.clearAllMocks());

  it('update rate → getActiveValuationCentsPerPoint returns new rate', async () => {
    // Step 1: Update the policy via RPC
    const rpcMock = jest.fn().mockResolvedValue({
      data: NEW_POLICY,
      error: null,
    });
    const updateSupabase = { rpc: rpcMock } as unknown as Parameters<
      typeof crud.updateValuationPolicy
    >[0];

    const updated = await crud.updateValuationPolicy(updateSupabase, {
      centsPerPoint: 5,
      effectiveDate: '2026-04-01',
      versionIdentifier: 'admin-2026-04-01',
    });

    expect(updated.centsPerPoint).toBe(5);
    expect(updated.isActive).toBe(true);
    expect(updated.createdByStaffId).toBe(STAFF_ID);

    // Step 2: Read the new rate
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { ...NEW_POLICY },
      error: null,
    });
    const eq = jest.fn();
    eq.mockReturnValue({ eq, maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const readSupabase = {
      from: jest.fn().mockReturnValue({ select }),
    } as unknown as Parameters<typeof crud.getActiveValuationCentsPerPoint>[0];

    const rate = await crud.getActiveValuationCentsPerPoint(
      readSupabase,
      CASINO_ID,
    );

    expect(rate).toBe(5);
  });

  it('comp issuance uses newly saved rate (not old rate)', async () => {
    // Simulate the state AFTER rate update: DB returns new rate (5 cents/pt)
    const valuationData = { cents_per_point: 5 };
    const balanceData = {
      player_id: PLAYER_ID,
      casino_id: CASINO_ID,
      current_balance: 10000,
      tier: 'gold',
      preferences: {},
      updated_at: '2026-01-01T00:00:00Z',
    };

    const mockFrom = jest.fn().mockImplementation((table: string) => {
      const data =
        table === 'loyalty_valuation_policy' ? valuationData : balanceData;
      const maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
      const eqFn = jest.fn();
      eqFn.mockReturnValue({ eq: eqFn, maybeSingle });
      return { select: jest.fn().mockReturnValue({ eq: eqFn }) };
    });

    const rpcResponse = {
      ledger_id: 'ledger-1',
      points_delta: -700,
      balance_before: 10000,
      balance_after: 9300,
      overdraw_applied: false,
      is_existing: false,
    };
    const mockRpc = jest
      .fn()
      .mockResolvedValue({ data: [rpcResponse], error: null });

    (mappers.toPlayerLoyaltyDTOOrNull as jest.Mock).mockReturnValue({
      playerId: PLAYER_ID,
      casinoId: CASINO_ID,
      currentBalance: 10000,
      tier: 'gold',
      preferences: {},
      updatedAt: '2026-01-01T00:00:00Z',
    });

    (mappers.parseRedeemResponse as jest.Mock).mockReturnValue({
      ledgerId: 'ledger-1',
      pointsDelta: -700,
      balanceBefore: 10000,
      balanceAfter: 9300,
      overdrawApplied: false,
      isExisting: false,
    });

    mockGetReward.mockResolvedValue(makeReward());

    const supabase = {
      rpc: mockRpc,
      from: mockFrom,
    } as unknown as Parameters<typeof crud.issueComp>[0];

    await crud.issueComp(
      supabase,
      {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: 'test-idem',
        faceValueCents: 3500,
      },
      CASINO_ID,
    );

    // $35.00 / 5 cents per point = 700 points (new rate, not old rate of 2)
    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_redeem',
      expect.objectContaining({
        p_points: 700,
      }),
    );
  });
});
