/**
 * Shared formatting utilities for currency, numbers, and percentages.
 *
 * ADR-031: Financial amounts use explicit function names to prevent
 * cents/dollars confusion. Use formatDollars() for dollar values and
 * formatCents() for cent values.
 */

// ---------------------------------------------------------------------------
// ADR-031 Formatting Functions
// ---------------------------------------------------------------------------

/**
 * Format a dollar amount for display.
 * Input MUST be in dollars (already converted from cents at service boundary).
 *
 * @example formatDollars(100)   // "$100"
 * @example formatDollars(1500)  // "$1,500"
 * @example formatDollars(null)  // "$0"
 *
 * @see ADR-031 Rule 3
 */
export function formatDollars(dollars: number | null | undefined): string {
  if (dollars == null) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

/**
 * Format a cent amount for display.
 * Converts cents to dollars internally. Use when consuming raw
 * cents that bypassed the service layer (e.g., DTO fields with
 * explicit `_cents` suffix).
 *
 * @example formatCents(10000)  // "$100"
 * @example formatCents(150000) // "$1,500"
 * @example formatCents(null)   // "$0"
 *
 * @see ADR-031 Rule 3
 */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '$0';
  return formatDollars(cents / 100);
}

/**
 * Format a dollar delta with sign indicator.
 * Input MUST be in dollars.
 *
 * @example formatDollarsDelta(100)  // "+$100"
 * @example formatDollarsDelta(-50)  // "-$50"
 *
 * @see ADR-031 Rule 3
 */
export function formatDollarsDelta(dollars: number | null | undefined): string {
  if (dollars == null) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: 'always',
  }).format(dollars);
}

/**
 * Format a cent delta with sign indicator.
 * Converts cents to dollars internally.
 *
 * @example formatCentsDelta(10000)  // "+$100"
 * @example formatCentsDelta(-5000)  // "-$50"
 *
 * @see ADR-031 Rule 3
 */
export function formatCentsDelta(cents: number | null | undefined): string {
  if (cents == null) return '$0';
  return formatDollarsDelta(cents / 100);
}

// ---------------------------------------------------------------------------
// Deprecated Functions (ADR-031)
// ---------------------------------------------------------------------------

/**
 * Format cents to currency string with proper thousand separators.
 *
 * @deprecated Use {@link formatCents} for cent values or {@link formatDollars}
 * for dollar values. The function name `formatCurrency` does not indicate the
 * expected input unit, leading to display bugs. See ADR-031.
 */
export function formatCurrency(cents: number | null | undefined): string {
  return formatCents(cents);
}

/**
 * Format cents delta with sign indicator.
 *
 * @deprecated Use {@link formatCentsDelta} or {@link formatDollarsDelta}.
 * See ADR-031.
 */
export function formatCurrencyDelta(cents: number | null | undefined): string {
  return formatCentsDelta(cents);
}

// ---------------------------------------------------------------------------
// General Formatting
// ---------------------------------------------------------------------------

/**
 * Format a number with thousand separators.
 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '0';
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Format a percentage value.
 */
export function formatPercentage(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value == null) return '0%';
  return `${value.toFixed(decimals)}%`;
}
