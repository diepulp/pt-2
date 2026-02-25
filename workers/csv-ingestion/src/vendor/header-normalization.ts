/**
 * Vendored copy of lib/csv/header-normalization.ts (WS2)
 *
 * This file is an exact copy of the shared module from the root lib/ directory.
 * It is vendored here so the worker package can remain self-contained with a
 * clean `rootDir` boundary (TypeScript's `rootDir` enforcement prevents direct
 * relative imports across package boundaries when using NodeNext module resolution).
 *
 * MAINTENANCE NOTE: If `lib/csv/header-normalization.ts` is updated, this file
 * must be kept in sync. The canonical source is:
 *   lib/csv/header-normalization.ts
 *
 * @see lib/csv/header-normalization.ts (canonical source, WS2)
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

/**
 * Normalize raw CSV headers into safe, deduplicated column names.
 *
 * Applies the following transformations in order:
 * 1. Trim whitespace from each header
 * 2. Strip BOM (U+FEFF) from the first header if present
 * 3. Replace embedded newlines (`\r\n`, `\r`, `\n`) with a single space
 * 4. Blank/whitespace-only headers become `_col_N` (1-indexed by position)
 * 5. Duplicate headers get `_2`, `_3`, etc. suffixes (first occurrence unchanged)
 *
 * @param rawHeaders - Array of raw CSV header strings from the parsed file
 * @returns Array of normalized header strings, same length as input
 */
export function normalizeHeaders(rawHeaders: string[]): string[] {
  // Phase 1: trim, strip BOM, replace newlines, fill blanks
  const cleaned = rawHeaders.map((raw, index) => {
    let header = raw.trim();

    // Strip BOM from first header
    if (index === 0 && header.charCodeAt(0) === 0xfeff) {
      header = header.slice(1).trim();
    }

    // Replace embedded newlines with a single space
    header = header.replace(/\r\n|\r|\n/g, ' ');

    // Blank headers become positional placeholders
    if (header === '') {
      return `_col_${index + 1}`;
    }

    return header;
  });

  // Phase 2: deduplicate — first occurrence keeps name, subsequent get _N suffix
  const seen = new Map<string, number>();
  const result: string[] = [];

  for (const header of cleaned) {
    const count = seen.get(header);
    if (count === undefined) {
      seen.set(header, 1);
      result.push(header);
    } else {
      const next = count + 1;
      seen.set(header, next);
      result.push(`${header}_${next}`);
    }
  }

  return result;
}

/**
 * Normalize a single CSV field value.
 *
 * - `null` or `undefined` returns `null`
 * - Trims whitespace; empty-after-trim returns `null`
 * - Otherwise returns the trimmed string
 *
 * @param value - Raw field value from a parsed CSV row
 * @returns Trimmed string, or `null` for empty/missing values
 */
export function normalizeFieldValue(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Map a raw CSV row to canonical fields using a column mapping.
 *
 * Given a parsed CSV row (keyed by normalized headers), the ordered list of
 * normalized headers, and a mapping from canonical field names to original
 * CSV header names, produces a record containing only the mapped canonical
 * fields with normalized values.
 *
 * @param rawRow - Parsed CSV row as a record keyed by normalized header names
 * @param normalizedHeaders - Ordered array of normalized header names (from {@link normalizeHeaders})
 * @param columnMapping - Maps `{ canonicalField: originalCsvHeader }` (e.g., `{ email: 'Email' }`)
 * @returns Record of canonical field names to normalized values (unmapped fields excluded)
 */
export function applyColumnMapping(
  rawRow: Record<string, string | null>,
  normalizedHeaders: string[],
  columnMapping: Record<string, string>,
): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  for (const [canonicalField, originalHeader] of Object.entries(
    columnMapping,
  )) {
    const headerIndex = normalizedHeaders.indexOf(originalHeader);
    if (headerIndex === -1) {
      continue;
    }

    const normalizedHeader = normalizedHeaders[headerIndex];
    const rawValue = rawRow[normalizedHeader] ?? null;
    result[canonicalField] = normalizeFieldValue(rawValue);
  }

  return result;
}
