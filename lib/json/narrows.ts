/**
 * JSONB Boundary Narrowing Helpers
 *
 * Centralized utilities for crossing the Json ↔ typed-object boundary.
 * Supabase JSONB columns and RPC return types are typed as `Json`
 * (a wide union of primitives, objects, and arrays). These helpers
 * provide auditable, single-point narrowing instead of scattered
 * `as` casts in crud.ts files.
 *
 * Usage:
 *   - `narrowJsonRecord` — JSONB column → Record<string, unknown>
 *   - `narrowRpcJson<T>` — JSONB RPC return → typed response shape
 *   - `isJsonObject` — type guard for runtime validation
 *
 * Hook enforcement: pre-commit-service-check.sh Check 11 bans inline
 * `as [A-Z]` in crud.ts. All JSONB narrowing belongs here or in mappers.ts.
 */

import type { Json } from '@/types/database.types';

/**
 * Type guard: is this Json value a non-null, non-array object?
 *
 * Use before narrowing to Record<string, unknown> or accessing
 * object properties on a Json value.
 */
export function isJsonObject(
  value: Json,
): value is { [key: string]: Json | undefined } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Narrow a Json value to Record<string, unknown>.
 *
 * Returns empty object for null, primitives, or arrays.
 * Use for JSONB columns that store key-value metadata
 * (e.g., player_loyalty.preferences, interaction_event.metadata).
 */
export function narrowJsonRecord(value: Json): Record<string, unknown> {
  if (isJsonObject(value)) return value;
  return {};
}

/**
 * Narrow a JSONB RPC response to its expected typed shape.
 *
 * Supabase RPCs that return JSONB are typed as `Json` in the generated
 * client. The mapper expects a structured type (e.g., VisitLiveViewRpcResponse).
 * This function is the single auditable boundary crossing for that case.
 *
 * The narrowing is unsafe (no runtime validation) — the RPC contract is
 * trusted. If runtime validation is needed, use Zod or a type guard instead.
 *
 * @example
 *   // In mappers.ts:
 *   export function toVisitLiveViewDTOOrNull(data: Json | null) {
 *     if (!data) return null;
 *     const rpc = narrowRpcJson<VisitLiveViewRpcResponse>(data);
 *     return toVisitLiveViewDTO(rpc);
 *   }
 */
export function narrowRpcJson<T>(data: Json): T {
  return data as unknown as T;
}
