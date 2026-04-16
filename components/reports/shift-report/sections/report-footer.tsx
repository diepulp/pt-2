/**
 * Report Footer Section
 *
 * Generated timestamp, reference ID, gaming day, shift,
 * casino name, disclaimer text.
 *
 * @see EXEC-065 WS2
 */

import type { ReportFooterSection } from '@/services/reporting/shift-report';

import { formatDate, formatShiftBoundary, formatTimestamp } from '../format';

interface ReportFooterProps {
  data: ReportFooterSection;
}

export function ReportFooter({ data }: ReportFooterProps) {
  return (
    <footer className="border-t-2 border-foreground pt-6 mt-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs text-muted-foreground mb-4">
        <div>
          <span
            className="font-bold uppercase tracking-wider block mb-0.5"
            style={{ fontFamily: 'monospace' }}
          >
            Casino
          </span>
          <span className="font-mono">{data.casinoName}</span>
        </div>
        <div>
          <span
            className="font-bold uppercase tracking-wider block mb-0.5"
            style={{ fontFamily: 'monospace' }}
          >
            Gaming Day
          </span>
          <span className="font-mono tabular-nums">
            {formatDate(data.gamingDay)}
          </span>
        </div>
        <div>
          <span
            className="font-bold uppercase tracking-wider block mb-0.5"
            style={{ fontFamily: 'monospace' }}
          >
            Shift
          </span>
          <span className="font-mono">
            {formatShiftBoundary(data.shiftBoundary)}
          </span>
        </div>
        <div>
          <span
            className="font-bold uppercase tracking-wider block mb-0.5"
            style={{ fontFamily: 'monospace' }}
          >
            Window
          </span>
          <span className="font-mono tabular-nums">
            {formatTimestamp(data.windowStart)} &mdash;{' '}
            {formatTimestamp(data.windowEnd)}
          </span>
        </div>
        <div>
          <span
            className="font-bold uppercase tracking-wider block mb-0.5"
            style={{ fontFamily: 'monospace' }}
          >
            Reference
          </span>
          <span className="font-mono tabular-nums">{data.referenceId}</span>
        </div>
        <div>
          <span
            className="font-bold uppercase tracking-wider block mb-0.5"
            style={{ fontFamily: 'monospace' }}
          >
            Generated
          </span>
          <span className="font-mono tabular-nums">
            {formatTimestamp(data.generatedAt)}
          </span>
        </div>
      </div>

      <div className="border-t border-border pt-3 mt-3">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          This report is generated from automated telemetry and is intended for
          internal operational review only. Financial figures are estimates
          derived from inventory snapshots, fill/credit transactions, and
          statistical models. Figures may differ from audited financial
          statements. Do not distribute outside authorized personnel.
        </p>
      </div>
    </footer>
  );
}
