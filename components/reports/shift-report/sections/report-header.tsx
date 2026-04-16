/**
 * Report Header Section
 *
 * Casino name, gaming day, shift boundary, generated timestamp,
 * reference ID, and INTERNAL/CONFIDENTIAL marking.
 *
 * @see EXEC-065 WS2
 */

import type {
  ExecutiveSummarySection,
  ReportFooterSection,
} from '@/services/reporting/shift-report';

import { formatDate, formatShiftBoundary, formatTimestamp } from '../format';

interface ReportHeaderProps {
  executiveSummary: ExecutiveSummarySection;
  footer: ReportFooterSection;
}

export function ReportHeader({ executiveSummary, footer }: ReportHeaderProps) {
  return (
    <header className="border-b-2 border-foreground pb-6 mb-8">
      {/* Confidential marking */}
      <div className="flex items-center justify-between mb-4">
        <span
          className="text-[10px] font-bold uppercase tracking-widest text-destructive border border-destructive/30 bg-destructive/5 px-2 py-0.5 rounded"
          style={{ fontFamily: 'monospace' }}
        >
          Internal / Confidential
        </span>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
          Ref: {footer.referenceId}
        </span>
      </div>

      {/* Casino name */}
      <h1
        className="text-2xl font-bold uppercase tracking-widest mb-2"
        style={{ fontFamily: 'monospace' }}
      >
        {executiveSummary.casinoName}
      </h1>

      {/* Report title */}
      <h2
        className="text-lg font-bold uppercase tracking-wider text-muted-foreground mb-4"
        style={{ fontFamily: 'monospace' }}
      >
        Shift Summary Report
      </h2>

      {/* Key metadata */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Gaming Day
          </div>
          <div className="font-mono tabular-nums">
            {formatDate(executiveSummary.gamingDay)}
          </div>
        </div>
        <div>
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Shift
          </div>
          <div className="font-mono">
            {formatShiftBoundary(executiveSummary.shiftBoundary)}
          </div>
        </div>
        <div>
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Window
          </div>
          <div className="font-mono tabular-nums text-xs">
            {formatTimestamp(executiveSummary.windowStart)} &mdash;{' '}
            {formatTimestamp(executiveSummary.windowEnd)}
          </div>
        </div>
        <div>
          <div
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
            style={{ fontFamily: 'monospace' }}
          >
            Generated
          </div>
          <div className="font-mono tabular-nums text-xs">
            {formatTimestamp(footer.generatedAt)}
          </div>
        </div>
      </div>
    </header>
  );
}
