/**
 * RatingSlipModal Query Key Factory
 *
 * Centralized query key definitions for TanStack Query caching.
 * Follows PT-2 key factory pattern for consistent cache management.
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see EXECUTION-SPEC-PRD-008.md WS3
 */

/**
 * Query key factory for rating slip modal operations.
 *
 * Key structure:
 * - ['rating-slip-modal'] - Root scope for all modal queries
 * - ['rating-slip-modal', 'data', slipId] - Modal data for specific slip
 *
 * @example
 * ```ts
 * // Fetch modal data
 * useQuery({
 *   queryKey: ratingSlipModalKeys.data(slipId),
 *   queryFn: () => fetchRatingSlipModalData(slipId),
 * });
 *
 * // Invalidate all modal queries
 * queryClient.invalidateQueries({ queryKey: ratingSlipModalKeys.scope });
 *
 * // Invalidate specific slip modal
 * queryClient.invalidateQueries({ queryKey: ratingSlipModalKeys.data(slipId) });
 * ```
 */
export const ratingSlipModalKeys = {
  /** Root scope for all rating slip modal queries */
  scope: ['rating-slip-modal'] as const,

  /**
   * Query key for modal data fetch.
   * @param slipId - Rating slip UUID
   */
  data: (slipId: string) => ['rating-slip-modal', 'data', slipId] as const,
} as const;
