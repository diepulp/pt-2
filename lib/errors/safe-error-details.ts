/**
 * Safe Error Details Extraction
 *
 * Extracts only JSON-serializable properties from error objects.
 * Prevents "cyclic object value" (Firefox) / "Converting circular structure
 * to JSON" (Chrome/Node) when NextResponse.json() serializes DomainError.details
 * that contain raw Error/Supabase/PostgrestError objects with internal circular refs.
 *
 * INV-ERR-DETAILS: The `details` field of DomainError and ServiceResult MUST be
 * JSON-serializable. Raw Error objects must not be stored in `details`.
 *
 * @see lib/errors/domain-errors.ts — DomainError.details
 * @see lib/http/service-response.ts — safeDetails() boundary guard
 */

/**
 * Extract only JSON-safe properties from an error or unknown value.
 *
 * For Error instances: extracts message, name, code, hint (common Postgres fields).
 * For plain objects: extracts known safe string/number keys.
 * For primitives: returns as-is.
 *
 * @example
 * ```ts
 * // BEFORE (unsafe — raw Error can have circular refs)
 * throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
 *
 * // AFTER (safe — only serializable properties extracted)
 * throw new DomainError('INTERNAL_ERROR', error.message, { details: safeErrorDetails(error) });
 * ```
 */
export function safeErrorDetails(
  error: unknown,
): Record<string, unknown> | string | undefined {
  if (error == null) return undefined;

  if (error instanceof Error) {
    const safe: Record<string, unknown> = {
      message: error.message,
      name: error.name,
    };
    // Preserve Postgres/PostgREST error code if present
    if (
      'code' in error &&
      typeof (error as { code: unknown }).code === 'string'
    ) {
      safe.code = (error as { code: string }).code;
    }
    // Preserve hint from PostgrestError
    if (
      'hint' in error &&
      typeof (error as { hint: unknown }).hint === 'string'
    ) {
      safe.hint = (error as { hint: string }).hint;
    }
    // Preserve details string from PostgrestError (not nested objects)
    if (
      'details' in error &&
      typeof (error as { details: unknown }).details === 'string'
    ) {
      safe.details = (error as { details: string }).details;
    }
    return safe;
  }

  if (typeof error === 'object') {
    // For Supabase { code, message, details, hint } error shapes
    const obj = error as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const key of ['code', 'message', 'details', 'hint']) {
      if (
        key in obj &&
        (typeof obj[key] === 'string' || typeof obj[key] === 'number')
      ) {
        safe[key] = obj[key];
      }
    }
    return Object.keys(safe).length > 0 ? safe : String(error);
  }

  return String(error);
}
