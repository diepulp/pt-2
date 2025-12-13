/**
 * LoyaltyService CRUD Unit Tests
 *
 * Tests for loyalty ledger CRUD operations.
 * Mocks Supabase RPC calls to verify input mapping and error handling.
 *
 * @see PRD-004 Loyalty Service
 * @see EXECUTION-SPEC-PRD-004.md WS7
 */

import { DomainError } from '@/lib/errors/domain-errors';

import * as crud from '../crud';
import * as mappers from '../mappers';

// Mock mappers
jest.mock('../mappers', () => ({
  toAccrueOnCloseOutput: jest.fn(),
  toRedeemOutput: jest.fn(),
  toManualCreditOutput: jest.fn(),
  toApplyPromotionOutput: jest.fn(),
  toSessionSuggestionOutput: jest.fn(),
  toPlayerLoyaltyDTOOrNull: jest.fn(),
  toLedgerPageResponse: jest.fn(),
}));

// Mock schema decoder
jest.mock('../schemas', () => ({
  decodeLedgerCursor: jest.fn().mockReturnValue({
    created_at: '2025-01-15T10:00:00Z',
    id: 'cursor-uuid',
  }),
}));

describe('loyalty crud', () => {
  // Mock Supabase client
  const mockRpc = jest.fn();
  const mockFrom = jest.fn();
  const mockSelect = jest.fn();
  const mockEq = jest.fn();
  const mockMaybeSingle = jest.fn();

  const supabase = {
    rpc: mockRpc,
    from: mockFrom,
  } as unknown as Parameters<typeof crud.accrueOnClose>[0];

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup chained query methods
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ eq: mockEq, maybeSingle: mockMaybeSingle });
  });

  describe('accrueOnClose', () => {
    const input = {
      ratingSlipId: 'slip-uuid-1',
      casinoId: 'casino-uuid-1',
      idempotencyKey: 'idem-uuid-1',
    };

    const rpcResponse = {
      ledger_id: 'ledger-uuid-1',
      points_delta: 100,
      theo: 5000,
      balance_after: 1100,
      is_existing: false,
    };

    it('calls rpc_accrue_on_close with correct params', async () => {
      mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });
      (mappers.toAccrueOnCloseOutput as jest.Mock).mockReturnValue({
        ledgerId: 'ledger-uuid-1',
        pointsDelta: 100,
        theo: 5000,
        balanceAfter: 1100,
        isExisting: false,
      });

      await crud.accrueOnClose(supabase, input);

      expect(mockRpc).toHaveBeenCalledWith('rpc_accrue_on_close', {
        p_rating_slip_id: input.ratingSlipId,
        p_casino_id: input.casinoId,
        p_idempotency_key: input.idempotencyKey,
      });
      expect(mappers.toAccrueOnCloseOutput).toHaveBeenCalledWith(rpcResponse);
    });

    it('handles single object response (not array)', async () => {
      mockRpc.mockResolvedValue({ data: rpcResponse, error: null });
      (mappers.toAccrueOnCloseOutput as jest.Mock).mockReturnValue({
        ledgerId: 'ledger-uuid-1',
      });

      await crud.accrueOnClose(supabase, input);

      expect(mappers.toAccrueOnCloseOutput).toHaveBeenCalledWith(rpcResponse);
    });

    it('throws DomainError when RPC returns empty data', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      await expect(crud.accrueOnClose(supabase, input)).rejects.toBeInstanceOf(
        DomainError,
      );
    });

    it('maps LOYALTY_SLIP_NOT_FOUND error correctly', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: {
          message: 'LOYALTY_SLIP_NOT_FOUND: Rating slip does not exist',
        },
      });

      await expect(crud.accrueOnClose(supabase, input)).rejects.toMatchObject({
        code: 'RATING_SLIP_NOT_FOUND',
      });
    });

    it('maps FORBIDDEN error correctly', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'FORBIDDEN: Role dealer cannot perform this action' },
      });

      await expect(crud.accrueOnClose(supabase, input)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('redeem', () => {
    const input = {
      casinoId: 'casino-uuid-1',
      playerId: 'player-uuid-1',
      points: 50,
      issuedByStaffId: 'staff-uuid-1',
      note: 'Dinner for 2 at steakhouse',
      idempotencyKey: 'idem-uuid-2',
      allowOverdraw: false,
    };

    const rpcResponse = {
      ledger_id: 'ledger-uuid-2',
      points_delta: -50,
      balance_before: 1100,
      balance_after: 1050,
      overdraw_applied: false,
      is_existing: false,
    };

    it('calls rpc_redeem with correct params', async () => {
      mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });
      (mappers.toRedeemOutput as jest.Mock).mockReturnValue({
        ledgerId: 'ledger-uuid-2',
        pointsDelta: -50,
      });

      await crud.redeem(supabase, input);

      expect(mockRpc).toHaveBeenCalledWith('rpc_redeem', {
        p_casino_id: input.casinoId,
        p_player_id: input.playerId,
        p_points: input.points,
        p_issued_by_staff_id: input.issuedByStaffId,
        p_note: input.note,
        p_idempotency_key: input.idempotencyKey,
        p_allow_overdraw: false,
        p_reward_id: null,
        p_reference: null,
      });
    });

    it('passes optional reward_id and reference', async () => {
      const inputWithOptionals = {
        ...input,
        rewardId: 'reward-uuid-1',
        reference: 'EXT-REF-123',
      };

      mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });
      (mappers.toRedeemOutput as jest.Mock).mockReturnValue({});

      await crud.redeem(supabase, inputWithOptionals);

      expect(mockRpc).toHaveBeenCalledWith('rpc_redeem', {
        p_casino_id: inputWithOptionals.casinoId,
        p_player_id: inputWithOptionals.playerId,
        p_points: inputWithOptionals.points,
        p_issued_by_staff_id: inputWithOptionals.issuedByStaffId,
        p_note: inputWithOptionals.note,
        p_idempotency_key: inputWithOptionals.idempotencyKey,
        p_allow_overdraw: false,
        p_reward_id: 'reward-uuid-1',
        p_reference: 'EXT-REF-123',
      });
    });

    it('maps INSUFFICIENT_BALANCE error correctly', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'LOYALTY_INSUFFICIENT_BALANCE: Not enough points' },
      });

      await expect(crud.redeem(supabase, input)).rejects.toMatchObject({
        code: 'INSUFFICIENT_BALANCE',
      });
    });

    it('maps OVERDRAW_EXCEEDS_CAP error correctly', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'LOYALTY_OVERDRAW_EXCEEDS_CAP: Limit exceeded' },
      });

      await expect(crud.redeem(supabase, input)).rejects.toMatchObject({
        code: 'LOYALTY_POLICY_VIOLATION',
      });
    });
  });

  describe('manualCredit', () => {
    const input = {
      casinoId: 'casino-uuid-1',
      playerId: 'player-uuid-1',
      points: 25,
      awardedByStaffId: 'staff-uuid-1',
      note: 'Service recovery for slot malfunction',
      idempotencyKey: 'idem-uuid-3',
    };

    const rpcResponse = {
      ledger_id: 'ledger-uuid-3',
      points_delta: 25,
      balance_after: 1125,
      is_existing: false,
    };

    it('calls rpc_manual_credit with correct params', async () => {
      mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });
      (mappers.toManualCreditOutput as jest.Mock).mockReturnValue({});

      await crud.manualCredit(supabase, input);

      expect(mockRpc).toHaveBeenCalledWith('rpc_manual_credit', {
        p_casino_id: input.casinoId,
        p_player_id: input.playerId,
        p_points: input.points,
        p_awarded_by_staff_id: input.awardedByStaffId,
        p_note: input.note,
        p_idempotency_key: input.idempotencyKey,
      });
    });

    it('maps NOTE_REQUIRED error correctly', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'LOYALTY_NOTE_REQUIRED: Note cannot be empty' },
      });

      await expect(crud.manualCredit(supabase, input)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('applyPromotion', () => {
    const input = {
      casinoId: 'casino-uuid-1',
      ratingSlipId: 'slip-uuid-1',
      campaignId: 'PROMO-2025-Q1',
      bonusPoints: 50,
      idempotencyKey: 'idem-uuid-4',
    };

    const rpcResponse = {
      ledger_id: 'ledger-uuid-4',
      promo_points_delta: 50,
      is_existing: false,
    };

    it('calls rpc_apply_promotion with correct params', async () => {
      mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });
      (mappers.toApplyPromotionOutput as jest.Mock).mockReturnValue({});

      await crud.applyPromotion(supabase, input);

      expect(mockRpc).toHaveBeenCalledWith('rpc_apply_promotion', {
        p_casino_id: input.casinoId,
        p_rating_slip_id: input.ratingSlipId,
        p_campaign_id: input.campaignId,
        p_promo_multiplier: null,
        p_bonus_points: input.bonusPoints,
        p_idempotency_key: input.idempotencyKey,
      });
    });

    it('passes promo_multiplier when provided', async () => {
      const inputWithMultiplier = { ...input, promoMultiplier: 1.5 };
      mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });
      (mappers.toApplyPromotionOutput as jest.Mock).mockReturnValue({});

      await crud.applyPromotion(supabase, inputWithMultiplier);

      expect(mockRpc).toHaveBeenCalledWith(
        'rpc_apply_promotion',
        expect.objectContaining({
          p_promo_multiplier: 1.5,
        }),
      );
    });
  });

  describe('evaluateSuggestion', () => {
    const slipId = 'slip-uuid-1';

    const rpcResponse = {
      suggested_theo: 2500,
      suggested_points: 50,
      policy_version: 'v1.0',
      max_recommended_points: 100,
      notes: 'Estimated based on 1.5 hours play',
    };

    it('calls evaluate_session_reward_suggestion with correct params', async () => {
      mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });
      (mappers.toSessionSuggestionOutput as jest.Mock).mockReturnValue({});

      await crud.evaluateSuggestion(supabase, slipId);

      expect(mockRpc).toHaveBeenCalledWith(
        'evaluate_session_reward_suggestion',
        {
          p_rating_slip_id: slipId,
          p_as_of_ts: null,
        },
      );
    });

    it('passes asOfTs when provided', async () => {
      const asOfTs = '2025-01-15T14:00:00Z';
      mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });
      (mappers.toSessionSuggestionOutput as jest.Mock).mockReturnValue({});

      await crud.evaluateSuggestion(supabase, slipId, asOfTs);

      expect(mockRpc).toHaveBeenCalledWith(
        'evaluate_session_reward_suggestion',
        {
          p_rating_slip_id: slipId,
          p_as_of_ts: asOfTs,
        },
      );
    });
  });

  describe('getBalance', () => {
    const playerId = 'player-uuid-1';
    const casinoId = 'casino-uuid-1';

    const dbRow = {
      player_id: playerId,
      casino_id: casinoId,
      current_balance: 1000,
      tier: 'gold',
      preferences: { comp_preference: 'food' },
      updated_at: '2025-01-15T10:00:00Z',
    };

    it('queries player_loyalty with correct filters', async () => {
      mockMaybeSingle.mockResolvedValue({ data: dbRow, error: null });
      (mappers.toPlayerLoyaltyDTOOrNull as jest.Mock).mockReturnValue({
        playerId,
        casinoId,
        currentBalance: 1000,
      });

      await crud.getBalance(supabase, playerId, casinoId);

      expect(mockFrom).toHaveBeenCalledWith('player_loyalty');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('player_id', playerId);
      expect(mockEq).toHaveBeenCalledWith('casino_id', casinoId);
    });

    it('returns null when no record exists', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await crud.getBalance(supabase, playerId, casinoId);

      expect(result).toBeNull();
    });

    it('handles old schema with balance instead of current_balance', async () => {
      const oldSchemaRow = {
        player_id: playerId,
        casino_id: casinoId,
        balance: 500, // old schema field
        tier: null,
        preferences: {},
        updated_at: '2025-01-15T10:00:00Z',
      };

      mockMaybeSingle.mockResolvedValue({ data: oldSchemaRow, error: null });
      (mappers.toPlayerLoyaltyDTOOrNull as jest.Mock).mockImplementation(
        (row) => ({
          currentBalance: row.current_balance,
        }),
      );

      await crud.getBalance(supabase, playerId, casinoId);

      // Mapper should receive normalized row with current_balance
      expect(mappers.toPlayerLoyaltyDTOOrNull).toHaveBeenCalledWith(
        expect.objectContaining({
          current_balance: 500,
        }),
      );
    });
  });

  describe('getLedger', () => {
    const query = {
      casinoId: 'casino-uuid-1',
      playerId: 'player-uuid-1',
      limit: 20,
    };

    const rpcRows = [
      {
        id: 'entry-1',
        casino_id: 'casino-uuid-1',
        player_id: 'player-uuid-1',
        rating_slip_id: null,
        visit_id: null,
        staff_id: null,
        points_delta: 100,
        reason: 'base_accrual',
        idempotency_key: null,
        campaign_id: null,
        source_kind: null,
        source_id: null,
        note: null,
        metadata: {},
        created_at: '2025-01-15T10:00:00Z',
        has_more: false,
      },
    ];

    it('calls rpc_get_player_ledger with correct params (no cursor)', async () => {
      mockRpc.mockResolvedValue({ data: rpcRows, error: null });
      (mappers.toLedgerPageResponse as jest.Mock).mockReturnValue({
        entries: [],
        cursor: null,
        hasMore: false,
      });

      await crud.getLedger(supabase, query);

      expect(mockRpc).toHaveBeenCalledWith('rpc_get_player_ledger', {
        p_casino_id: query.casinoId,
        p_player_id: query.playerId,
        p_cursor_created_at: null,
        p_cursor_id: null,
        p_limit: 20,
      });
    });

    it('decodes cursor when provided', async () => {
      const queryWithCursor = { ...query, cursor: 'base64cursor' };
      mockRpc.mockResolvedValue({ data: rpcRows, error: null });
      (mappers.toLedgerPageResponse as jest.Mock).mockReturnValue({
        entries: [],
        cursor: null,
        hasMore: false,
      });

      await crud.getLedger(supabase, queryWithCursor);

      expect(mockRpc).toHaveBeenCalledWith('rpc_get_player_ledger', {
        p_casino_id: query.casinoId,
        p_player_id: query.playerId,
        p_cursor_created_at: '2025-01-15T10:00:00Z',
        p_cursor_id: 'cursor-uuid',
        p_limit: 20,
      });
    });

    it('enforces max limit of 100', async () => {
      const queryWithLargeLimit = { ...query, limit: 500 };
      mockRpc.mockResolvedValue({ data: rpcRows, error: null });
      (mappers.toLedgerPageResponse as jest.Mock).mockReturnValue({
        entries: [],
        cursor: null,
        hasMore: false,
      });

      await crud.getLedger(supabase, queryWithLargeLimit);

      expect(mockRpc).toHaveBeenCalledWith(
        'rpc_get_player_ledger',
        expect.objectContaining({
          p_limit: 100,
        }),
      );
    });

    it('returns empty response when no data', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      const result = await crud.getLedger(supabase, query);

      expect(result).toEqual({
        entries: [],
        cursor: null,
        hasMore: false,
      });
    });
  });

  describe('reconcileBalance', () => {
    const playerId = 'player-uuid-1';
    const casinoId = 'casino-uuid-1';

    const rpcResponse = {
      old_balance: 1000,
      new_balance: 1050,
      drift_detected: true,
    };

    it('calls rpc_reconcile_loyalty_balance with correct params', async () => {
      mockRpc.mockResolvedValue({ data: [rpcResponse], error: null });

      const result = await crud.reconcileBalance(supabase, playerId, casinoId);

      expect(mockRpc).toHaveBeenCalledWith('rpc_reconcile_loyalty_balance', {
        p_player_id: playerId,
        p_casino_id: casinoId,
      });
      expect(result).toEqual(rpcResponse);
    });

    it('throws DomainError when RPC returns no data', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await expect(
        crud.reconcileBalance(supabase, playerId, casinoId),
      ).rejects.toBeInstanceOf(DomainError);
    });
  });

  describe('error mapping', () => {
    it('maps UNAUTHORIZED to DomainError', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'UNAUTHORIZED: RLS context not set' },
      });

      await expect(
        crud.accrueOnClose(supabase, {
          ratingSlipId: 'x',
          casinoId: 'y',
          idempotencyKey: 'z',
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('maps CASINO_MISMATCH to FORBIDDEN', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'CASINO_MISMATCH: Cross-casino access' },
      });

      await expect(
        crud.accrueOnClose(supabase, {
          ratingSlipId: 'x',
          casinoId: 'y',
          idempotencyKey: 'z',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('maps 23505 unique constraint to IDEMPOTENCY_CONFLICT', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key idempotency_key' },
      });

      await expect(
        crud.accrueOnClose(supabase, {
          ratingSlipId: 'x',
          casinoId: 'y',
          idempotencyKey: 'z',
        }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });

    it('maps 23503 FK violation on player_id to PLAYER_NOT_FOUND', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { code: '23503', message: 'violates FK constraint player_id' },
      });

      await expect(
        crud.redeem(supabase, {
          casinoId: 'x',
          playerId: 'y',
          points: 10,
          issuedByStaffId: 's',
          note: 'n',
          idempotencyKey: 'z',
        }),
      ).rejects.toMatchObject({ code: 'PLAYER_NOT_FOUND' });
    });
  });
});
