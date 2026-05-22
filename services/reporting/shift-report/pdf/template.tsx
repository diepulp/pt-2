/**
 * Shift Report PDF Template
 *
 * Composes all 9 sections into a single @react-pdf/renderer Document.
 * Takes ShiftReportDTO as prop. Fixed section order.
 * Null sections render "Data unavailable" or are skipped.
 *
 * @see EXEC-065 WS3
 * @see FIB-H-SHIFT-REPORT E1 Shift Report Standard Template v1
 */

import { Document, Page, Text, View } from '@react-pdf/renderer';

import type { ShiftReportDTO } from '../dtos';

import { AnomaliesPdf } from './sections/anomalies';
import { BaselineQualityPdf } from './sections/baseline-quality';
import { ComplianceSummaryPdf } from './sections/compliance-summary';
import { ExecutiveSummaryPdf } from './sections/executive-summary';
import { FinancialSummaryPdf } from './sections/financial-summary';
import { ReportHeader } from './sections/header';
import { LoyaltyLiabilityPdf } from './sections/loyalty-liability';
import { RatingCoveragePdf } from './sections/rating-coverage';
import { ReportFooterPdf } from './sections/report-footer';
import { styles } from './styles';

interface ShiftReportPdfProps {
  report: ShiftReportDTO;
}

export function ShiftReportPdf({ report }: ShiftReportPdfProps) {
  return (
    <Document
      title={`Shift Report - ${report.executiveSummary.casinoName} - ${report.executiveSummary.gamingDay}`}
      author="PT-2 Reporting Layer"
      subject={`${capitalize(report.executiveSummary.shiftBoundary)} Shift Report`}
    >
      <Page size="LETTER" style={styles.page}>
        {/* Fixed footer on every page */}
        <ReportFooterPdf footer={report.footer} />

        {/* Section 1: Header */}
        <ReportHeader
          summary={report.executiveSummary}
          footer={report.footer}
        />

        {/* Section 2: Executive Summary */}
        <ExecutiveSummaryPdf
          data={report.executiveSummary}
          anomalies={report.anomalies}
        />

        {/* Section 3: Financial Summary */}
        {report.financialSummary ? (
          <FinancialSummaryPdf data={report.financialSummary} />
        ) : (
          <UnavailableSection title="Financial Summary" />
        )}

        {/* Section 4: Rating Coverage */}
        {report.ratingCoverage ? (
          <RatingCoveragePdf data={report.ratingCoverage} />
        ) : (
          <UnavailableSection title="Rating Coverage" />
        )}

        {/* Section 5: Compliance Summary */}
        {report.complianceSummary ? (
          <ComplianceSummaryPdf data={report.complianceSummary} />
        ) : (
          <UnavailableSection title="Compliance Summary" />
        )}

        {/* Section 6: Anomalies */}
        {report.anomalies ? (
          <AnomaliesPdf data={report.anomalies} />
        ) : (
          <UnavailableSection title="Anomalies" />
        )}

        {/* Section 7: Baseline Quality */}
        {report.baselineQuality ? (
          <BaselineQualityPdf data={report.baselineQuality} />
        ) : (
          <UnavailableSection title="Baseline Quality" />
        )}

        {/* Section 8: Loyalty Liability */}
        {report.loyaltyLiability ? (
          <LoyaltyLiabilityPdf data={report.loyaltyLiability} />
        ) : (
          <UnavailableSection title="Loyalty Liability" />
        )}

        {/* Section 9: Errors (if any) */}
        {report.errors.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Collection Notes</Text>
            {report.errors.map((err, idx) => (
              <View key={idx} style={{ marginBottom: 2 }}>
                <Text style={styles.unavailableText}>
                  [{err.source}] {err.message} (affects:{' '}
                  {err.affectedSections.join(', ')})
                </Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function UnavailableSection({ title }: { title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.unavailable}>
        <Text style={styles.unavailableText}>
          Data unavailable for this shift.
        </Text>
      </View>
    </View>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
