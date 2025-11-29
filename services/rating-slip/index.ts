/**
 * Rating Slip Service - Public API
 *
 * Bounded Context: Gameplay telemetry and session state tracking
 * Pattern: Hybrid (Pattern C) - State machine + telemetry CRUD
 */

// Lifecycle operations
export {
  startSlip,
  pauseSlip,
  resumeSlip,
  closeSlip,
  getDuration,
} from "./lifecycle";

// DTOs and Response types
export type {
  StartRatingSlipInput,
  RatingSlipDTO,
  RatingSlipCloseResponse,
} from "./lifecycle";

// Type guards
export {
  isValidRatingSlipData,
  isValidCloseResponse,
  isValidDurationResponse,
} from "./lifecycle";

// Query keys
export { ratingSlipKeys } from "./keys";
export type { RatingSlipListFilters } from "./keys";

// State machine (for UI/domain logic)
export {
  startSlip as startSlipTimeline,
  pauseSlip as pauseSlipTimeline,
  resumeSlip as resumeSlipTimeline,
  closeSlip as closeSlipTimeline,
  calculateDurationSeconds,
} from "./state-machine";
export type { RatingSlipTimeline, PauseInterval } from "./state-machine";
