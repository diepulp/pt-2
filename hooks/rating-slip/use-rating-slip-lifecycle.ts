/**
 * Rating Slip Lifecycle Hooks
 *
 * TanStack Query mutations for rating slip lifecycle operations:
 * - Start new rating slip
 * - Pause active slip
 * - Resume paused slip
 * - Close rating slip
 *
 * All mutations include idempotency keys and query invalidation.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ratingSlipKeys } from "@/services/rating-slip";
import type { StartRatingSlipInput } from "@/services/rating-slip";
import type { Database } from "@/types/database.types";

// ============================================================================
// TYPES
// ============================================================================

type RatingSlipRow = Database["public"]["Tables"]["rating_slip"]["Row"];

interface StartRatingSlipResponse {
  success: boolean;
  ratingSlipId: string;
}

interface RatingSlipMutationResponse {
  success: boolean;
  slip: RatingSlipRow;
}

interface CloseRatingSlipResponse {
  success: boolean;
  slip: RatingSlipRow;
  durationSeconds: number;
}

interface CloseRatingSlipParams {
  ratingSlipId: string;
  averageBet?: number;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Start rating slip mutation
 *
 * Creates a new rating slip in "open" state.
 * Calls POST /api/v1/rating-slip/start
 *
 * @example
 * const { mutate, isPending } = useStartRatingSlip();
 * mutate({
 *   playerId: '123',
 *   tableId: '456',
 *   visitId: '789',
 *   seatNumber: '1',
 *   gameSettings: { minBet: 10 }
 * });
 */
export function useStartRatingSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ratingSlipKeys.start(),

    mutationFn: async (params: StartRatingSlipInput) => {
      const idempotencyKey = crypto.randomUUID();

      const response = await fetch("/api/v1/rating-slip/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to start rating slip");
      }

      return response.json() as Promise<StartRatingSlipResponse>;
    },

    onSuccess: () => {
      // Invalidate all rating slip queries
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.root,
      });
    },
  });
}

/**
 * Pause rating slip mutation
 *
 * Pauses an open rating slip.
 * Calls POST /api/v1/rating-slip/[id]/pause
 *
 * @example
 * const { mutate, isPending } = usePauseRatingSlip();
 * mutate('rating-slip-id');
 */
export function usePauseRatingSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    // Generic mutation key (W1 fix)
    mutationKey: ratingSlipKeys.pause(""),

    mutationFn: async (ratingSlipId: string) => {
      const idempotencyKey = crypto.randomUUID();

      const response = await fetch(
        `/api/v1/rating-slip/${ratingSlipId}/pause`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": idempotencyKey,
          },
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to pause rating slip");
      }

      return response.json() as Promise<RatingSlipMutationResponse>;
    },

    onSuccess: (_, ratingSlipId) => {
      // Invalidate specific slip and list queries
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.detail(ratingSlipId),
      });
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.list.scope,
      });
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.duration(ratingSlipId),
      });
    },
  });
}

/**
 * Resume rating slip mutation
 *
 * Resumes a paused rating slip.
 * Calls POST /api/v1/rating-slip/[id]/resume
 *
 * @example
 * const { mutate, isPending } = useResumeRatingSlip();
 * mutate('rating-slip-id');
 */
export function useResumeRatingSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    // Generic mutation key (W1 fix)
    mutationKey: ratingSlipKeys.resume(""),

    mutationFn: async (ratingSlipId: string) => {
      const idempotencyKey = crypto.randomUUID();

      const response = await fetch(
        `/api/v1/rating-slip/${ratingSlipId}/resume`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": idempotencyKey,
          },
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to resume rating slip");
      }

      return response.json() as Promise<RatingSlipMutationResponse>;
    },

    onSuccess: (_, ratingSlipId) => {
      // Invalidate specific slip and list queries
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.detail(ratingSlipId),
      });
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.list.scope,
      });
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.duration(ratingSlipId),
      });
    },
  });
}

/**
 * Close rating slip mutation
 *
 * Closes a rating slip with final telemetry.
 * Calls POST /api/v1/rating-slip/[id]/close
 *
 * @example
 * const { mutate, isPending } = useCloseRatingSlip();
 * mutate({ ratingSlipId: '123', averageBet: 25 });
 */
export function useCloseRatingSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    // Generic mutation key (W1 fix)
    mutationKey: ratingSlipKeys.close(""),

    mutationFn: async ({ ratingSlipId, averageBet }: CloseRatingSlipParams) => {
      const idempotencyKey = crypto.randomUUID();

      const response = await fetch(
        `/api/v1/rating-slip/${ratingSlipId}/close`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ averageBet }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to close rating slip");
      }

      return response.json() as Promise<CloseRatingSlipResponse>;
    },

    onSuccess: (_, { ratingSlipId }) => {
      // Invalidate specific slip and list queries
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.detail(ratingSlipId),
      });
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.list.scope,
      });
      queryClient.invalidateQueries({
        queryKey: ratingSlipKeys.duration(ratingSlipId),
      });
    },
  });
}
