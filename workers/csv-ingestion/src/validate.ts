/**
 * Row Validation
 *
 * Validates a normalized row against the ImportPlayerV1 contract rules.
 * The validation logic mirrors the `importPlayerV1Schema` refinements from
 * `services/player-import/schemas.ts` and the identifier checks in
 * `rpc_import_execute` SQL.
 *
 * Validation rules (source of truth: importPlayerV1Schema + rpc_import_execute):
 * - At least one of `identifiers.email` or `identifiers.phone` MUST be present.
 * - `profile.first_name` is required (max 100 chars).
 * - `profile.last_name` is required (max 100 chars).
 * - `identifiers.email`, if present, must look like a valid email address.
 * - `identifiers.phone`, if present, must be 7–20 characters.
 * - `profile.dob`, if present, must match YYYY-MM-DD format.
 *
 * Rows that fail validation are inserted with status = 'error'. The execute
 * RPC will skip 'error' rows — only 'staged' rows are processed.
 *
 * @see services/player-import/schemas.ts (importPlayerV1Schema)
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import type { NormalizedRow, ImportPlayerV1Payload } from './normalize.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of validating a single normalized row.
 * Carries everything needed for the `import_row` INSERT.
 */
export interface ValidationResult {
  /** True if the row passed all validation rules. */
  valid: boolean;
  /** 1-indexed row position in the CSV. */
  row_number: number;
  /** Raw CSV row (for auditability). */
  raw_row: Record<string, string | null>;
  /** Structured ImportPlayerV1 payload. */
  normalized_payload: ImportPlayerV1Payload;
  /** 'staged' for valid rows, 'error' for invalid rows. */
  status: 'staged' | 'error';
  /** Short machine-readable error code, or null for staged rows. */
  reason_code: string | null;
  /** Human-readable error detail joined from all validation failures. */
  reason_detail: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Basic email format check — matches the Zod `z.string().email()` semantics. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** YYYY-MM-DD date format (permissive — month/day ranges not enforced). */
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a normalized row and produce an insertion-ready result.
 *
 * Returns a `ValidationResult` with `status = 'staged'` if all rules pass,
 * or `status = 'error'` with a `reason_detail` listing all failures.
 *
 * @param row - Output of {@link normalizeRow}.
 * @returns Validation result with insertion-ready status and error codes.
 */
export function validateRow(row: NormalizedRow): ValidationResult {
  const { identifiers, profile } = row.normalized_payload;
  const errors: string[] = [];

  // --- Profile requirements ---

  // first_name required
  if (!profile.first_name || profile.first_name.trim() === '') {
    errors.push('missing first_name');
  } else if (profile.first_name.length > 100) {
    errors.push('first_name exceeds 100 characters');
  }

  // last_name required
  if (!profile.last_name || profile.last_name.trim() === '') {
    errors.push('missing last_name');
  } else if (profile.last_name.length > 100) {
    errors.push('last_name exceeds 100 characters');
  }

  // --- Identifier requirements ---

  const hasEmail =
    identifiers.email !== undefined && identifiers.email.trim().length > 0;
  const hasPhone =
    identifiers.phone !== undefined && identifiers.phone.trim().length > 0;

  if (!hasEmail && !hasPhone) {
    errors.push('at least one of email or phone is required');
  } else {
    if (hasEmail && !EMAIL_RE.test(identifiers.email!)) {
      errors.push('invalid email format');
    }
    if (hasPhone) {
      const phoneLen = identifiers.phone!.trim().length;
      if (phoneLen < 7 || phoneLen > 20) {
        errors.push('phone must be 7–20 characters');
      }
    }
  }

  // --- Optional field format checks ---

  if (profile.dob !== undefined && profile.dob !== null) {
    if (!DOB_RE.test(profile.dob)) {
      errors.push('dob must be YYYY-MM-DD format');
    }
  }

  // --- Build result ---

  if (errors.length > 0) {
    return {
      valid: false,
      row_number: row.row_number,
      raw_row: row.raw_row,
      normalized_payload: row.normalized_payload,
      status: 'error',
      reason_code: 'VALIDATION_FAILED',
      reason_detail: errors.join('; '),
    };
  }

  return {
    valid: true,
    row_number: row.row_number,
    raw_row: row.raw_row,
    normalized_payload: row.normalized_payload,
    status: 'staged',
    reason_code: null,
    reason_detail: null,
  };
}
