/**
 * Rating Slip React Query Hooks
 *
 * Hooks for rating slip data fetching and mutations.
 * Uses RLS-scoped endpoints (no casinoId parameter needed).
 *
 * @see services/rating-slip/http.ts - HTTP fetchers
 * @see services/rating-slip/keys.ts - Query key factories
 * @see PRD-002 Rating Slip Service
 */

// Query hooks
export {
  useActiveSlipsForTable,
  useRatingSlip,
  useRatingSlipDuration,
  useRatingSlipList,
  useRatingSlipsForTable,
} from './use-rating-slip';

// Mutation hooks
export {
  useCloseRatingSlip,
  usePauseRatingSlip,
  useResumeRatingSlip,
  useStartRatingSlip,
  useUpdateAverageBet,
} from './use-rating-slip-mutations';

// Re-export keys for manual invalidation
export { ratingSlipKeys } from '@/services/rating-slip/keys';

// Re-export types for convenience
export type {
  CloseRatingSlipInput,
  CreateRatingSlipInput,
  RatingSlipDTO,
  RatingSlipListFilters,
  RatingSlipStatus,
  RatingSlipWithDurationDTO,
  RatingSlipWithPausesDTO,
  UpdateAverageBetInput,
} from '@/services/rating-slip/dtos';
