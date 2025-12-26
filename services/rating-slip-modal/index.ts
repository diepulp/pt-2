/**
 * RatingSlipModal BFF Service
 *
 * Backend-for-Frontend aggregation service for rating slip modal.
 * Aggregates data from 5 bounded contexts into a single response.
 *
 * This is a BFF service (not a domain service) - it orchestrates calls
 * to domain services without owning any domain logic.
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see EXECUTION-SPEC-PRD-008.md WS3
 */

// Re-export DTOs
export type {
  RatingSlipModalDTO,
  SlipSectionDTO,
  PlayerSectionDTO,
  LoyaltySectionDTO,
  LoyaltySuggestionDTO,
  FinancialSectionDTO,
  TableOptionDTO,
  ModalDataRouteParams,
} from "./dtos";

// Re-export schemas
export {
  modalDataRouteParamsSchema,
  ratingSlipModalSchema,
  slipSectionSchema,
  playerSectionSchema,
  loyaltySectionSchema,
  financialSectionSchema,
  tableOptionSchema,
} from "./schemas";

// Re-export query keys
export { ratingSlipModalKeys } from "./keys";

// Re-export HTTP fetchers
export { fetchRatingSlipModalData } from "./http";

// Re-export RPC functions (server-side only)
export { getModalDataViaRPC } from "./rpc";
