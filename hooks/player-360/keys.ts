/**
 * Player 360 Query Key Factory
 *
 * Follows pattern from services/player/keys.ts.
 * Enables React Query deduplication across panels.
 *
 * @see PRD-022 Definition of Done - shared query key registry
 */

const ROOT = ["player-360"] as const;

export const player360Keys = {
  /** Root key for all player-360 queries */
  root: ROOT,

  /** All queries for a specific player */
  all: (playerId: string) => [...ROOT, playerId] as const,

  /** Player profile/snapshot data */
  profile: (playerId: string) => [...ROOT, playerId, "profile"] as const,

  /** Interaction timeline */
  timeline: (playerId: string) => [...ROOT, playerId, "timeline"] as const,

  /** Collaboration notes */
  notes: (playerId: string) => [...ROOT, playerId, "notes"] as const,

  /** Player tags */
  tags: (playerId: string) => [...ROOT, playerId, "tags"] as const,

  /** Metrics/KPIs */
  metrics: (playerId: string) => [...ROOT, playerId, "metrics"] as const,

  /** Compliance (CTR/MTL) */
  compliance: (playerId: string) => [...ROOT, playerId, "compliance"] as const,

  /** Loyalty rewards */
  loyalty: (playerId: string) => [...ROOT, playerId, "loyalty"] as const,

  /** Recent events for timeline strip */
  recentEvents: (playerId: string) =>
    [...ROOT, playerId, "recentEvents"] as const,
} as const;
