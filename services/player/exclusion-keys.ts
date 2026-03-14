/**
 * Player Exclusion React Query Key Factory
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS4
 */

const ROOT = ['player-exclusion'] as const;

export const exclusionKeys = {
  root: ROOT,
  list: (playerId: string) => [...ROOT, 'list', playerId] as const,
  active: (playerId: string) => [...ROOT, 'active', playerId] as const,
  detail: (exclusionId: string) => [...ROOT, 'detail', exclusionId] as const,
  status: (playerId: string) => [...ROOT, 'status', playerId] as const,
};
