/** @jest-environment node */

/**
 * Variable-Amount Comp Issuance Tests (EXEC-053 WS3)
 *
 * Tests the branching logic added by P2K-30:
 * - faceValueCents → points conversion via Math.ceil(cents / CENTS_PER_POINT)
 * - allowOverdraw flag threading to rpc_redeem
 * - Rounding boundary edge cases
 * - Zod schema validation edge cases
 *
 * @see EXEC-053 — Variable-Amount Comp Issuance
 */

import { DomainError } from '@/lib/errors/domain-errors';
import { issueRewardSchema } from '@/services/loyalty/schemas';

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

const PLAYER_ID = '11111111-1111-1111-1111-111111111111';
const REWARD_ID = '22222222-2222-2222-2222-222222222222';
const CASINO_ID = '33333333-3333-3333-3333-333333333333';
const IDEMPOTENCY_KEY = '44444444-4444-4444-4444-444444444444';

function makeReward(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

/**
 * Creates mock chain for supabase.from(table).select().eq().eq().maybeSingle()
 * Returns different data based on table name (PRD-053: valuation policy lookup).
 */
function makeSelectChain(data: unknown) {
  const maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
  const eq = jest.fn();
  eq.mockReturnValue({ eq, maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  return { select };
}

function setupMocks(balance: number, centsPerPoint = 2) {
  const mockRpc = jest.fn();
  const mockFrom = jest.fn();

  const balanceData = {
    player_id: PLAYER_ID,
    casino_id: CASINO_ID,
    current_balance: balance,
    tier: 'gold',
    preferences: {},
    updated_at: '2026-01-01T00:00:00Z',
  };

  const valuationData = { cents_per_point: centsPerPoint };

  // Discriminate by table name (PRD-053 WS4)
  mockFrom.mockImplementation((table: string) => {
    if (table === 'loyalty_valuation_policy') {
      return makeSelectChain(valuationData);
    }
    return makeSelectChain(balanceData);
  });

  (mappers.toPlayerLoyaltyDTOOrNull as jest.Mock).mockReturnValue({
    playerId: PLAYER_ID,
    casinoId: CASINO_ID,
    currentBalance: balance,
    tier: 'gold',
    preferences: {},
    updatedAt: '2026-01-01T00:00:00Z',
  });

  const rpcResponse = {
    ledger_id: 'ledger-1',
    points_delta: -100,
    balance_before: balance,
    balance_after: balance - 100,
    overdraw_applied: false,
    is_existing: false,
  };
  mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });
  (mappers.parseRedeemResponse as jest.Mock).mockReturnValue({
    ledgerId: 'ledger-1',
    pointsDelta: -100,
    balanceBefore: balance,
    balanceAfter: balance - 100,
    overdrawApplied: false,
    isExisting: false,
  });

  const supabase = { rpc: mockRpc, from: mockFrom } as unknown as Parameters<
    typeof crud.issueComp
  >[0];
  return { supabase, mockRpc };
}

function setupMocksWithNullPolicy(balance: number) {
  const mockRpc = jest.fn();
  const mockFrom = jest.fn();

  const balanceData = {
    player_id: PLAYER_ID,
    casino_id: CASINO_ID,
    current_balance: balance,
    tier: 'gold',
    preferences: {},
    updated_at: '2026-01-01T00:00:00Z',
  };

  mockFrom.mockImplementation((table: string) => {
    if (table === 'loyalty_valuation_policy') {
      return makeSelectChain(null); // No active policy
    }
    return makeSelectChain(balanceData);
  });

  (mappers.toPlayerLoyaltyDTOOrNull as jest.Mock).mockReturnValue({
    playerId: PLAYER_ID,
    casinoId: CASINO_ID,
    currentBalance: balance,
    tier: 'gold',
    preferences: {},
    updatedAt: '2026-01-01T00:00:00Z',
  });

  const supabase = { rpc: mockRpc, from: mockFrom } as unknown as Parameters<
    typeof crud.issueComp
  >[0];
  return { supabase };
}

const baseParams = {
  playerId: PLAYER_ID,
  rewardId: REWARD_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
};

// === Service Branching Tests ===

describe('issueComp — variable-amount branching', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses faceValueCents when provided (test 1)', async () => {
    mockGetReward.mockResolvedValue(makeReward());
    const { supabase, mockRpc } = setupMocks(2000);

    await crud.issueComp(
      supabase,
      { ...baseParams, faceValueCents: 3500 },
      CASINO_ID,
    );

    // $35.00 = 3500 cents → ceil(3500/2) = 1750 points (centsPerPoint=2)
    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_redeem',
      expect.objectContaining({
        p_points: 1750,
        p_allow_overdraw: false,
      }),
    );
  });

  it('falls back to catalog pointsCost when faceValueCents omitted (test 2)', async () => {
    mockGetReward.mockResolvedValue(makeReward());
    const { supabase, mockRpc } = setupMocks(500);

    await crud.issueComp(supabase, baseParams, CASINO_ID);

    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_redeem',
      expect.objectContaining({
        p_points: 100, // from catalog pricePoints.pointsCost
        p_allow_overdraw: false,
      }),
    );
  });

  it('skips advisory balance check when allowOverdraw is true (test 3)', async () => {
    mockGetReward.mockResolvedValue(makeReward());
    // Balance = 10, catalog cost = 100 → insufficient, but overdraw allowed
    const { supabase, mockRpc } = setupMocks(10);

    await crud.issueComp(
      supabase,
      { ...baseParams, allowOverdraw: true },
      CASINO_ID,
    );

    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_redeem',
      expect.objectContaining({
        p_allow_overdraw: true,
      }),
    );
  });

  it('throws INSUFFICIENT_BALANCE when allowOverdraw is false and balance too low (test 4)', async () => {
    mockGetReward.mockResolvedValue(makeReward());
    const { supabase } = setupMocks(10);

    await expect(
      crud.issueComp(
        supabase,
        { ...baseParams, allowOverdraw: false },
        CASINO_ID,
      ),
    ).rejects.toThrow(DomainError);

    await expect(
      crud.issueComp(supabase, { ...baseParams }, CASINO_ID),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
  });

  it('returns caller-provided faceValueCents in result over catalog metadata', async () => {
    mockGetReward.mockResolvedValue(
      makeReward({ metadata: { face_value_cents: 5000 } }),
    );
    const { supabase } = setupMocks(5000);

    const result = await crud.issueComp(
      supabase,
      { ...baseParams, faceValueCents: 3500 },
      CASINO_ID,
    );

    expect(result.faceValueCents).toBe(3500); // caller-provided, not 5000 from metadata
  });
});

// === Rounding Boundary Tests ===

describe('issueComp — rounding boundaries', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    { cents: 1, expectedPoints: 1, label: '1¢ → 1pt (ceil(0.5))' },
    { cents: 9, expectedPoints: 5, label: '9¢ → 5pt (ceil(4.5))' },
    { cents: 11, expectedPoints: 6, label: '11¢ → 6pt (ceil(5.5))' },
    { cents: 10, expectedPoints: 5, label: '10¢ → 5pt (exact)' },
    { cents: 3500, expectedPoints: 1750, label: '$35.00 → 1750pt' },
  ])('$label', async ({ cents, expectedPoints }) => {
    mockGetReward.mockResolvedValue(makeReward());
    const { supabase, mockRpc } = setupMocks(10000);

    await crud.issueComp(
      supabase,
      { ...baseParams, faceValueCents: cents },
      CASINO_ID,
    );

    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_redeem',
      expect.objectContaining({
        p_points: expectedPoints,
      }),
    );
  });
});

// === Zod Schema Validation Tests ===

describe('issueRewardSchema — face_value_cents validation', () => {
  const validBase = {
    player_id: PLAYER_ID,
    reward_id: REWARD_ID,
    idempotency_key: IDEMPOTENCY_KEY,
  };

  it('rejects negative face_value_cents', () => {
    const result = issueRewardSchema.safeParse({
      ...validBase,
      face_value_cents: -100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero face_value_cents (.positive() excludes zero)', () => {
    const result = issueRewardSchema.safeParse({
      ...validBase,
      face_value_cents: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer face_value_cents', () => {
    const result = issueRewardSchema.safeParse({
      ...validBase,
      face_value_cents: 35.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects face_value_cents exceeding max (10_000_000)', () => {
    const result = issueRewardSchema.safeParse({
      ...validBase,
      face_value_cents: 10_000_001,
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid face_value_cents', () => {
    const result = issueRewardSchema.safeParse({
      ...validBase,
      face_value_cents: 3500,
    });
    expect(result.success).toBe(true);
  });

  it('accepts omitted face_value_cents (optional)', () => {
    const result = issueRewardSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });
});

// === Valuation Policy Tests (PRD-053) ===

describe('issueComp — valuation policy lookup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws VALUATION_POLICY_MISSING when no active valuation policy', async () => {
    mockGetReward.mockResolvedValue(makeReward());
    const { supabase } = setupMocksWithNullPolicy(500);

    await expect(
      crud.issueComp(
        supabase,
        { ...baseParams, faceValueCents: 3500 },
        CASINO_ID,
      ),
    ).rejects.toMatchObject({ code: 'VALUATION_POLICY_MISSING' });
  });

  it('uses DB-sourced centsPerPoint for conversion (centsPerPoint=5)', async () => {
    mockGetReward.mockResolvedValue(makeReward());
    const { supabase, mockRpc } = setupMocks(10000, 5);

    await crud.issueComp(
      supabase,
      { ...baseParams, faceValueCents: 3500 },
      CASINO_ID,
    );

    // $35.00 = 3500 cents → ceil(3500/5) = 700 points
    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_redeem',
      expect.objectContaining({
        p_points: 700,
      }),
    );
  });
});
