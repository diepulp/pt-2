/**
 * Row Normalization
 *
 * Wraps the shared `lib/csv/header-normalization` module for use in the
 * ingestion worker and builds the structured `ImportPlayerV1` payload that
 * is stored in `import_row.normalized_payload`.
 *
 * Why the structured payload matters:
 * The `rpc_import_execute` SQL function reads nested JSONB paths such as
 * `normalized_payload -> 'identifiers' ->> 'email'` and
 * `normalized_payload -> 'profile' ->> 'first_name'`.
 * The payload MUST conform to the `ImportPlayerV1` shape (ADR-036 D2) or
 * the execute RPC will silently skip rows.
 *
 * Import path:
 * Uses a vendored copy at `./vendor/header-normalization.js` instead of a
 * cross-package relative path. TypeScript's `rootDir` enforcement prevents
 * importing across the worker's package boundary under NodeNext resolution.
 * The vendor file is an exact copy of `lib/csv/header-normalization.ts` and
 * must be kept in sync if the canonical source changes.
 *
 * @see lib/csv/header-normalization.ts (WS2 shared module)
 * @see services/player-import/dtos.ts  (ImportPlayerV1 contract)
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

import {
  applyColumnMapping,
  normalizeFieldValue,
  normalizeHeaders,
} from './vendor/header-normalization.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Structured `ImportPlayerV1` payload stored as JSONB in `import_row.normalized_payload`.
 *
 * Mirrors `ImportPlayerV1` from `services/player-import/dtos.ts` without
 * importing it (the worker does not depend on Next.js service layers).
 */
export interface ImportPlayerV1Payload {
  contract_version: 'v1';
  source: {
    vendor?: string;
    file_name?: string;
  };
  row_ref: {
    row_number: number;
  };
  identifiers: {
    email?: string;
    phone?: string;
    external_id?: string;
  };
  profile: {
    first_name?: string;
    last_name?: string;
    dob?: string | null;
  };
  notes?: string;
}

/**
 * Intermediate normalized row produced after header normalization and column
 * mapping, before validation.
 */
export interface NormalizedRow {
  /** 1-indexed position in the CSV file. */
  row_number: number;
  /** Raw key-value pairs keyed by normalized header names. */
  raw_row: Record<string, string | null>;
  /** Structured ImportPlayerV1 payload ready for DB insertion. */
  normalized_payload: ImportPlayerV1Payload;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize raw CSV headers into safe, deduplicated column names.
 *
 * Re-exports the shared implementation so callers only need to import from
 * this module.
 *
 * @see lib/csv/header-normalization.ts
 */
export { normalizeHeaders };

/**
 * Build a {@link NormalizedRow} from a single parsed CSV record.
 *
 * Steps:
 * 1. Apply the batch's `column_mapping` to extract canonical field values
 *    from the raw row (keyed by normalized header names).
 * 2. Normalize each field value (trim, null-coerce empty strings).
 * 3. Assemble the structured `ImportPlayerV1` payload.
 *
 * The `column_mapping` format is `{ canonicalField: originalCsvHeader }`.
 * For example: `{ email: 'Email Address', first_name: 'First Name' }`.
 *
 * @param rawRow - Parsed CSV row keyed by normalized header names.
 * @param normalizedHeaders - Ordered array of normalized header names.
 * @param columnMapping - Maps canonical field names to original CSV headers.
 * @param rowNumber - 1-indexed row position in the CSV.
 * @param sourceMeta - Optional source metadata (vendor, file_name) from the batch.
 * @returns A fully normalized row with the structured ImportPlayerV1 payload.
 */
export function normalizeRow(
  rawRow: Record<string, string | null>,
  normalizedHeaders: string[],
  columnMapping: Record<string, string>,
  rowNumber: number,
  sourceMeta?: { vendor?: string; file_name?: string },
): NormalizedRow {
  // Apply column mapping: extracts only the canonical fields present in the mapping.
  // Result keys are canonical field names (email, phone, first_name, etc.).
  const mapped = applyColumnMapping(rawRow, normalizedHeaders, columnMapping);

  // Helper: get a normalized string value from the mapped canonical fields.
  function field(key: string): string | undefined {
    const v = normalizeFieldValue(mapped[key] ?? null);
    return v !== null ? v : undefined;
  }

  // Helper: get a nullable string (e.g. dob can legitimately be null).
  function nullableField(key: string): string | null | undefined {
    if (!(key in mapped)) return undefined;
    return normalizeFieldValue(mapped[key] ?? null);
  }

  const identifiers: ImportPlayerV1Payload['identifiers'] = {};
  const emailVal = field('email');
  if (emailVal !== undefined) identifiers.email = emailVal;
  const phoneVal = field('phone');
  if (phoneVal !== undefined) identifiers.phone = phoneVal;
  const externalIdVal = field('external_id');
  if (externalIdVal !== undefined) identifiers.external_id = externalIdVal;

  const profile: ImportPlayerV1Payload['profile'] = {};
  const firstNameVal = field('first_name');
  if (firstNameVal !== undefined) profile.first_name = firstNameVal;
  const lastNameVal = field('last_name');
  if (lastNameVal !== undefined) profile.last_name = lastNameVal;
  const dobVal = nullableField('dob');
  if (dobVal !== undefined) profile.dob = dobVal;

  const notesVal = field('notes');

  const normalized_payload: ImportPlayerV1Payload = {
    contract_version: 'v1',
    source: sourceMeta ?? {},
    row_ref: { row_number: rowNumber },
    identifiers,
    profile,
    ...(notesVal !== undefined ? { notes: notesVal } : {}),
  };

  return {
    row_number: rowNumber,
    raw_row: rawRow,
    normalized_payload,
  };
}
