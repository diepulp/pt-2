/** @jest-environment node */

/**
 * Issuance Idempotency Tests (PRD-052 WS6)
 *
 * Tests that duplicate issuance attempts with the same idempotency key
 * return isExisting=true without creating additional debits/coupons.
 *
 * Uses mocked supabase to simulate idempotent RPC responses.
 *
 * @see PRD-052 NFR-4
 * @see EXEC-052 WS6
 */

import * as crud from '../crud';
import * as promoCrud from '../promo/crud';

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
  decodeLedgerCursor: jest.fn(),
}));

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

import * as mappers from '../mappers';
import * as promoMappers from '../promo/mappers';

// === Test Fixtures ===

const PLAYER_ID = '11111111-1111-1111-1111-111111111111';
const REWARD_ID = '22222222-2222-2222-2222-222222222222';
const CASINO_ID = '33333333-3333-3333-3333-333333333333';
const IDEMPOTENCY_KEY = '44444444-4444-4444-4444-444444444444';
const PROGRAM_ID = '55555555-5555-5555-5555-555555555555';

function makeCompReward() {
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
  };
}

function makeEntitlementReward() {
  return {
    id: REWARD_ID,
    casinoId: CASINO_ID,
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
  };
}

describe('issuance idempotency', () => {
  const mockRpc = jest.fn();
  const mockFrom = jest.fn();
  const mockSelect = jest.fn();
  const mockEq = jest.fn();
  const mockLimit = jest.fn();
  const mockMaybeSingle = jest.fn();

  const supabase = {
    rpc: mockRpc,
    from: mockFrom,
  } as unknown as Parameters<typeof crud.issueComp>[0];

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({
      eq: mockEq,
      limit: mockLimit,
      maybeSingle: mockMaybeSingle,
    });
    mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle });
  });

  describe('comp idempotency', () => {
    it('returns isExisting=true when comp with duplicate idempotency key', async () => {
      mockGetReward.mockResolvedValue(makeCompReward());
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

      // RPC returns is_existing: true (idempotent replay)
      const rpcResponse = {
        ledger_id: 'ledger-uuid-existing',
        points_delta: -100,
        balance_before: 500,
        balance_after: 400,
        overdraw_applied: false,
        is_existing: true,
      };
      mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });
      (mappers.parseRedeemResponse as jest.Mock).mockReturnValue({
        ledgerId: 'ledger-uuid-existing',
        pointsDelta: -100,
        balanceBefore: 500,
        balanceAfter: 400,
        overdrawApplied: false,
        isExisting: true,
      });

      const result = await crud.issueComp(
        supabase,
        {
          playerId: PLAYER_ID,
          rewardId: REWARD_ID,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
        CASINO_ID,
      );

      expect(result.isExisting).toBe(true);
      expect(result.ledgerId).toBe('ledger-uuid-existing');
      expect(result.family).toBe('points_comp');
    });
  });

  describe('entitlement idempotency', () => {
    it('returns isExisting=true when entitlement with duplicate idempotency key', async () => {
      mockGetReward.mockResolvedValue(makeEntitlementReward());
      mockMaybeSingle.mockResolvedValue({
        data: { id: PROGRAM_ID },
        error: null,
      });

      // RPC returns is_existing: true (idempotent replay)
      mockRpc.mockResolvedValue({
        data: {
          coupon_id: 'coupon-uuid-existing',
          validation_number: 'VAL-EXISTING',
          status: 'issued',
          face_value_amount: 25,
          issued_at: '2026-03-19T10:00:00Z',
          expires_at: null,
          is_existing: true,
        },
        error: null,
      });
      (promoMappers.parseIssueCouponResponse as jest.Mock).mockReturnValue({
        coupon: {
          id: 'coupon-uuid-existing',
          validationNumber: 'VAL-EXISTING',
          status: 'issued',
          faceValueAmount: 25,
          requiredMatchWagerAmount: 25,
          issuedAt: '2026-03-19T10:00:00Z',
          expiresAt: null,
          playerId: PLAYER_ID,
          visitId: null,
        },
        isExisting: true,
      });

      const result = await promoCrud.issueEntitlement(supabase, {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      });

      expect(result.isExisting).toBe(true);
      expect(result.couponId).toBe('coupon-uuid-existing');
      expect(result.family).toBe('entitlement');
    });
  });

  describe('concurrent double-debit prevention (NFR-4)', () => {
    it('concurrent Promise.all with same key — only one debit, second returns isExisting', async () => {
      mockGetReward.mockResolvedValue(makeCompReward());
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

      // First call: new debit
      // Second call: idempotent replay
      let callCount = 0;
      mockRpc.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            data: [
              {
                ledger_id: 'ledger-new',
                points_delta: -100,
                balance_before: 500,
                balance_after: 400,
                overdraw_applied: false,
                is_existing: false,
              },
            ],
            error: null,
          });
        }
        return Promise.resolve({
          data: [
            {
              ledger_id: 'ledger-new',
              points_delta: -100,
              balance_before: 500,
              balance_after: 400,
              overdraw_applied: false,
              is_existing: true,
            },
          ],
          error: null,
        });
      });

      (mappers.parseRedeemResponse as jest.Mock).mockImplementation(
        (row: Record<string, unknown>) => ({
          ledgerId: row.ledger_id,
          pointsDelta: row.points_delta,
          balanceBefore: row.balance_before,
          balanceAfter: row.balance_after,
          overdrawApplied: row.overdraw_applied,
          isExisting: row.is_existing,
        }),
      );

      const params = {
        playerId: PLAYER_ID,
        rewardId: REWARD_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
      };

      // Fire both concurrently
      const [result1, result2] = await Promise.all([
        crud.issueComp(supabase, params, CASINO_ID),
        crud.issueComp(supabase, params, CASINO_ID),
      ]);

      // Exactly one should be new, one should be existing
      const newResults = [result1, result2].filter((r) => !r.isExisting);
      const existingResults = [result1, result2].filter((r) => r.isExisting);

      expect(newResults).toHaveLength(1);
      expect(existingResults).toHaveLength(1);

      // Both should reference the same ledger entry
      expect(result1.ledgerId).toBe('ledger-new');
      expect(result2.ledgerId).toBe('ledger-new');
    });
  });
});
