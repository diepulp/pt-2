/**
 * Executive Summary Section
 *
 * Key KPIs in a summary strip: total drop, fills, credits,
 * win/loss, hold%, coverage%, alert counts.
 *
 * @see EXEC-065 WS2
 */

import type { ExecutiveSummarySection } from '@/services/reporting/shift-report';

import { formatCents, formatPercent, formatNumber } from '../format';

interface ExecutiveSummaryProps {
  data: ExecutiveSummarySection;
}

function KpiCell({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="border-2 border-border bg-card p-3">
      <div
        className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
        style={{ fontFamily: 'monospace' }}
      >
        {label}
      </div>
      <div className="text-lg font-semibold font-mono tabular-nums">
        {value}
      </div>
      {subtext && (
        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
          {subtext}
        </div>
      )}
    </div>
  );
}

export function ExecutiveSummary({ data }: ExecutiveSummaryProps) {
  // Compute total drop from executive summary context
  // Drop is fills + credits (estimated, since exec summary doesn't carry raw drop)
  const estimatedDrop = data.fillsTotalCents + data.creditsTotalCents;

  const holdPercent =
    data.winLossInventoryTotalCents != null && estimatedDrop > 0
      ? (data.winLossInventoryTotalCents / estimatedDrop) * 100
      : null;

  return (
    <section className="mb-8">
      <h3
        className="text-sm font-bold uppercase tracking-widest mb-4 border-b border-border pb-2"
        style={{ fontFamily: 'monospace' }}
      >
        1. Executive Summary
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCell
          label="Tables"
          value={formatNumber(data.tablesCount)}
          subtext={`${formatNumber(data.pitsCount)} pits`}
        />
        <KpiCell label="Fills" value={formatCents(data.fillsTotalCents)} />
        <KpiCell label="Credits" value={formatCents(data.creditsTotalCents)} />
        <KpiCell
          label="Win/Loss (Inv)"
          value={formatCents(data.winLossInventoryTotalCents)}
        />
        <KpiCell
          label="Win/Loss (Est)"
          value={formatCents(data.winLossEstimatedTotalCents)}
        />
        <KpiCell label="Hold %" value={formatPercent(holdPercent)} />
        <KpiCell
          label="Coverage"
          value={formatPercent(data.snapshotCoverageRatio * 100)}
          subtext={data.coverageTier}
        />
      </div>
    </section>
  );
}
