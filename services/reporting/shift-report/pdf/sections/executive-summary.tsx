/**
 * PDF Section: Executive Summary
 *
 * Key metrics grid: total drop, fills, credits, win/loss, hold%,
 * coverage%, tables, pits, and alert count.
 *
 * @see EXEC-065 WS3
 */

import { Text, View } from '@react-pdf/renderer';

import type { ExecutiveSummarySection, AnomaliesSection } from '../../dtos';
import { formatCents, formatPercent, formatNumber } from '../format';
import { styles } from '../styles';

interface ExecutiveSummaryPdfProps {
  data: ExecutiveSummarySection;
  anomalies: AnomaliesSection | null;
}

export function ExecutiveSummaryPdf({
  data,
  anomalies,
}: ExecutiveSummaryPdfProps) {
  const alertCount = anomalies?.alerts.length ?? 0;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Executive Summary</Text>
      <View style={styles.metricsRow}>
        <MetricBox label="Tables" value={formatNumber(data.tablesCount)} />
        <MetricBox label="Pits" value={formatNumber(data.pitsCount)} />
        <MetricBox label="Fills" value={formatCents(data.fillsTotalCents)} />
        <MetricBox
          label="Credits"
          value={formatCents(data.creditsTotalCents)}
        />
      </View>
      <View style={styles.metricsRow}>
        <MetricBox
          label="Win/Loss (Inv)"
          value={
            data.winLossInventoryTotalCents != null
              ? formatCents(data.winLossInventoryTotalCents)
              : 'N/A'
          }
        />
        <MetricBox
          label="Win/Loss (Est)"
          value={
            data.winLossEstimatedTotalCents != null
              ? formatCents(data.winLossEstimatedTotalCents)
              : 'N/A'
          }
        />
        <MetricBox
          label="Coverage"
          value={formatPercent(data.snapshotCoverageRatio * 100)}
        />
        <MetricBox label="Alerts" value={formatNumber(alertCount)} />
      </View>
    </View>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}
