/**
 * Shift Report PDF Styles
 *
 * Shared style constants for @react-pdf/renderer.
 * PT-2 brutalist-industrial palette adapted for print.
 *
 * @see EXEC-065 WS3
 */

import { StyleSheet } from '@react-pdf/renderer';

// ── Color Palette ──────────────────────────────────────────────────────────

export const colors = {
  black: '#1a1a1a',
  darkGray: '#374151',
  mediumGray: '#6b7280',
  lightGray: '#e5e7eb',
  paleGray: '#f3f4f6',
  background: '#ffffff',
  accent: '#0891b2', // teal-600
  accentDark: '#065f72', // teal-800
  headerBg: '#1a1a1a',
  headerText: '#ffffff',
  dangerText: '#dc2626',
  warningText: '#d97706',
  successText: '#059669',
} as const;

// ── Font Sizes ─────────────────────────────────────────────────────────────

export const fontSizes = {
  title: 16,
  subtitle: 12,
  heading: 10,
  body: 9,
  small: 7.5,
  tiny: 6.5,
} as const;

// ── Spacing ────────────────────────────────────────────────────────────────

export const spacing = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
} as const;

// ── Page Dimensions ────────────────────────────────────────────────────────

export const pageDimensions = {
  marginTop: 60,
  marginBottom: 50,
  marginHorizontal: 40,
  headerHeight: 40,
  footerHeight: 30,
} as const;

// ── Styles ─────────────────────────────────────────────────────────────────

export const styles = StyleSheet.create({
  // Page
  page: {
    paddingTop: pageDimensions.marginTop,
    paddingBottom: pageDimensions.marginBottom,
    paddingHorizontal: pageDimensions.marginHorizontal,
    fontSize: fontSizes.body,
    fontFamily: 'Helvetica',
    color: colors.black,
    backgroundColor: colors.background,
  },

  // Section
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSizes.heading,
    fontFamily: 'Helvetica-Bold',
    color: colors.accent,
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightGray,
  },

  // Header bar (dark)
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.headerBg,
    color: colors.headerText,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: fontSizes.title,
    fontFamily: 'Helvetica-Bold',
    color: colors.headerText,
  },
  headerSubtitle: {
    fontSize: fontSizes.small,
    color: colors.lightGray,
  },
  confidentialMark: {
    fontSize: fontSizes.tiny,
    fontFamily: 'Helvetica-Bold',
    color: colors.dangerText,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

  // Summary metrics grid
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metricBox: {
    width: '23%',
    backgroundColor: colors.paleGray,
    padding: spacing.md,
    borderRadius: 2,
  },
  metricLabel: {
    fontSize: fontSizes.small,
    color: colors.mediumGray,
    marginBottom: spacing.xs,
  },
  metricValue: {
    fontSize: fontSizes.subtitle,
    fontFamily: 'Helvetica-Bold',
    color: colors.black,
  },

  // Table
  table: {
    marginTop: spacing.sm,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.headerBg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tableHeaderCell: {
    fontSize: fontSizes.small,
    fontFamily: 'Helvetica-Bold',
    color: colors.headerText,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.lightGray,
  },
  tableRowAlt: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.paleGray,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.lightGray,
  },
  tableTotalsRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.lightGray,
    borderTopWidth: 1,
    borderTopColor: colors.darkGray,
  },
  tableCell: {
    fontSize: fontSizes.small,
    color: colors.black,
  },
  tableCellRight: {
    fontSize: fontSizes.small,
    color: colors.black,
    textAlign: 'right',
  },
  tableCellBold: {
    fontSize: fontSizes.small,
    fontFamily: 'Helvetica-Bold',
    color: colors.black,
    textAlign: 'right',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 15,
    left: pageDimensions.marginHorizontal,
    right: pageDimensions.marginHorizontal,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: colors.lightGray,
    paddingTop: spacing.sm,
  },
  footerText: {
    fontSize: fontSizes.tiny,
    color: colors.mediumGray,
  },

  // Unavailable section placeholder
  unavailable: {
    padding: spacing.md,
    backgroundColor: colors.paleGray,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  unavailableText: {
    fontSize: fontSizes.small,
    color: colors.mediumGray,
    fontStyle: 'italic',
  },
});
