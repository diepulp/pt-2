/**
 * RecognitionService React Query Key Factories
 *
 * Uses .scope pattern for surgical cache invalidation.
 *
 * @see PRD-051 / EXEC-051 WS2
 */

const ROOT = ['recognition'] as const;

export const recognitionKeys = {
  /** Root key for all recognition queries */
  root: ROOT,

  // === Query Keys ===

  /** Company-scoped player lookup */
  lookup: Object.assign(
    (searchTerm: string) => [...ROOT, 'lookup', searchTerm] as const,
    { scope: [...ROOT, 'lookup'] as const },
  ),

  // === Mutation Keys ===

  /** Local activation mutation */
  activate: () => [...ROOT, 'activate'] as const,

  /** Local redemption mutation */
  redeem: () => [...ROOT, 'redeem'] as const,
};
