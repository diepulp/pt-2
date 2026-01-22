/**
 * PlayerTimeline Service Query Keys
 *
 * React Query key factory for timeline queries.
 * Follows established pattern from other services.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 */

import type { TimelineFilters } from "./dtos";

const ROOT = ["player-timeline"] as const;

/**
 * Serializes timeline filters to a stable string key.
 */
const serialize = (filters: TimelineFilters = {}): string => {
  const entries = Object.entries(filters).filter(
    ([, value]) => value !== undefined,
  );
  entries.sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
};

export const playerTimelineKeys = {
  /** Root key for all timeline queries */
  root: ROOT,

  /** Timeline list for a player with optional filters */
  list: Object.assign(
    (playerId: string, filters: TimelineFilters = {}) =>
      [...ROOT, "list", playerId, serialize(filters)] as const,
    { scope: [...ROOT, "list"] as const },
  ),

  /** Infinite timeline query for a player with optional filters */
  infinite: (playerId: string, filters: TimelineFilters = {}) =>
    [...ROOT, "infinite", playerId, serialize(filters)] as const,

  /** Single event detail (for drilldown) */
  detail: (eventId: string) => [...ROOT, "detail", eventId] as const,
};
