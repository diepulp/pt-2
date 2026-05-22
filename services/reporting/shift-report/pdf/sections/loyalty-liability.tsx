/**
 * PDF Section: Loyalty Liability
 *
 * Outstanding points, enrolled players, dollar liability, valuation rate.
 *
 * @see EXEC-065 WS3
 */

import { Text, View } from '@react-pdf/renderer';

import type { LoyaltyLiabilitySection } from '../../dtos';
import { formatCents, formatNumber, formatCentsOrNA } from '../format';
import { styles } from '../styles';

interface LoyaltyLiabilityPdfProps {
  data: LoyaltyLiabilitySection;
}

export function LoyaltyLiabilityPdf({ data }: LoyaltyLiabilityPdfProps) {
  const liability = data.loyaltyLiability;

  if (!liability) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Loyalty Liability</Text>
        <View style={styles.unavailable}>
          <Text style={styles.unavailableText}>
            Loyalty liability data unavailable.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Loyalty Liability</Text>
      <View style={styles.metricsRow}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Outstanding Points</Text>
          <Text style={styles.metricValue}>
            {formatNumber(liability.totalOutstandingPoints)}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Enrolled Players</Text>
          <Text style={styles.metricValue}>
            {formatNumber(liability.playerCount)}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Dollar Liability</Text>
          <Text style={styles.metricValue}>
            {formatCents(liability.estimatedMonetaryValueCents)}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Valuation Rate</Text>
          <Text style={styles.metricValue}>
            {liability.centsPerPoint != null
              ? formatCentsOrNA(liability.centsPerPoint) + '/pt'
              : 'N/A'}
          </Text>
        </View>
      </View>
    </View>
  );
}
