/**
 * CSV Export for Financial Summary
 *
 * Client-side CSV generation from FinancialSummarySection.
 * Converts cents to dollars and triggers browser download.
 *
 * @see EXEC-065 WS2
 */

import type { FinancialSummarySection } from '@/services/reporting/shift-report';

/**
 * Convert cents to dollar string (no currency symbol, for CSV).
 */
function centsToDollars(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

/**
 * Escape a CSV field value.
 * Wraps in quotes if it contains commas, quotes, or newlines.
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate CSV content from financial summary data.
 */
export function generateFinancialCSV(
  data: FinancialSummarySection,
  gamingDay: string,
  shiftBoundary: string,
): string {
  const headers = [
    'table_label',
    'game_type',
    'drop',
    'fills',
    'credits',
    'win_loss',
    'hold_pct',
    'cash_obs_estimate',
    'cash_obs_count',
  ];

  const rows = data.tables.map((row) => [
    escapeCSV(row.tableLabel),
    escapeCSV(row.gameType ?? ''),
    centsToDollars(row.dropTotalCents),
    centsToDollars(row.fillsTotalCents),
    centsToDollars(row.creditsTotalCents),
    centsToDollars(row.winLossInventoryCents),
    row.holdPercent != null ? row.holdPercent.toFixed(1) : '',
    centsToDollars(row.cashObsEstimateCents),
    String(row.cashObsCount),
  ]);

  // Add totals row
  const totals = data.casinoTotals;
  rows.push([
    'CASINO TOTALS',
    '',
    centsToDollars(totals.dropTotalCents),
    centsToDollars(totals.fillsTotalCents),
    centsToDollars(totals.creditsTotalCents),
    centsToDollars(totals.winLossInventoryTotalCents),
    totals.holdPercent != null ? totals.holdPercent.toFixed(1) : '',
    centsToDollars(totals.cashObsEstimateTotalCents),
    String(totals.cashObsTotalCount),
  ]);

  // Header comment
  const comment = `# Shift Report Financial Summary - ${gamingDay} - ${shiftBoundary}\n# All monetary values in USD\n`;

  return (
    comment +
    headers.join(',') +
    '\n' +
    rows.map((row) => row.join(',')).join('\n')
  );
}

/**
 * Trigger browser download of CSV content.
 */
export function downloadCSV(
  data: FinancialSummarySection,
  gamingDay: string,
  shiftBoundary: string,
): void {
  const csv = generateFinancialCSV(data, gamingDay, shiftBoundary);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `shift-report-financial-${gamingDay}-${shiftBoundary}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
