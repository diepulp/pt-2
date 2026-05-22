/**
 * Client-Side Error Normalization
 *
 * Sanitizes raw Supabase / PostgREST provider errors before they propagate
 * to React Query, toast notifications, or error boundaries.
 *
 * Contract:
 * - Accepts `unknown` — never throws.
 * - Strips all raw provider content from the returned Error message.
 * - Logs the original error (dev only, via logError) before stripping.
 * - Returns a plain `new Error(safeMessage)` in every code path.
 *
 * @see PRD-081 WS1 — Client-Side Error Handling Standardization
 */

import { logError } from './error-utils';

// ============================================================================
// TYPE GUARD
// ============================================================================

/**
 * Structural duck-type guard for the PostgREST error shape.
 *
 * Does NOT use `instanceof` — the shape is sufficient and avoids import
 * coupling to the Supabase client library.
 *
 * @param e - Value to test
 * @returns `true` when `e` carries the four canonical PostgREST error fields
 */
export function isPostgrestErrorShape(e: unknown): e is {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
} {
  if (e === null || typeof e !== 'object') {
    return false;
  }
  const candidate = e as Record<string, unknown>;
  return (
    typeof candidate['code'] === 'string' &&
    typeof candidate['message'] === 'string' &&
    (candidate['details'] === null ||
      typeof candidate['details'] === 'string') &&
    (candidate['hint'] === null || typeof candidate['hint'] === 'string')
  );
}

// ============================================================================
// CLASSIFICATION HELPERS
// ============================================================================

/**
 * Maps a PostgREST error code to a safe, user-facing message.
 *
 * Priority:
 * 1. `42501` — PostgreSQL insufficient_privilege (explicit)
 * 2. `PGRST301` or code starting with `'4'` — access denied family
 * 3. Any other shape match — service temporarily unavailable
 */
function classifyPostgrestCode(code: string): string {
  // Explicit PostgreSQL insufficient_privilege
  if (code === '42501') {
    return 'You do not have permission to perform this action.';
  }

  // PGRST301 (PostgREST JWT/role-related) or any 4xx-family code
  if (code === 'PGRST301' || code.startsWith('4')) {
    return 'You do not have access to this resource.';
  }

  return 'The service is temporarily unavailable. Please try again.';
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Normalizes any caught value into a safe, user-facing `Error`.
 *
 * Raw provider messages are never included in the returned error's `.message`.
 * The original value is logged (development only) before stripping.
 *
 * @param error - Any thrown value (`unknown`)
 * @returns A plain `Error` with a sanitized, user-safe message
 *
 * @example
 * ```ts
 * const { data, error } = await supabase.rpc('some_rpc');
 * if (error) throw normalizeClientError(error);
 * ```
 */
export function normalizeClientError(error: unknown): Error {
  // Log the original value for dev diagnostics before we strip it.
  logError(error, { component: 'client-boundary', action: 'provider-error' });

  if (isPostgrestErrorShape(error)) {
    return new Error(classifyPostgrestCode(error.code));
  }

  // All other inputs (plain Error, string, null, undefined, network failures)
  // receive the generic network/unknown message. We deliberately do not
  // forward `.message` from an existing Error — we cannot verify it is safe.
  return new Error('Something went wrong. Please try again.');
}
