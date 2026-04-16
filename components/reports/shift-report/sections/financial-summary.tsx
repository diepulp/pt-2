/**
 * Financial Summary Section
 *
 * Per-table financial rows with casino totals.
 * This is the CSV-exportable section.
 *
 * @see EXEC-065 WS2
 */

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { FinancialSummarySection } from '@/services/reporting/shift-report';

import { formatCents, formatPercent, formatNumber } from '../format';

interface FinancialSummaryProps {
  data: FinancialSummarySection;
}

export function FinancialSummary({ data }: FinancialSummaryProps) {
  return (
    <section className="mb-8">
      <h3
        className="text-sm font-bold uppercase tracking-widest mb-4 border-b border-border pb-2"
        style={{ fontFamily: 'monospace' }}
      >
        2. Financial Summary
      </h3>

      <Table>
        <TableHeader>
          <TableRow className="border-b-2">
            <TableHead
              className="text-xs font-bold uppercase tracking-wider"
              style={{ fontFamily: 'monospace' }}
            >
              Table
            </TableHead>
            <TableHead
              className="text-xs font-bold uppercase tracking-wider text-right"
              style={{ fontFamily: 'monospace' }}
            >
              Game
            </TableHead>
            <TableHead
              className="text-xs font-bold uppercase tracking-wider text-right"
              style={{ fontFamily: 'monospace' }}
            >
              Drop
            </TableHead>
            <TableHead
              className="text-xs font-bold uppercase tracking-wider text-right"
              style={{ fontFamily: 'monospace' }}
            >
              Fills
            </TableHead>
            <TableHead
              className="text-xs font-bold uppercase tracking-wider text-right"
              style={{ fontFamily: 'monospace' }}
            >
              Credits
            </TableHead>
            <TableHead
              className="text-xs font-bold uppercase tracking-wider text-right"
              style={{ fontFamily: 'monospace' }}
            >
              Win/Loss
            </TableHead>
            <TableHead
              className="text-xs font-bold uppercase tracking-wider text-right"
              style={{ fontFamily: 'monospace' }}
            >
              Hold %
            </TableHead>
            <TableHead
              className="text-xs font-bold uppercase tracking-wider text-right"
              style={{ fontFamily: 'monospace' }}
            >
              Cash Obs
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.tables.map((row) => (
            <TableRow key={row.tableId}>
              <TableCell className="font-mono text-xs">
                {row.tableLabel}
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                {row.gameType ?? '--'}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {formatCents(row.dropTotalCents)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {formatCents(row.fillsTotalCents)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {formatCents(row.creditsTotalCents)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {formatCents(row.winLossInventoryCents)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {formatPercent(row.holdPercent)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {row.cashObsCount > 0
                  ? `${formatCents(row.cashObsEstimateCents)} (${formatNumber(row.cashObsCount)})`
                  : '--'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="border-t-2 font-semibold">
            <TableCell
              className="font-mono text-xs font-bold uppercase"
              colSpan={2}
            >
              Casino Totals
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums font-bold">
              {formatCents(data.casinoTotals.dropTotalCents)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums font-bold">
              {formatCents(data.casinoTotals.fillsTotalCents)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums font-bold">
              {formatCents(data.casinoTotals.creditsTotalCents)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums font-bold">
              {formatCents(data.casinoTotals.winLossInventoryTotalCents)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums font-bold">
              {formatPercent(data.casinoTotals.holdPercent)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums font-bold">
              {data.casinoTotals.cashObsTotalCount > 0
                ? `${formatCents(data.casinoTotals.cashObsEstimateTotalCents)} (${formatNumber(data.casinoTotals.cashObsTotalCount)})`
                : '--'}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}
