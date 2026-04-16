/**
 * PDF Section: Compliance Summary
 *
 * MTL/CTR totals and patron summary rows.
 *
 * @see EXEC-065 WS3
 */

import { Text, View } from '@react-pdf/renderer';

import type { ComplianceSummarySection } from '../../dtos';
import { formatCents, formatNumber } from '../format';
import { colors, fontSizes, styles } from '../styles';

interface ComplianceSummaryPdfProps {
  data: ComplianceSummarySection;
}

const COL = {
  name: '20%',
  totalIn: '14%',
  countIn: '8%',
  totalOut: '14%',
  countOut: '8%',
  volume: '14%',
  badgeIn: '11%',
  badgeOut: '11%',
} as const;

export function ComplianceSummaryPdf({ data }: ComplianceSummaryPdfProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Compliance Summary (MTL/CTR)</Text>

      {/* Totals row */}
      <View style={styles.metricsRow}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Patrons</Text>
          <Text style={styles.metricValue}>
            {formatNumber(data.totals.patronCount)}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Total In</Text>
          <Text style={styles.metricValue}>
            {formatCents(data.totals.totalInCents)}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Total Out</Text>
          <Text style={styles.metricValue}>
            {formatCents(data.totals.totalOutCents)}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Total Volume</Text>
          <Text style={styles.metricValue}>
            {formatCents(data.totals.totalVolumeCents)}
          </Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>CTR Near</Text>
          <Text
            style={[
              styles.metricValue,
              data.totals.ctrNearCount > 0 ? { color: colors.warningText } : {},
            ]}
          >
            {formatNumber(data.totals.ctrNearCount)}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>CTR Met</Text>
          <Text
            style={[
              styles.metricValue,
              data.totals.ctrMetCount > 0 ? { color: colors.dangerText } : {},
            ]}
          >
            {formatNumber(data.totals.ctrMetCount)}
          </Text>
        </View>
      </View>

      {/* Patron Table */}
      {data.patronSummaries.length > 0 && (
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, { width: COL.name }]}>
              Patron
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL.totalIn, textAlign: 'right' },
              ]}
            >
              Total In
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL.countIn, textAlign: 'right' },
              ]}
            >
              #In
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL.totalOut, textAlign: 'right' },
              ]}
            >
              Total Out
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL.countOut, textAlign: 'right' },
              ]}
            >
              #Out
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL.volume, textAlign: 'right' },
              ]}
            >
              Volume
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL.badgeIn, textAlign: 'center' },
              ]}
            >
              Badge In
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL.badgeOut, textAlign: 'center' },
              ]}
            >
              Badge Out
            </Text>
          </View>
          {data.patronSummaries.map((patron, idx) => {
            const name =
              [patron.patronFirstName, patron.patronLastName]
                .filter(Boolean)
                .join(' ') || patron.patronUuid.slice(0, 8);
            return (
              <View
                key={patron.patronUuid}
                style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
              >
                <Text style={[styles.tableCell, { width: COL.name }]}>
                  {name}
                </Text>
                <Text style={[styles.tableCellRight, { width: COL.totalIn }]}>
                  {formatCents(patron.totalInCents)}
                </Text>
                <Text style={[styles.tableCellRight, { width: COL.countIn }]}>
                  {formatNumber(patron.countIn)}
                </Text>
                <Text style={[styles.tableCellRight, { width: COL.totalOut }]}>
                  {formatCents(patron.totalOutCents)}
                </Text>
                <Text style={[styles.tableCellRight, { width: COL.countOut }]}>
                  {formatNumber(patron.countOut)}
                </Text>
                <Text style={[styles.tableCellRight, { width: COL.volume }]}>
                  {formatCents(patron.totalVolumeCents)}
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    {
                      width: COL.badgeIn,
                      textAlign: 'center',
                      fontSize: fontSizes.tiny,
                    },
                  ]}
                >
                  {formatBadge(patron.aggBadgeIn)}
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    {
                      width: COL.badgeOut,
                      textAlign: 'center',
                      fontSize: fontSizes.tiny,
                    },
                  ]}
                >
                  {formatBadge(patron.aggBadgeOut)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function formatBadge(badge: string): string {
  switch (badge) {
    case 'agg_ctr_met':
      return 'CTR MET';
    case 'agg_ctr_near':
      return 'CTR NEAR';
    case 'agg_watchlist':
      return 'WATCHLIST';
    case 'none':
      return '-';
    default:
      return badge;
  }
}
