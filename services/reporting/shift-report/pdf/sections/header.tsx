/**
 * PDF Section: Report Header
 *
 * Dark header bar with casino name, gaming day, shift, timestamps,
 * reference ID, and CONFIDENTIAL mark.
 *
 * @see EXEC-065 WS3
 */

import { Text, View } from '@react-pdf/renderer';

import type { ExecutiveSummarySection, ReportFooterSection } from '../../dtos';
import { colors, fontSizes, spacing, styles } from '../styles';

interface ReportHeaderProps {
  summary: ExecutiveSummarySection;
  footer: ReportFooterSection;
}

export function ReportHeader({ summary, footer }: ReportHeaderProps) {
  const shiftLabel =
    summary.shiftBoundary.charAt(0).toUpperCase() +
    summary.shiftBoundary.slice(1);

  return (
    <View style={styles.headerBar}>
      <View>
        <Text style={styles.headerTitle}>{summary.casinoName}</Text>
        <Text style={styles.headerSubtitle}>
          Shift Report — {shiftLabel} Shift — Gaming Day {summary.gamingDay}
        </Text>
        <Text
          style={{
            fontSize: fontSizes.tiny,
            color: colors.lightGray,
            marginTop: spacing.xs,
          }}
        >
          Window: {formatTimestamp(summary.windowStart)} —{' '}
          {formatTimestamp(summary.windowEnd)}
        </Text>
        <Text style={{ fontSize: fontSizes.tiny, color: colors.lightGray }}>
          Ref: {footer.referenceId} | Generated:{' '}
          {formatTimestamp(footer.generatedAt)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.confidentialMark}>CONFIDENTIAL</Text>
      </View>
    </View>
  );
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}
