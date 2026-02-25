/**
 * Shift Checkpoint React Query Key Factory (PRD-038)
 *
 * @see SLAD section 308 for key factory patterns
 */

const ROOT = ['table-context', 'shift-checkpoint'] as const;

export const shiftCheckpointKeys = {
  root: ROOT,

  /** Scope key for invalidation of all checkpoint queries */
  scope: [...ROOT] as const,

  /** Latest checkpoint (most recent) */
  latest: () => [...ROOT, 'latest'] as const,

  /** Delta comparison (current vs latest checkpoint) */
  delta: () => [...ROOT, 'delta'] as const,

  /** Checkpoints by gaming day */
  list: (gamingDay: string) => [...ROOT, 'list', gamingDay] as const,
};
