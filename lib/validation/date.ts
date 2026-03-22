/**
 * Shared Date/DateTime Validation Utilities
 *
 * Provides canonical Zod schemas for date and datetime fields.
 *
 * Two semantic types:
 * - **Calendar date** (YYYY-MM-DD): effective dates, birth dates, gaming days.
 *   Use `dateSchema()`. HTML `<input type="date">` produces this format natively.
 * - **Timestamp** (ISO 8601 datetime): created_at, started_at, occurred_at.
 *   Use `datetimeSchema()`. Requires full ISO 8601 with timezone.
 *
 * Choosing the wrong one causes the HTML-input ↔ server-validation mismatch
 * that produced the "Failed to create exclusion" bug (PRD-052).
 */

import { z } from 'zod';

// === Format Constants ===

/**
 * YYYY-MM-DD format regex for calendar dates.
 *
 * Matches: 2026-03-22
 * Rejects: 2026-03-22T00:00:00Z, 03-22-2026, 2026/03/22
 */
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// === Zod Schema Helpers ===

/**
 * Zod schema for calendar date fields (YYYY-MM-DD).
 *
 * Use for fields where only the date matters, not the time:
 * effective_from, effective_until, review_date, birth_date, gaming_day.
 *
 * Compatible with HTML `<input type="date">` without client-side conversion.
 *
 * @param fieldName - Name of the field for error messages
 */
export function dateSchema(fieldName = 'date') {
  return z.string().regex(DATE_REGEX, `${fieldName} must be YYYY-MM-DD format`);
}

/**
 * Zod schema for timestamp fields (ISO 8601 datetime).
 *
 * Use for fields where the exact moment matters:
 * created_at, started_at, ended_at, occurred_at.
 *
 * Requires full ISO 8601: "2026-03-22T00:00:00.000Z".
 * HTML `<input type="datetime-local">` values must be converted via
 * `new Date(value).toISOString()` before submission.
 *
 * @param fieldName - Name of the field for error messages
 */
export function datetimeSchema(fieldName = 'timestamp') {
  return z.iso.datetime({
    message: `${fieldName} must be ISO 8601 datetime`,
  });
}
