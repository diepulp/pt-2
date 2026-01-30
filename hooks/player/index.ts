/**
 * Player React Query Hooks
 *
 * Hooks for player-related data fetching using the new HTTP fetchers.
 * Uses RLS-scoped endpoints (no casinoId parameter needed for most queries).
 *
 * @see services/player/http.ts - HTTP fetchers
 * @see services/player/keys.ts - Query key factories
 * @see PRD-003 Player & Visit Management
 */

export { usePlayer, usePlayers } from './use-player';
export { usePlayerSearch } from './use-player-search';
export {
  useCreatePlayer,
  useEnrollPlayer,
  usePlayerEnrollment,
  useUpdatePlayer,
} from './use-player-mutations';
export {
  usePlayerIdentity,
  useUpdatePlayerIdentity,
} from './use-player-identity-mutation';

// Re-export types for convenience
export type {
  CreatePlayerDTO,
  PlayerDTO,
  PlayerEnrollmentDTO,
  PlayerListFilters,
  PlayerSearchResultDTO,
  UpdatePlayerDTO,
} from '@/services/player/dtos';
