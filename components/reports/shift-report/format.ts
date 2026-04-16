/**
 * Shift Report Formatting Helpers
 *
 * Shared formatters for currency, percentage, and date values.
 * All monetary values are stored in cents and displayed in dollars.
 *
 * @see EXEC-065 WS2
 */

/**
 * Format cents to USD currency string.
 * Returns '--' for null values.
 */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '--';
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

/**
 * Format a number as a percentage string.
 * Returns '--' for null values.
 */
export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '--';
  return `${value.toFixed(1)}%`;
}

/**
 * Format an ISO timestamp to a human-readable date/time.
 */
export function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/**
 * Format a date string (YYYY-MM-DD) to display format.
 */
export function formatDate(dateStr: string): string {
  try {
    // Parse as UTC to avoid timezone shift
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format shift boundary for display.
 */
export function formatShiftBoundary(
  boundary: 'swing' | 'day' | 'grave',
): string {
  const labels: Record<string, string> = {
    swing: 'Swing',
    day: 'Day',
    grave: 'Grave',
  };
  return labels[boundary] ?? boundary;
}

/**
 * Format a number with comma separators.
 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '--';
  return value.toLocaleString('en-US');
}
