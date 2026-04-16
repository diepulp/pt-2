/**
 * Compliance Summary Section
 *
 * MTL/CTR summary: patron count, total volumes, trigger counts.
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
import type { ComplianceSummarySection } from '@/services/reporting/shift-report';

import { formatCents, formatNumber } from '../format';

interface ComplianceSummaryProps {
  data: ComplianceSummarySection;
}

function AggBadge({ badge }: { badge: string }) {
  if (badge === 'agg_ctr_met') {
    return (
      <span className="inline-block rounded bg-red-500/10 text-red-400 border border-red-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        CTR Met
      </span>
    );
  }
  if (badge === 'agg_ctr_near') {
    return (
      <span className="inline-block rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        CTR Near
      </span>
    );
  }
  if (badge === 'agg_watchlist') {
    return (
      <span className="inline-block rounded bg-orange-500/10 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        Watchlist
      </span>
    );
  }
  return (
    <span className="text-[10px] text-muted-foreground">
      {badge === 'agg_clear' ? 'Clear' : badge}
    </span>
  );
}

export function ComplianceSummary({ data }: ComplianceSummaryProps) {
  return (
    <section className="mb-8">
      <h3
        className="text-sm font-bold uppercase tracking-widest mb-4 border-b border-border pb-2"
        style={{ fontFamily: 'monospace' }}
      >
        4. Compliance Summary (MTL/CTR)
      </h3>

      {/* Totals bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="border-2 border-border bg-card p-3">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Patrons
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums">
            {formatNumber(data.totals.patronCount)}
          </div>
        </div>
        <div className="border-2 border-border bg-card p-3">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Total Volume
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums">
            {formatCents(data.totals.totalVolumeCents)}
          </div>
        </div>
        <div className="border-2 border-border bg-card p-3">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            CTR Near
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums text-yellow-400">
            {formatNumber(data.totals.ctrNearCount)}
          </div>
        </div>
        <div className="border-2 border-border bg-card p-3">
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            CTR Met
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums text-red-400">
            {formatNumber(data.totals.ctrMetCount)}
          </div>
        </div>
      </div>

      {/* Patron detail table */}
      {data.patronSummaries.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow className="border-b-2">
              <TableHead
                className="text-xs font-bold uppercase tracking-wider"
                style={{ fontFamily: 'monospace' }}
              >
                Patron
              </TableHead>
              <TableHead
                className="text-xs font-bold uppercase tracking-wider text-right"
                style={{ fontFamily: 'monospace' }}
              >
                Cash In
              </TableHead>
              <TableHead
                className="text-xs font-bold uppercase tracking-wider text-right"
                style={{ fontFamily: 'monospace' }}
              >
                Cash Out
              </TableHead>
              <TableHead
                className="text-xs font-bold uppercase tracking-wider text-right"
                style={{ fontFamily: 'monospace' }}
              >
                Volume
              </TableHead>
              <TableHead
                className="text-xs font-bold uppercase tracking-wider text-center"
                style={{ fontFamily: 'monospace' }}
              >
                In Badge
              </TableHead>
              <TableHead
                className="text-xs font-bold uppercase tracking-wider text-center"
                style={{ fontFamily: 'monospace' }}
              >
                Out Badge
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.patronSummaries.map((patron) => (
              <TableRow key={patron.patronUuid}>
                <TableCell className="font-mono text-xs">
                  {patron.patronFirstName ?? ''} {patron.patronLastName ?? ''}
                  {!patron.patronFirstName && !patron.patronLastName && (
                    <span className="text-muted-foreground italic">
                      Anonymous
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {formatCents(patron.totalInCents)}
                  <span className="text-muted-foreground ml-1">
                    ({patron.countIn})
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {formatCents(patron.totalOutCents)}
                  <span className="text-muted-foreground ml-1">
                    ({patron.countOut})
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {formatCents(patron.totalVolumeCents)}
                </TableCell>
                <TableCell className="text-center">
                  <AggBadge badge={patron.aggBadgeIn} />
                </TableCell>
                <TableCell className="text-center">
                  <AggBadge badge={patron.aggBadgeOut} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="border-t-2 font-semibold">
              <TableCell className="font-mono text-xs font-bold uppercase">
                Totals
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums font-bold">
                {formatCents(data.totals.totalInCents)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums font-bold">
                {formatCents(data.totals.totalOutCents)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums font-bold">
                {formatCents(data.totals.totalVolumeCents)}
              </TableCell>
              <TableCell />
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}

      {data.patronSummaries.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No patron-level MTL data for this gaming day.
        </p>
      )}
    </section>
  );
}
