/**
 * PlayerTimeline Service
 *
 * Unified player interaction timeline for the Player 360 Dashboard.
 * Read-only projection across multiple source tables (ADR-029).
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see EXEC-SPEC-029.md
 */

// DTOs
export type {
  InteractionEventDTO,
  InteractionEventMetadata,
  InteractionEventType,
  Phase1EventType,
  RpcTimelineRow,
  TimelineCursor,
  TimelineFilters,
  TimelineQuery,
  TimelineResponse,
  // Metadata types
  ComplianceEventMetadata,
  FinancialEventMetadata,
  IdentityEventMetadata,
  LoyaltyEventMetadata,
  NoteEventMetadata,
  PromoEventMetadata,
  RatingEventMetadata,
  TagEventMetadata,
  VisitEventMetadata,
} from './dtos';

// Mappers
export {
  getEventTypeLabel,
  getSourceCategory,
  mapRpcResultToTimelineResponse,
  mapRpcRowToEvent,
} from './mappers';
export type { SourceCategory } from './mappers';

// CRUD
export { fetchPlayerTimeline, getPlayerTimeline } from './crud';

// Query Keys
export { playerTimelineKeys } from './keys';
