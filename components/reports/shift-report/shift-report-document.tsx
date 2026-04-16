/**
 * Shift Report Document
 *
 * Document container that renders 9 sections in FIXED ORDER.
 * Print-safe layout. Takes ShiftReportDTO as prop.
 * Handles null sections gracefully (shows "Data unavailable" message).
 *
 * @see EXEC-065 WS2
 */

import type { ShiftReportDTO } from '@/services/reporting/shift-report';

import {
  ReportHeader,
  ExecutiveSummary,
  FinancialSummary,
  RatingCoverage,
  ComplianceSummary,
  Anomalies,
  BaselineQuality,
  LoyaltyLiability,
  ReportFooter,
} from './sections';

interface ShiftReportDocumentProps {
  report: ShiftReportDTO;
}

function SectionUnavailable({ title }: { title: string }) {
  return (
    <section className="mb-8">
      <h3
        className="text-sm font-bold uppercase tracking-widest mb-4 border-b border-border pb-2"
        style={{ fontFamily: 'monospace' }}
      >
        {title}
      </h3>
      <div className="border-2 border-dashed border-muted-foreground/20 rounded p-4">
        <p className="text-sm text-muted-foreground italic">
          Data unavailable for this section. The source service may have been
          unreachable during report assembly.
        </p>
      </div>
    </section>
  );
}

export function ShiftReportDocument({ report }: ShiftReportDocumentProps) {
  return (
    <div
      id="shift-report-document"
      className="bg-background text-foreground max-w-4xl mx-auto p-8 print:p-4 print:max-w-none"
    >
      {/* Section 0: Report Header */}
      <ReportHeader
        executiveSummary={report.executiveSummary}
        footer={report.footer}
      />

      {/* Section 1: Executive Summary — always present */}
      <ExecutiveSummary data={report.executiveSummary} />

      {/* Section 2: Financial Summary */}
      {report.financialSummary ? (
        <FinancialSummary data={report.financialSummary} />
      ) : (
        <SectionUnavailable title="2. Financial Summary" />
      )}

      {/* Section 3: Rating Coverage */}
      {report.ratingCoverage ? (
        <RatingCoverage data={report.ratingCoverage} />
      ) : (
        <SectionUnavailable title="3. Rating Coverage" />
      )}

      {/* Section 4: Compliance Summary */}
      {report.complianceSummary ? (
        <ComplianceSummary data={report.complianceSummary} />
      ) : (
        <SectionUnavailable title="4. Compliance Summary (MTL/CTR)" />
      )}

      {/* Section 5: Anomalies */}
      {report.anomalies ? (
        <Anomalies data={report.anomalies} />
      ) : (
        <SectionUnavailable title="5. Anomalies & Alerts" />
      )}

      {/* Section 6: Baseline Quality */}
      {report.baselineQuality ? (
        <BaselineQuality data={report.baselineQuality} />
      ) : (
        <SectionUnavailable title="6. Baseline & Data Quality" />
      )}

      {/* Section 7: Loyalty Liability */}
      {report.loyaltyLiability ? (
        <LoyaltyLiability data={report.loyaltyLiability} />
      ) : (
        <SectionUnavailable title="7. Loyalty Liability" />
      )}

      {/* Section 8: Report Footer */}
      <ReportFooter data={report.footer} />

      {/* Assembly errors (non-print) */}
      {report.errors.length > 0 && (
        <div className="mt-6 print:hidden">
          <details className="border-2 border-yellow-500/30 bg-yellow-500/5 rounded p-3">
            <summary
              className="text-xs font-bold uppercase tracking-widest text-yellow-400 cursor-pointer"
              style={{ fontFamily: 'monospace' }}
            >
              Assembly Warnings ({report.errors.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {report.errors.map((err, i) => (
                <li key={i} className="text-xs text-muted-foreground font-mono">
                  <span className="text-yellow-400">[{err.source}]</span>{' '}
                  {err.message}
                  <span className="text-muted-foreground/50 ml-1">
                    (affects: {err.affectedSections.join(', ')})
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
