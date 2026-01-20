/**
 * MTL (Monetary Transaction Log) Components
 *
 * UI components for AML/CTR compliance tracking.
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 */

// Badge components (Two-tier system)
export { EntryBadge, getEntryBadgeConfig } from './entry-badge';
export type { EntryBadgeProps, EntryBadgeType } from './entry-badge';

export { AggBadge, AggBadgePair, getAggBadgeConfig } from './agg-badge';
export type {
  AggBadgeProps,
  AggBadgePairProps,
  AggBadgeType,
} from './agg-badge';

// List and detail components
export { EntryList, EntryListSkeleton } from './entry-list';
export type { EntryListProps } from './entry-list';

export { EntryDetail, EntryDetailSkeleton } from './entry-detail';
export type { EntryDetailProps } from './entry-detail';

// Form components
export { AuditNoteForm, AuditNoteFormInline } from './audit-note-form';
export type { AuditNoteFormProps } from './audit-note-form';

// Summary and dashboard
export {
  GamingDaySummary,
  GamingDaySummarySkeleton,
} from './gaming-day-summary';
export type { GamingDaySummaryProps } from './gaming-day-summary';

export { ComplianceDashboard } from './compliance-dashboard';
export type { ComplianceDashboardProps } from './compliance-dashboard';
