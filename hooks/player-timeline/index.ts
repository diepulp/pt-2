/**
 * Player Timeline Hooks
 *
 * React Query hooks for the Player 360 interaction timeline.
 *
 * @see services/player-timeline - Timeline service layer
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 */

export {
  useInfinitePlayerTimeline,
  usePlayerTimeline,
  type UseInfinitePlayerTimelineOptions,
  type UsePlayerTimelineOptions,
} from './use-player-timeline';

// Re-export commonly used types for convenience
export type {
  InteractionEventDTO,
  InteractionEventType,
  Phase1EventType,
  TimelineFilters,
  TimelineResponse,
} from '@/services/player-timeline/dtos';
