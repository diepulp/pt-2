/**
 * CSV Cell Value Sanitization
 *
 * Prevents CSV formula injection (DDE attacks) by prefixing dangerous
 * characters with a tab character (0x09) per OWASP guidelines.
 *
 * @see https://owasp.org/www-community/attacks/CSV_Injection
 * @see PRD-037 CSV Player Import — SEC Note T4
 */

/** Characters that trigger formula evaluation in spreadsheet apps */
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Sanitize a cell value for safe CSV export.
 *
 * If the value starts with a formula trigger character, prefix with tab (0x09).
 * This prevents Excel/Sheets/Calc from interpreting the cell as a formula.
 *
 * @param value - The cell value to sanitize
 * @returns Sanitized string safe for CSV export
 */
export function sanitizeCellValue(value: string): string {
  if (!value || value.length === 0) {
    return value;
  }

  const firstChar = value.charAt(0);
  if (FORMULA_TRIGGERS.has(firstChar)) {
    return `\t${value}`;
  }

  return value;
}

/**
 * Sanitize all string values in a record for CSV export.
 *
 * @param record - Key-value record to sanitize
 * @returns New record with all string values sanitized
 */
export function sanitizeRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    sanitized[key] =
      typeof value === 'string' ? sanitizeCellValue(value) : value;
  }

  return sanitized;
}
