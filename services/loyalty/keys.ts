/**
 * LoyaltyService React Query Key Factories
 *
 * Uses .scope pattern for surgical cache invalidation.
 * All list operations include scope for partial invalidation.
 *
 * @see PRD-004 Loyalty Service
 * @see EXECUTION-SPEC-PRD-004.md WS3
 */

import { serializeKeyFilters } from '@/services/shared/key-utils';

import type { LedgerListQuery } from './dtos';

const ROOT = ['loyalty'] as const;

// Helper to serialize filters
type LedgerFilters = Omit<
  LedgerListQuery,
  'casinoId' | 'playerId' | 'cursor' | 'limit'
>;

const serializeLedgerFilters = (filters: LedgerFilters = {}): string =>
  serializeKeyFilters(filters);

export const loyaltyKeys = {
  /** Root key for all loyalty queries */
  root: ROOT,

  // === Balance Queries ===

  /** Player loyalty balance and tier info */
  balance: (playerId: string, casinoId: string) =>
    [...ROOT, 'balance', casinoId, playerId] as const,

  // === Ledger Queries ===

  /**
   * List ledger entries with optional filters.
   * Includes .scope for surgical invalidation of all ledger queries.
   */
  ledger: Object.assign(
    (playerId: string, casinoId: string, filters: LedgerFilters = {}) =>
      [
        ...ROOT,
        'ledger',
        casinoId,
        playerId,
        serializeLedgerFilters(filters),
      ] as const,
    { scope: [...ROOT, 'ledger'] as const },
  ),

  /**
   * Infinite query for ledger (cursor-based pagination).
   */
  ledgerInfinite: (
    playerId: string,
    casinoId: string,
    filters: LedgerFilters = {},
  ) =>
    [
      ...ROOT,
      'ledger-infinite',
      casinoId,
      playerId,
      serializeLedgerFilters(filters),
    ] as const,

  // === Session Suggestion Queries ===

  /**
   * Session reward suggestion (read-only helper).
   * Used for live preview during rating slip session.
   */
  suggestion: (ratingSlipId: string) =>
    [...ROOT, 'suggestion', ratingSlipId] as const,

  // === Mutation Keys ===

  /** Key for base accrual mutation */
  accrue: () => [...ROOT, 'accrue'] as const,

  /** Key for redemption mutation */
  redeem: () => [...ROOT, 'redeem'] as const,

  /** Key for manual credit mutation */
  manualCredit: () => [...ROOT, 'manual-credit'] as const,

  /** Key for promotion mutation */
  promotion: () => [...ROOT, 'promotion'] as const,
};
