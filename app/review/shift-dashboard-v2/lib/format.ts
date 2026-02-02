/**
 * Shift Dashboard V2 - Formatting Utilities
 *
 * Centralized formatting functions for currency, numbers, and percentages.
 */

/**
 * Format cents to currency string with proper thousand separators.
 * @param cents - Amount in cents (1 dollar = 100)
 */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '$0';
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

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

/**
 * Format cents delta with sign indicator.
 * @param cents - Amount in cents (1 dollar = 100)
 */
export function formatCentsDelta(cents: number | null | undefined): string {
  if (cents == null) return '$0';
  const dollars = cents / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: 'always',
  }).format(dollars);
  return formatted;
}
