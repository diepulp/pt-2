/**
 * PDF Formatting Utilities
 *
 * Cents-to-dollars, percentages, and number formatting for PDF output.
 * All financial values in the DTO are in cents.
 *
 * @see EXEC-065 WS3
 */

/**
 * Format cents as a dollar string with $ prefix.
 * Negative values are shown as ($X,XXX.XX).
 */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  const formatted = Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (dollars < 0) return `($${formatted})`;
  return `$${formatted}`;
}

/**
 * Format a percentage value (already computed, not a ratio).
 * e.g. 85.3 -> "85.3%"
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format an integer with comma separators.
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Format a nullable cents value, returning a fallback for null.
 */
export function formatCentsOrNA(
  cents: number | null,
  fallback = 'N/A',
): string {
  if (cents == null) return fallback;
  return formatCents(cents);
}

/**
 * Format a nullable percentage, returning a fallback for null.
 */
export function formatPercentOrNA(
  value: number | null,
  fallback = 'N/A',
): string {
  if (value == null) return fallback;
  return formatPercent(value);
}
