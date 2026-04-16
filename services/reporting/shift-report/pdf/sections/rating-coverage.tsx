/**
 * PDF Section: Rating Coverage
 *
 * Rating coverage %, active visitors (rated/unrated/total),
 * and theo discrepancy summary.
 *
 * @see EXEC-065 WS3
 */

import { Text, View } from '@react-pdf/renderer';

import type { RatingCoverageSection } from '../../dtos';
import { formatPercent, formatNumber, formatCents } from '../format';
import { styles } from '../styles';

interface RatingCoveragePdfProps {
  data: RatingCoverageSection;
}

export function RatingCoveragePdf({ data }: RatingCoveragePdfProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Rating Coverage</Text>

      {/* Active Visitors */}
      {data.activeVisitors && (
        <View style={styles.metricsRow}>
          <MetricItem
            label="Rated Visitors"
            value={formatNumber(data.activeVisitors.ratedCount)}
          />
          <MetricItem
            label="Unrated Visitors"
            value={formatNumber(data.activeVisitors.unratedCount)}
          />
          <MetricItem
            label="Total Visitors"
            value={formatNumber(data.activeVisitors.totalCount)}
          />
          <MetricItem
            label="Rated %"
            value={formatPercent(data.activeVisitors.ratedPercentage)}
          />
        </View>
      )}

      {/* Rating Coverage Metrics */}
      {data.ratingCoverage && (
        <View style={styles.metricsRow}>
          <MetricItem
            label="Total Sessions"
            value={formatNumber(data.ratingCoverage.totalSessions)}
          />
          <MetricItem
            label="Avg Coverage"
            value={formatPercent(data.ratingCoverage.avgCoverageRatio * 100)}
          />
        </View>
      )}

      {/* Theo Discrepancy */}
      {data.theoDiscrepancy && (
        <View style={{ marginTop: 4 }}>
          <Text style={[styles.metricLabel, { marginBottom: 2 }]}>
            Theo Discrepancy
          </Text>
          <View style={styles.metricsRow}>
            <MetricItem
              label="Discrepant Slips"
              value={formatNumber(data.theoDiscrepancy.discrepantSlips)}
            />
            <MetricItem
              label="Discrepancy Rate"
              value={formatPercent(data.theoDiscrepancy.discrepancyRate * 100)}
            />
            <MetricItem
              label="Total Discrepancy"
              value={formatCents(data.theoDiscrepancy.totalDiscrepancyCents)}
            />
            <MetricItem
              label="Avg Discrepancy %"
              value={formatPercent(data.theoDiscrepancy.avgDiscrepancyPercent)}
            />
          </View>
        </View>
      )}

      {!data.activeVisitors &&
        !data.ratingCoverage &&
        !data.theoDiscrepancy && (
          <View style={styles.unavailable}>
            <Text style={styles.unavailableText}>
              Rating coverage data unavailable for this shift.
            </Text>
          </View>
        )}
    </View>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}
