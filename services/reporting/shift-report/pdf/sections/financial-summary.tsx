/**
 * PDF Section: Financial Summary
 *
 * Per-table financial table with columns: Table, Game Type, Drop,
 * Fills, Credits, Win/Loss, Hold%, Cash Obs Est, Cash Obs Count.
 * Casino totals row at bottom.
 *
 * @see EXEC-065 WS3
 */

import { Text, View } from '@react-pdf/renderer';

import type { FinancialSummarySection } from '../../dtos';
import {
  formatCents,
  formatCentsOrNA,
  formatPercentOrNA,
  formatNumber,
} from '../format';
import { styles } from '../styles';

interface FinancialSummaryPdfProps {
  data: FinancialSummarySection;
}

// Column widths as percentages
const COL = {
  table: '14%',
  gameType: '10%',
  drop: '12%',
  fills: '11%',
  credits: '11%',
  winLoss: '12%',
  hold: '8%',
  cashObs: '12%',
  cashCount: '10%',
} as const;

export function FinancialSummaryPdf({ data }: FinancialSummaryPdfProps) {
  return (
    <View style={styles.section} break>
      <Text style={styles.sectionTitle}>Financial Summary</Text>
      <View style={styles.table}>
        {/* Header Row */}
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { width: COL.table }]}>
            Table
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.gameType }]}>
            Game
          </Text>
          <Text
            style={[
              styles.tableHeaderCell,
              { width: COL.drop, textAlign: 'right' },
            ]}
          >
            Drop
          </Text>
          <Text
            style={[
              styles.tableHeaderCell,
              { width: COL.fills, textAlign: 'right' },
            ]}
          >
            Fills
          </Text>
          <Text
            style={[
              styles.tableHeaderCell,
              { width: COL.credits, textAlign: 'right' },
            ]}
          >
            Credits
          </Text>
          <Text
            style={[
              styles.tableHeaderCell,
              { width: COL.winLoss, textAlign: 'right' },
            ]}
          >
            Win/Loss
          </Text>
          <Text
            style={[
              styles.tableHeaderCell,
              { width: COL.hold, textAlign: 'right' },
            ]}
          >
            Hold%
          </Text>
          <Text
            style={[
              styles.tableHeaderCell,
              { width: COL.cashObs, textAlign: 'right' },
            ]}
          >
            Cash Obs
          </Text>
          <Text
            style={[
              styles.tableHeaderCell,
              { width: COL.cashCount, textAlign: 'right' },
            ]}
          >
            #Obs
          </Text>
        </View>

        {/* Data Rows */}
        {data.tables.map((row, idx) => (
          <View
            key={row.tableId}
            style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
          >
            <Text style={[styles.tableCell, { width: COL.table }]}>
              {row.tableLabel}
            </Text>
            <Text style={[styles.tableCell, { width: COL.gameType }]}>
              {row.gameType ?? '-'}
            </Text>
            <Text style={[styles.tableCellRight, { width: COL.drop }]}>
              {formatCents(row.dropTotalCents)}
            </Text>
            <Text style={[styles.tableCellRight, { width: COL.fills }]}>
              {formatCents(row.fillsTotalCents)}
            </Text>
            <Text style={[styles.tableCellRight, { width: COL.credits }]}>
              {formatCents(row.creditsTotalCents)}
            </Text>
            <Text style={[styles.tableCellRight, { width: COL.winLoss }]}>
              {formatCentsOrNA(row.winLossInventoryCents)}
            </Text>
            <Text style={[styles.tableCellRight, { width: COL.hold }]}>
              {formatPercentOrNA(row.holdPercent)}
            </Text>
            <Text style={[styles.tableCellRight, { width: COL.cashObs }]}>
              {formatCents(row.cashObsEstimateCents)}
            </Text>
            <Text style={[styles.tableCellRight, { width: COL.cashCount }]}>
              {formatNumber(row.cashObsCount)}
            </Text>
          </View>
        ))}

        {/* Totals Row */}
        <View style={styles.tableTotalsRow}>
          <Text
            style={[
              styles.tableCellBold,
              { width: COL.table, textAlign: 'left' },
            ]}
          >
            TOTALS
          </Text>
          <Text style={[styles.tableCellBold, { width: COL.gameType }]}></Text>
          <Text style={[styles.tableCellBold, { width: COL.drop }]}>
            {formatCents(data.casinoTotals.dropTotalCents)}
          </Text>
          <Text style={[styles.tableCellBold, { width: COL.fills }]}>
            {formatCents(data.casinoTotals.fillsTotalCents)}
          </Text>
          <Text style={[styles.tableCellBold, { width: COL.credits }]}>
            {formatCents(data.casinoTotals.creditsTotalCents)}
          </Text>
          <Text style={[styles.tableCellBold, { width: COL.winLoss }]}>
            {formatCentsOrNA(data.casinoTotals.winLossInventoryTotalCents)}
          </Text>
          <Text style={[styles.tableCellBold, { width: COL.hold }]}>
            {formatPercentOrNA(data.casinoTotals.holdPercent)}
          </Text>
          <Text style={[styles.tableCellBold, { width: COL.cashObs }]}>
            {formatCents(data.casinoTotals.cashObsEstimateTotalCents)}
          </Text>
          <Text style={[styles.tableCellBold, { width: COL.cashCount }]}>
            {formatNumber(data.casinoTotals.cashObsTotalCount)}
          </Text>
        </View>
      </View>
    </View>
  );
}
