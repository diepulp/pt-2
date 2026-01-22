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
} from "./layout";

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
} from "./skeletons";

// Empty & Error States (WS-UX-D)
export {
  CompactEmpty,
  EmptyState,
  ErrorState,
  MetricsEmpty,
  NoPermission,
  NotesEmpty,
  TagsEmpty,
  TimelineEmpty,
  TimelineError,
} from "./empty-states";

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
} from "./collaboration";
export type {
  NoteVisibility,
  PlayerNote,
  PlayerSnapshot,
  PlayerTag,
  TagCategory,
} from "./collaboration";

// Compliance Components (WS-UX-F)
export {
  CompliancePanel,
  CtrProgressTile,
  MtlEntryRow,
  MtlSummary,
} from "./compliance";
export type { CtrStatus, MtlEntry } from "./compliance";

// Snapshot Components (WS-UX-F)
export {
  CompactSnapshot,
  copySnapshotToClipboard,
  SnapshotCard,
  snapshotToText,
} from "./snapshot";
export type { EngagementBand, PlayerSnapshotData } from "./snapshot";

// Re-export timeline contracts
export * from "./timeline";
