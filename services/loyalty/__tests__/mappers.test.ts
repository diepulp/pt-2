/**
 * LoyaltyService Mappers Unit Tests
 *
 * Tests for RPC response to DTO transformations.
 *
 * @see PRD-004 Loyalty Service
 * @see EXECUTION-SPEC-PRD-004.md WS7
 */

import {
  toAccrueOnCloseOutput,
  toApplyPromotionOutput,
  toLedgerPageResponse,
  toLoyaltyLedgerEntryDTO,
  toManualCreditOutput,
  toPlayerLoyaltyDTO,
  toPlayerLoyaltyDTOOrNull,
  toRedeemOutput,
  toSessionSuggestionOutput,
} from '../mappers';
import type {
  AccrueOnCloseRpcResponse,
  ApplyPromotionRpcResponse,
  LedgerRpcRow,
  ManualCreditRpcResponse,
  PlayerLoyaltyRow,
  RedeemRpcResponse,
  SessionSuggestionRpcResponse,
} from '../mappers';

describe('loyalty mappers', () => {
  describe('toAccrueOnCloseOutput', () => {
    it('maps RPC response to DTO with snake_case to camelCase', () => {
      const response: AccrueOnCloseRpcResponse = {
        ledger_id: 'ledger-uuid-1',
        points_delta: 100,
        theo: 5000,
        balance_after: 1100,
        is_existing: false,
      };

      const result = toAccrueOnCloseOutput(response);

      expect(result).toEqual({
        ledgerId: 'ledger-uuid-1',
        pointsDelta: 100,
        theo: 5000,
        balanceAfter: 1100,
        isExisting: false,
      });
    });

    it('preserves isExisting flag for idempotent replays', () => {
      const response: AccrueOnCloseRpcResponse = {
        ledger_id: 'ledger-uuid-1',
        points_delta: 100,
        theo: 5000,
        balance_after: 1100,
        is_existing: true,
      };

      const result = toAccrueOnCloseOutput(response);

      expect(result.isExisting).toBe(true);
    });
  });

  describe('toRedeemOutput', () => {
    it('maps RPC response to DTO', () => {
      const response: RedeemRpcResponse = {
        ledger_id: 'ledger-uuid-2',
        points_delta: -50,
        balance_before: 1100,
        balance_after: 1050,
        overdraw_applied: false,
        is_existing: false,
      };

      const result = toRedeemOutput(response);

      expect(result).toEqual({
        ledgerId: 'ledger-uuid-2',
        pointsDelta: -50,
        balanceBefore: 1100,
        balanceAfter: 1050,
        overdrawApplied: false,
        isExisting: false,
      });
    });

    it('indicates when overdraw was applied', () => {
      const response: RedeemRpcResponse = {
        ledger_id: 'ledger-uuid-2',
        points_delta: -100,
        balance_before: 50,
        balance_after: -50,
        overdraw_applied: true,
        is_existing: false,
      };

      const result = toRedeemOutput(response);

      expect(result.overdrawApplied).toBe(true);
      expect(result.balanceAfter).toBe(-50);
    });
  });

  describe('toManualCreditOutput', () => {
    it('maps RPC response to DTO', () => {
      const response: ManualCreditRpcResponse = {
        ledger_id: 'ledger-uuid-3',
        points_delta: 25,
        balance_after: 1125,
        is_existing: false,
      };

      const result = toManualCreditOutput(response);

      expect(result).toEqual({
        ledgerId: 'ledger-uuid-3',
        pointsDelta: 25,
        balanceAfter: 1125,
        isExisting: false,
      });
    });
  });

  describe('toApplyPromotionOutput', () => {
    it('maps RPC response to DTO', () => {
      const response: ApplyPromotionRpcResponse = {
        ledger_id: 'ledger-uuid-4',
        promo_points_delta: 75,
        is_existing: false,
      };

      const result = toApplyPromotionOutput(response);

      expect(result).toEqual({
        ledgerId: 'ledger-uuid-4',
        promoPointsDelta: 75,
        isExisting: false,
      });
    });
  });

  describe('toSessionSuggestionOutput', () => {
    it('maps RPC response to DTO', () => {
      const response: SessionSuggestionRpcResponse = {
        suggested_theo: 2500,
        suggested_points: 50,
        policy_version: 'v1.0',
        max_recommended_points: 100,
        notes: 'Estimated based on 1.5 hours play',
      };

      const result = toSessionSuggestionOutput(response);

      expect(result).toEqual({
        suggestedTheo: 2500,
        suggestedPoints: 50,
        policyVersion: 'v1.0',
        maxRecommendedPoints: 100,
        notes: 'Estimated based on 1.5 hours play',
      });
    });
  });

  describe('toPlayerLoyaltyDTO', () => {
    it('maps player_loyalty row to DTO', () => {
      const row: PlayerLoyaltyRow = {
        player_id: 'player-uuid-1',
        casino_id: 'casino-uuid-1',
        current_balance: 1000,
        tier: 'gold',
        preferences: { comp_preference: 'food' },
        updated_at: '2025-01-15T10:00:00Z',
      };

      const result = toPlayerLoyaltyDTO(row);

      expect(result).toEqual({
        playerId: 'player-uuid-1',
        casinoId: 'casino-uuid-1',
        currentBalance: 1000,
        tier: 'gold',
        preferences: { comp_preference: 'food' },
        updatedAt: '2025-01-15T10:00:00Z',
      });
    });

    it('handles null tier', () => {
      const row: PlayerLoyaltyRow = {
        player_id: 'player-uuid-1',
        casino_id: 'casino-uuid-1',
        current_balance: 0,
        tier: null,
        preferences: {},
        updated_at: '2025-01-15T10:00:00Z',
      };

      const result = toPlayerLoyaltyDTO(row);

      expect(result.tier).toBeNull();
    });
  });

  describe('toPlayerLoyaltyDTOOrNull', () => {
    it('returns DTO for valid row', () => {
      const row: PlayerLoyaltyRow = {
        player_id: 'player-uuid-1',
        casino_id: 'casino-uuid-1',
        current_balance: 500,
        tier: 'silver',
        preferences: {},
        updated_at: '2025-01-15T10:00:00Z',
      };

      const result = toPlayerLoyaltyDTOOrNull(row);

      expect(result).not.toBeNull();
      expect(result?.currentBalance).toBe(500);
    });

    it('returns null for null input', () => {
      const result = toPlayerLoyaltyDTOOrNull(null);
      expect(result).toBeNull();
    });
  });

  describe('toLoyaltyLedgerEntryDTO', () => {
    it('maps ledger row to DTO', () => {
      const row: Omit<LedgerRpcRow, 'has_more'> = {
        id: 'entry-uuid-1',
        casino_id: 'casino-uuid-1',
        player_id: 'player-uuid-1',
        rating_slip_id: 'slip-uuid-1',
        visit_id: 'visit-uuid-1',
        staff_id: 'staff-uuid-1',
        points_delta: 100,
        reason: 'base_accrual',
        idempotency_key: 'idem-uuid-1',
        campaign_id: null,
        source_kind: 'rating_slip',
        source_id: 'slip-uuid-1',
        note: null,
        metadata: { theo: 5000 },
        created_at: '2025-01-15T10:00:00Z',
      };

      const result = toLoyaltyLedgerEntryDTO(row);

      expect(result).toEqual({
        id: 'entry-uuid-1',
        casinoId: 'casino-uuid-1',
        playerId: 'player-uuid-1',
        ratingSlipId: 'slip-uuid-1',
        visitId: 'visit-uuid-1',
        staffId: 'staff-uuid-1',
        pointsDelta: 100,
        reason: 'base_accrual',
        idempotencyKey: 'idem-uuid-1',
        campaignId: null,
        sourceKind: 'rating_slip',
        sourceId: 'slip-uuid-1',
        note: null,
        metadata: { theo: 5000 },
        createdAt: '2025-01-15T10:00:00Z',
      });
    });

    it('handles all nullable fields', () => {
      const row: Omit<LedgerRpcRow, 'has_more'> = {
        id: 'entry-uuid-2',
        casino_id: 'casino-uuid-1',
        player_id: 'player-uuid-1',
        rating_slip_id: null,
        visit_id: null,
        staff_id: null,
        points_delta: 25,
        reason: 'manual_reward',
        idempotency_key: null,
        campaign_id: null,
        source_kind: null,
        source_id: null,
        note: 'Service recovery',
        metadata: {},
        created_at: '2025-01-15T11:00:00Z',
      };

      const result = toLoyaltyLedgerEntryDTO(row);

      expect(result.ratingSlipId).toBeNull();
      expect(result.visitId).toBeNull();
      expect(result.staffId).toBeNull();
      expect(result.note).toBe('Service recovery');
    });
  });

  describe('toLedgerPageResponse', () => {
    it('returns empty response for empty rows', () => {
      const result = toLedgerPageResponse([], 20);

      expect(result).toEqual({
        entries: [],
        cursor: null,
        hasMore: false,
      });
    });

    it('maps rows to entries and strips has_more flag', () => {
      const rows: LedgerRpcRow[] = [
        {
          id: 'entry-1',
          casino_id: 'casino-1',
          player_id: 'player-1',
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

      const result = toLedgerPageResponse(rows, 20);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).not.toHaveProperty('has_more');
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('generates cursor when has_more is true', () => {
      const rows: LedgerRpcRow[] = [
        {
          id: 'entry-1',
          casino_id: 'casino-1',
          player_id: 'player-1',
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
          has_more: true,
        },
      ];

      const result = toLedgerPageResponse(rows, 20);

      expect(result.hasMore).toBe(true);
      expect(result.cursor).not.toBeNull();
      // Cursor should be base64url encoded
      expect(result.cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('uses last entry for cursor generation', () => {
      const rows: LedgerRpcRow[] = [
        {
          id: 'entry-1',
          casino_id: 'casino-1',
          player_id: 'player-1',
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
        {
          id: 'entry-2',
          casino_id: 'casino-1',
          player_id: 'player-1',
          rating_slip_id: null,
          visit_id: null,
          staff_id: null,
          points_delta: 50,
          reason: 'promotion',
          idempotency_key: null,
          campaign_id: null,
          source_kind: null,
          source_id: null,
          note: null,
          metadata: {},
          created_at: '2025-01-15T11:00:00Z',
          has_more: true,
        },
      ];

      const result = toLedgerPageResponse(rows, 20);

      // Decode cursor to verify it contains last entry's data
      const decoded = JSON.parse(
        Buffer.from(result.cursor!, 'base64url').toString('utf-8'),
      );
      expect(decoded.id).toBe('entry-2');
      expect(decoded.created_at).toBe('2025-01-15T11:00:00Z');
    });
  });
});
