/**
 * RPC Boundary Normalization
 *
 * Standard helper for stripping undefined keys from RPC arg objects
 * before they cross the Supabase client boundary.
 *
 * When to use:
 *   - Args assembled from nullable/DB-shaped sources (row data,
 *     query params, merged partials) where null could leak in.
 *   - Refactored or new RPC calls assembling args at the boundary.
 *
 * When NOT needed:
 *   - Args from a validated DTO that cannot be null (Zod-parsed,
 *     typed as `string | undefined`, never `string | null`).
 *     JSON.stringify already drops undefined keys.
 *
 * @see docs/issues/dual-type-system/PARAM-NORMALIZATION-001.md
 */
export function omitUndefined<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
