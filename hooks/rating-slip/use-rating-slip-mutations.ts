/**
 * Rating Slip Mutation Hooks
 *
 * Canonical hooks for rating slip lifecycle mutations: start, pause, resume, close.
 * All mutations automatically invalidate both ratingSlipKeys AND dashboardKeys
 * using targeted cache updates.
 *
 * PERF-005 WS8: Consolidated from 2-3 parallel implementations per operation.
 * These are the ONLY mutation hooks for core lifecycle — components must NOT
 * define inline useMutation() for start/pause/resume/close.
 *
 * @see services/rating-slip/http.ts - HTTP fetchers
 * @see services/rating-slip/keys.ts - Query key factory
 * @see PRD-002 Rating Slip Service
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dashboardKeys } from "@/hooks/dashboard/keys";
import { accrueOnClose } from "@/services/loyalty/http";
import type {
  CloseRatingSlipInput,
  CreateRatingSlipInput,
  RatingSlipDTO,
  RatingSlipWithDurationDTO,
  UpdateAverageBetInput,
} from "@/services/rating-slip/dtos";
import {
  closeRatingSlip,
  pauseRatingSlip,
  resumeRatingSlip,
  startRatingSlip,
  updateAverageBet,
} from "@/services/rating-slip/http";
import { ratingSlipKeys } from "@/services/rating-slip/keys";
import { ratingSlipModalKeys } from "@/services/rating-slip-modal/keys";

/**
 * Starts a new rating slip for a visit at a gaming table.
 * Idempotent - returns existing open slip if one exists for the visit+table.
 *
 * PERF-005 WS8: Invalidates both ratingSlipKeys and dashboardKeys.
 *
 * Invalidates:
 * - Active slips for table (ratingSlipKeys + dashboardKeys)
 * - Dashboard stats and tables (occupancy changed)
 */
export function useStartRatingSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      input,
    }: {
      input: CreateRatingSlipInput;
      casinoId: string;
    }) => startRatingSlip(input),
    onSuccess: (
      data: RatingSlipDTO,
      { casinoId }: { input: CreateRatingSlipInput; casinoId: string },
    ) => {
      // Set detail cache for the new slip
      queryClient.setQueryData(ratingSlipKeys.detail(data.id), data);
      // Invalidate active slips for this table (targeted, not broad .scope)
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.activeForTable(data.table_id),
      });
      // PERF-005 WS8: Dashboard invalidation (was missing from canonical hooks)
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.activeSlips(data.table_id),
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.tables(casinoId),
      });
    },
  });
}

/**
 * Pauses an open rating slip.
 * Records a new pause interval with started_at = now.
 * Fails if slip is not in 'open' status.
 *
 * PERF-005 WS8: Invalidates both ratingSlipKeys and dashboardKeys.
 *
 * Invalidates:
 * - Slip detail (status changed to 'paused')
 * - Modal data (for immediate UI update)
 * - Active slips for table (ratingSlipKeys + dashboardKeys)
 * - Dashboard stats
 */
export function usePauseRatingSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slipId }: { slipId: string; casinoId: string }) =>
      pauseRatingSlip(slipId),
    onSuccess: (
      data: RatingSlipDTO,
      { casinoId }: { slipId: string; casinoId: string },
    ) => {
      // Update detail cache with new status
      queryClient.setQueryData(ratingSlipKeys.detail(data.id), data);
      // Invalidate modal data for immediate UI update
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.data(data.id),
      });
      // Invalidate active slips for this table (targeted, not broad .scope)
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.activeForTable(data.table_id),
      });
      // PERF-005 WS8: Dashboard invalidation
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.activeSlips(data.table_id),
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
    },
  });
}

/**
 * Resumes a paused rating slip.
 * Sets ended_at on the active pause interval.
 * Fails if slip is not in 'paused' status.
 *
 * PERF-005 WS8: Invalidates both ratingSlipKeys and dashboardKeys.
 *
 * Invalidates:
 * - Slip detail (status changed to 'open')
 * - Modal data (for immediate UI update)
 * - Active slips for table (ratingSlipKeys + dashboardKeys)
 * - Dashboard stats
 */
export function useResumeRatingSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slipId }: { slipId: string; casinoId: string }) =>
      resumeRatingSlip(slipId),
    onSuccess: (
      data: RatingSlipDTO,
      { casinoId }: { slipId: string; casinoId: string },
    ) => {
      // Update detail cache with new status
      queryClient.setQueryData(ratingSlipKeys.detail(data.id), data);
      // Invalidate modal data for immediate UI update
      queryClient.invalidateQueries({
        queryKey: ratingSlipModalKeys.data(data.id),
      });
      // Invalidate active slips for this table (targeted, not broad .scope)
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.activeForTable(data.table_id),
      });
      // PERF-005 WS8: Dashboard invalidation
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.activeSlips(data.table_id),
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
    },
  });
}

/**
 * Closes a rating slip and calculates final duration.
 * Optionally updates average_bet before closing.
 * Fails if slip is already closed or archived.
 *
 * PERF-005 WS8: Consolidates close from all paths:
 * - Modal close (use-close-with-financial.ts handles chips-taken + financial separately)
 * - Dashboard close (ActiveSlipsPanel)
 * - Direct close
 *
 * Triggers loyalty accrual (fire-and-forget) for non-ghost visits.
 * This fixes the P0-2 loyalty bug where close from ActiveSlipsPanel
 * did NOT trigger accrueOnClose().
 *
 * Invalidates:
 * - Slip detail (status changed to 'closed', duration finalized)
 * - Active slips for table (ratingSlipKeys + dashboardKeys)
 * - Dashboard stats and tables (occupancy changed)
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
      casinoId: string;
      playerId?: string | null;
      input?: CloseRatingSlipInput;
    }) => closeRatingSlip(slipId, input),
    onSuccess: (
      data: RatingSlipWithDurationDTO,
      {
        slipId,
        casinoId,
        playerId,
      }: {
        slipId: string;
        casinoId: string;
        playerId?: string | null;
        input?: CloseRatingSlipInput;
      },
    ) => {
      // Update detail cache with closed status
      queryClient.setQueryData(ratingSlipKeys.detail(data.id), data);
      // Invalidate active slips for this table (slip no longer active, targeted)
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.activeForTable(data.table_id),
      });
      // Remove duration query - slip is closed, duration is final
      queryClient.removeQueries({ queryKey: ratingSlipKeys.duration(data.id) });
      // PERF-005 WS8: Dashboard invalidation
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.activeSlips(data.table_id),
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.tables(casinoId),
      });
      // PERF-005 WS8: Trigger loyalty accrual (fire-and-forget)
      // Fixes P0-2 bug: close from ActiveSlipsPanel did NOT trigger accrueOnClose()
      if (playerId) {
        accrueOnClose({
          ratingSlipId: slipId,
          casinoId,
          idempotencyKey: slipId,
        }).catch(() => {
          // Fire-and-forget: loyalty accrual is best-effort
        });
      }
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
