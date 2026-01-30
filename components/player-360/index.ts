/**
 * Player 360 Dashboard Components
 *
 * Public exports for the Player 360 dashboard.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see player-360-crm-dashboard-ux-ui-baselines.md
 */

// Layout Components (WS-UX-D)
export {
  MetricsGrid,
  Panel,
  PanelContent,
  PanelHeader,
  Player360Body,
  Player360Center,
  Player360Header,
  Player360Layout,
  Player360LayoutProvider,
  Player360LeftRail,
  Player360RightRail,
  ResponsiveVisible,
  usePlayer360Layout,
} from './layout';

// Skeleton Components (WS-UX-D)
export {
  CollaborationRailSkeleton,
  DashboardSkeleton,
  FilterBarSkeleton,
  HeaderSkeleton,
  InlineLoading,
  LoadingSpinner,
  MetricsRailSkeleton,
  MetricTileSkeleton,
  NoteSkeleton,
  TimelineCardSkeleton,
  TimelineListSkeleton,
} from './skeletons';

// Empty & Error States (WS-UX-D)
export {
  CompactEmpty,
  EmptyState,
  ErrorState,
  MetricsEmpty,
  NoPermission,
  NotesEmpty,
  Player360EmptyState,
  TagsEmpty,
  TimelineEmpty,
  TimelineError,
  useRecentPlayers,
} from './empty-states';

// Sidebar Components - DEPRECATED
// Sidebar has been removed in favor of embedded search in header/empty state.
// These exports are retained for backwards compatibility but should not be used.
export {
  MobileDrawer,
  Player360Sidebar,
  SidebarToggle,
  useMobileDrawer,
  useSidebarContext,
  useSidebarState,
} from './sidebar';

// Header Components (PRD-022-PATCH-OPTION-B)
export {
  AddNoteButton,
  IssueRewardButton,
  Player360HeaderContent,
  PlayerEditButton,
} from './header';
export type { AddNoteButtonProps, IssueRewardButtonProps } from './header';

// Summary Band Components (PRD-023 WS3)
export { SummaryBand, SummaryTile, TimeLensControl } from './summary';
export type { SummaryTileProps } from './summary';

// Left Rail Components (PRD-023 WS4)
export { FilterTile, FilterTileStack, JumpToNav } from './left-rail';
export type { FilterTileProps, JumpToTarget } from './left-rail';

// Rewards Components (PRD-023 WS4)
export {
  RewardsEligibilityCard,
  RewardsHistoryItem,
  RewardsHistoryList,
} from './rewards';
export type {
  RewardsEligibilityCardProps,
  RewardsHistoryItemProps,
} from './rewards';

// Chart Components (PRD-023 WS5)
export { ActivityChart } from './charts';
export type { ActivityChartProps } from './charts';

// Recent Events Strip (PRD-023 WS6)
export { RecentEventsStrip } from './recent-events-strip';
export type { RecentEventsStripProps } from './recent-events-strip';

// Collaboration Components (WS-UX-E)
export {
  CollaborationPanel,
  getAllPredefinedTags,
  getTagCategory,
  NoteCardLoading,
  NoteComposer,
  PREDEFINED_TAGS,
  QuickNoteButton,
  QuickNotesRow,
  TagChip,
  TagChips,
} from './collaboration';
export type {
  NoteVisibility,
  PlayerNote,
  PlayerSnapshot,
  PlayerTag,
  TagCategory,
} from './collaboration';

// Compliance Components (WS-UX-F)
export {
  CompliancePanel,
  CtrProgressTile,
  MtlEntryRow,
  MtlSummary,
} from './compliance';
export type { CtrStatus, MtlEntry } from './compliance';

// Snapshot Components (WS-UX-F)
export {
  CompactSnapshot,
  copySnapshotToClipboard,
  SnapshotCard,
  snapshotToText,
} from './snapshot';
export type { EngagementBand, PlayerSnapshotData } from './snapshot';

// Breadcrumb Component (PRD-022)
export { Player360Breadcrumb } from './breadcrumb';

// Re-export timeline contracts
export * from './timeline';
