/**
 * PDF Section: Anomalies
 *
 * Alert counts (total, by severity), acknowledgment rates,
 * and quality metrics.
 *
 * @see EXEC-065 WS3
 */

import { Text, View } from '@react-pdf/renderer';

import type { AnomaliesSection } from '../../dtos';
import { formatNumber, formatPercent } from '../format';
import { colors, fontSizes, styles } from '../styles';

interface AnomaliesPdfProps {
  data: AnomaliesSection;
}

export function AnomaliesPdf({ data }: AnomaliesPdfProps) {
  const totalAlerts = data.alerts.length;
  const anomalyAlerts = data.alerts.filter((a) => a.isAnomaly);
  const criticalCount = anomalyAlerts.filter(
    (a) => a.severity === 'critical',
  ).length;
  const warnCount = anomalyAlerts.filter((a) => a.severity === 'warn').length;
  const infoCount = anomalyAlerts.filter((a) => a.severity === 'info').length;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Anomalies</Text>

      {/* Alert Counts */}
      <View style={styles.metricsRow}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Total Alerts</Text>
          <Text style={styles.metricValue}>{formatNumber(totalAlerts)}</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Anomalies</Text>
          <Text style={styles.metricValue}>
            {formatNumber(anomalyAlerts.length)}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Critical</Text>
          <Text
            style={[
              styles.metricValue,
              criticalCount > 0 ? { color: colors.dangerText } : {},
            ]}
          >
            {formatNumber(criticalCount)}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Warn</Text>
          <Text
            style={[
              styles.metricValue,
              warnCount > 0 ? { color: colors.warningText } : {},
            ]}
          >
            {formatNumber(warnCount)}
          </Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Info</Text>
          <Text style={styles.metricValue}>{formatNumber(infoCount)}</Text>
        </View>
      </View>

      {/* Alert Quality */}
      {data.alertQuality && (
        <View style={{ marginTop: 4 }}>
          <Text
            style={{
              fontSize: fontSizes.small,
              fontFamily: 'Helvetica-Bold',
              marginBottom: 2,
            }}
          >
            Alert Quality
          </Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Acknowledged</Text>
              <Text style={styles.metricValue}>
                {formatNumber(data.alertQuality.acknowledgedCount)}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Ack Rate</Text>
              <Text style={styles.metricValue}>
                {data.alertQuality.totalAlerts > 0
                  ? formatPercent(
                      (data.alertQuality.acknowledgedCount /
                        data.alertQuality.totalAlerts) *
                        100,
                    )
                  : 'N/A'}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>False Positives</Text>
              <Text style={styles.metricValue}>
                {formatNumber(data.alertQuality.falsePositiveCount)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Baseline Coverage */}
      {data.baselineCoverage && (
        <View style={{ marginTop: 4 }}>
          <Text
            style={{
              fontSize: fontSizes.small,
              fontFamily: 'Helvetica-Bold',
              marginBottom: 2,
            }}
          >
            Baseline Coverage
          </Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>With Baseline</Text>
              <Text style={styles.metricValue}>
                {formatNumber(data.baselineCoverage.withBaseline)}
              </Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Without Baseline</Text>
              <Text style={styles.metricValue}>
                {formatNumber(data.baselineCoverage.withoutBaseline)}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
