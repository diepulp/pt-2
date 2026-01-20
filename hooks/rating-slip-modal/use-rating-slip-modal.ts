/**
 * Rating Slip Modal Query Hook
 *
 * TanStack Query hook for fetching aggregated modal data.
 * Uses the BFF endpoint that aggregates data from 5 bounded contexts.
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see EXECUTION-SPEC-PRD-008.md WS3
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import type { RatingSlipModalDTO } from '@/services/rating-slip-modal/dtos';
import { fetchRatingSlipModalData } from '@/services/rating-slip-modal/http';
import { ratingSlipModalKeys } from '@/services/rating-slip-modal/keys';

/**
 * Fetches aggregated modal data for a rating slip.
 *
 * Aggregates data from 5 bounded contexts in a single query:
 * - Rating slip details (status, average_bet, duration)
 * - Player identity (name, card number)
 * - Loyalty balance and session suggestion
 * - Financial summary (cash in, chips out)
 * - Available tables with occupied seats
 *
 * @param slipId - Rating slip UUID (null/undefined to disable query)
 * @returns TanStack Query result with modal data
 *
 * @example
 * ```tsx
 * function RatingSlipModal({ slipId, isOpen }: Props) {
 *   const { data, isLoading, error } = useRatingSlipModalData(
 *     isOpen ? slipId : null
 *   );
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <ErrorDisplay error={error} />;
 *   if (!data) return null;
 *
 *   return (
 *     <Modal>
 *       <SlipDetails slip={data.slip} />
 *       <PlayerInfo player={data.player} />
 *       <LoyaltyDisplay loyalty={data.loyalty} />
 *       <FinancialSummary financial={data.financial} />
 *       <MovePlayerSelector tables={data.tables} currentTableId={data.slip.tableId} />
 *     </Modal>
 *   );
 * }
 * ```
 */
export function useRatingSlipModalData(slipId: string | null | undefined) {
  return useQuery<RatingSlipModalDTO, Error>({
    queryKey: ratingSlipModalKeys.data(slipId ?? ''),
    queryFn: () => {
      if (!slipId) {
        throw new Error('Slip ID is required');
      }
      return fetchRatingSlipModalData(slipId);
    },
    enabled: Boolean(slipId),
    // Modal data is displayed immediately on open, so stale time is short
    staleTime: 10 * 1000, // 10 seconds
    // Keep data cached for modal re-opens
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Re-export types for convenience
export type { RatingSlipModalDTO } from '@/services/rating-slip-modal/dtos';
