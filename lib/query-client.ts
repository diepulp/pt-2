/**
 * @deprecated Use `lib/query/client.ts` instead.
 * This file will be removed in v2.0.
 *
 * Migration:
 * ```ts
 * // Before
 * import { queryClient, makeQueryClient } from '@/lib/query-client';
 *
 * // After
 * import { getQueryClient, makeQueryClient } from '@/lib/query/client';
 * ```
 */

// Re-export from new location for backward compatibility
export { makeQueryClient, getQueryClient as queryClient } from './query/client';
