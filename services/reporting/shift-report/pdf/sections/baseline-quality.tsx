/**
 * PDF Section: Baseline Quality
 *
 * Snapshot coverage, telemetry distribution, and audit correlation.
 *
 * @see EXEC-065 WS3
 */

import { Text, View } from '@react-pdf/renderer';

import type { BaselineQualitySection } from '../../dtos';
import { formatPercent, formatNumber } from '../format';
import { fontSizes, styles } from '../styles';

interface BaselineQualityPdfProps {
  data: BaselineQualitySection;
}

export function BaselineQualityPdf({ data }: BaselineQualityPdfProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Baseline Quality</Text>

      {/* Coverage Metrics */}
      <View style={styles.metricsRow}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Snapshot Coverage</Text>
          <Text style={styles.metricValue}>
            {formatPercent(data.snapshotCoverageRatio * 100)}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Coverage Tier</Text>
          <Text style={styles.metricValue}>{data.coverageTier}</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Missing Baseline</Text>
          <Text style={styles.metricValue}>
            {formatNumber(data.tablesMissingBaselineCount)} /{' '}
            {formatNumber(data.tablesCount)}
          </Text>
        </View>
      </View>

      {/* Telemetry Distribution */}
      <View style={{ marginTop: 4 }}>
        <Text
          style={{
            fontSize: fontSizes.small,
            fontFamily: 'Helvetica-Bold',
            marginBottom: 2,
          }}
        >
          Telemetry Distribution
        </Text>
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Good Coverage</Text>
            <Text style={styles.metricValue}>
              {formatNumber(data.telemetryDistribution.goodCoverage)}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Low Coverage</Text>
            <Text style={styles.metricValue}>
              {formatNumber(data.telemetryDistribution.lowCoverage)}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>None</Text>
            <Text style={styles.metricValue}>
              {formatNumber(data.telemetryDistribution.none)}
            </Text>
          </View>
        </View>
      </View>

      {/* Audit Correlation */}
      {data.auditCorrelation && (
        <View style={{ marginTop: 4 }}>
          <Text
            style={{
              fontSize: fontSizes.small,
              fontFamily: 'Helvetica-Bold',
              marginBottom: 2,
            }}
          >
            Audit Correlation
          </Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Total Slips</Text>
              <Text style={styles.metricValue}>
                {formatNumber(data.auditCorrelation.totalSlips)}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Full Chain</Text>
              <Text style={styles.metricValue}>
                {formatNumber(data.auditCorrelation.fullChainCount)}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Full Chain Rate</Text>
              <Text style={styles.metricValue}>
                {formatPercent(data.auditCorrelation.fullChainRate * 100)}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
