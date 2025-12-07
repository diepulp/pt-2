/**
 * Rating Slip Mutation Hooks
 *
 * Hooks for rating slip lifecycle mutations: start, pause, resume, close.
 * All mutations automatically invalidate relevant queries using surgical cache updates.
 *
 * @see services/rating-slip/http.ts - HTTP fetchers
 * @see services/rating-slip/keys.ts - Query key factory
 * @see PRD-002 Rating Slip Service
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  CloseRatingSlipInput,
  CreateRatingSlipInput,
  RatingSlipDTO,
  RatingSlipWithDurationDTO,
  UpdateAverageBetInput,
} from '@/services/rating-slip/dtos';
import {
  closeRatingSlip,
  pauseRatingSlip,
  resumeRatingSlip,
  startRatingSlip,
  updateAverageBet,
} from '@/services/rating-slip/http';
import { ratingSlipKeys } from '@/services/rating-slip/keys';

/**
 * Starts a new rating slip for a visit at a gaming table.
 * Idempotent - returns existing open slip if one exists for the visit+table.
 *
 * Invalidates:
 * - All list queries (list.scope)
 * - Table-specific queries (forTable, activeForTable)
 */
export function useStartRatingSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRatingSlipInput) => startRatingSlip(input),
    onSuccess: (data: RatingSlipDTO) => {
      // Set detail cache for the new slip
      queryClient.setQueryData(ratingSlipKeys.detail(data.id), data);
      // Invalidate all list queries
      queryClient.invalidateQueries({ queryKey: ratingSlipKeys.list.scope });
      // Invalidate table-specific queries
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.forTable.scope,
      });
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.activeForTable(data.table_id),
      });
    },
  });
}

/**
 * Pauses an open rating slip.
 * Records a new pause interval with started_at = now.
 * Fails if slip is not in 'open' status.
 *
 * Invalidates:
 * - Slip detail (status changed to 'paused')
 * - All list queries
 * - Active slips for table
 */
export function usePauseRatingSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slipId: string) => pauseRatingSlip(slipId),
    onSuccess: (data: RatingSlipDTO) => {
      // Update detail cache with new status
      queryClient.setQueryData(ratingSlipKeys.detail(data.id), data);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: ratingSlipKeys.list.scope });
      // Invalidate active slips for this table
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.activeForTable(data.table_id),
      });
    },
  });
}

/**
 * Resumes a paused rating slip.
 * Sets ended_at on the active pause interval.
 * Fails if slip is not in 'paused' status.
 *
 * Invalidates:
 * - Slip detail (status changed to 'open')
 * - All list queries
 * - Active slips for table
 */
export function useResumeRatingSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slipId: string) => resumeRatingSlip(slipId),
    onSuccess: (data: RatingSlipDTO) => {
      // Update detail cache with new status
      queryClient.setQueryData(ratingSlipKeys.detail(data.id), data);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: ratingSlipKeys.list.scope });
      // Invalidate active slips for this table
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.activeForTable(data.table_id),
      });
    },
  });
}

/**
 * Closes a rating slip and calculates final duration.
 * Optionally updates average_bet before closing.
 * Fails if slip is already closed or archived.
 *
 * Invalidates:
 * - Slip detail (status changed to 'closed', duration finalized)
 * - All list queries
 * - Active slips for table
 * - Removes duration query (no longer needed for closed slip)
 */
export function useCloseRatingSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      slipId,
      input,
    }: {
      slipId: string;
      input?: CloseRatingSlipInput;
    }) => closeRatingSlip(slipId, input),
    onSuccess: (data: RatingSlipWithDurationDTO) => {
      // Update detail cache with closed status
      queryClient.setQueryData(ratingSlipKeys.detail(data.id), data);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: ratingSlipKeys.list.scope });
      // Invalidate active slips for this table (slip no longer active)
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.activeForTable(data.table_id),
      });
      // Remove duration query - slip is closed, duration is final
      queryClient.removeQueries({ queryKey: ratingSlipKeys.duration(data.id) });
    },
  });
}

/**
 * Updates the average bet on an open or paused rating slip.
 * Can be called multiple times before closing.
 *
 * Invalidates:
 * - Slip detail (average_bet updated)
 */
export function useUpdateAverageBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      slipId,
      input,
    }: {
      slipId: string;
      input: UpdateAverageBetInput;
    }) => updateAverageBet(slipId, input),
    onSuccess: (data: RatingSlipDTO) => {
      // Update detail cache with new average_bet
      queryClient.setQueryData(ratingSlipKeys.detail(data.id), data);
    },
  });
}

// Re-export types for convenience
export type {
  CloseRatingSlipInput,
  CreateRatingSlipInput,
  UpdateAverageBetInput,
};
