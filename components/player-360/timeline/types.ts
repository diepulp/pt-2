/**
 * Player 360 Timeline Card Contract (WS-UX-A)
 *
 * Type definitions for timeline card rendering in collapsed and expanded states.
 * Defines source category mapping and icon constants for event visualization.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see EXEC-SPEC-029.md WS-UX-A
 * @see player-360-crm-dashboard-ux-ui-baselines.md
 */

import type {
  InteractionEventDTO,
  InteractionEventMetadata,
  InteractionEventType,
} from '@/services/player-timeline/dtos';

// === Source Categories ===

/**
 * Visual grouping categories for timeline events.
 * Maps to chip colors and section headers in the UI.
 */
export type SourceCategory =
  | 'session' // visit_start, visit_end, visit_resume
  | 'gaming' // rating_start, rating_pause, rating_resume, rating_close
  | 'financial' // cash_in, cash_out, cash_observation, financial_adjustment
  | 'loyalty' // points_earned, points_redeemed, points_adjusted, promo_*
  | 'staff' // note_added, tag_applied, tag_removed
  | 'compliance' // mtl_recorded
  | 'identity'; // player_enrolled, identity_verified

/**
 * Maps event types to their source category for UI grouping.
 */
const SOURCE_CATEGORY_MAP: Record<InteractionEventType, SourceCategory> = {
  // Session & Presence
  visit_start: 'session',
  visit_end: 'session',
  visit_resume: 'session',
  // Gaming Activity
  rating_start: 'gaming',
  rating_pause: 'gaming',
  rating_resume: 'gaming',
  rating_close: 'gaming',
  // Financial
  cash_in: 'financial',
  cash_out: 'financial',
  cash_observation: 'financial',
  financial_adjustment: 'financial',
  // Loyalty & Rewards
  points_earned: 'loyalty',
  points_redeemed: 'loyalty',
  points_adjusted: 'loyalty',
  promo_issued: 'loyalty',
  promo_redeemed: 'loyalty',
  // Staff Interactions
  note_added: 'staff',
  tag_applied: 'staff',
  tag_removed: 'staff',
  // Compliance
  mtl_recorded: 'compliance',
  // Identity
  player_enrolled: 'identity',
  identity_verified: 'identity',
};

/**
 * Returns the source category for an event type.
 */
export function getSourceCategory(
  eventType: InteractionEventType,
): SourceCategory {
  return SOURCE_CATEGORY_MAP[eventType] ?? 'session';
}

// === Event Icons ===

/**
 * Icon identifiers for timeline event types.
 * Uses Lucide icon names compatible with shadcn/ui.
 */
export type EventIcon =
  | 'log-in'
  | 'log-out'
  | 'refresh-cw'
  | 'play'
  | 'pause'
  | 'square'
  | 'arrow-down-circle'
  | 'arrow-up-circle'
  | 'eye'
  | 'edit'
  | 'plus-circle'
  | 'gift'
  | 'settings'
  | 'ticket'
  | 'file-text'
  | 'tag'
  | 'tag-x'
  | 'shield'
  | 'user-plus'
  | 'badge-check';

/**
 * Maps event types to their display icons.
 * Uses Lucide icon names for consistency with shadcn/ui.
 */
export const EVENT_ICON_MAP: Record<InteractionEventType, EventIcon> = {
  // Session & Presence
  visit_start: 'log-in',
  visit_end: 'log-out',
  visit_resume: 'refresh-cw',
  // Gaming Activity
  rating_start: 'play',
  rating_pause: 'pause',
  rating_resume: 'refresh-cw',
  rating_close: 'square',
  // Financial
  cash_in: 'arrow-down-circle',
  cash_out: 'arrow-up-circle',
  cash_observation: 'eye',
  financial_adjustment: 'edit',
  // Loyalty & Rewards
  points_earned: 'plus-circle',
  points_redeemed: 'gift',
  points_adjusted: 'settings',
  promo_issued: 'ticket',
  promo_redeemed: 'gift',
  // Staff Interactions
  note_added: 'file-text',
  tag_applied: 'tag',
  tag_removed: 'tag-x',
  // Compliance
  mtl_recorded: 'shield',
  // Identity
  player_enrolled: 'user-plus',
  identity_verified: 'badge-check',
};

/**
 * Returns the icon name for an event type.
 */
export function getEventIcon(eventType: InteractionEventType): EventIcon {
  return EVENT_ICON_MAP[eventType];
}

// === Source Category Styling ===

/**
 * Color scheme for source category chips.
 * Uses Tailwind color classes for consistency.
 */
export interface SourceCategoryStyle {
  /** Background color class */
  bg: string;
  /** Text color class */
  text: string;
  /** Border color class */
  border: string;
  /** Display label */
  label: string;
}

/**
 * Styling configuration for each source category.
 */
export const SOURCE_CATEGORY_STYLES: Record<
  SourceCategory,
  SourceCategoryStyle
> = {
  session: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
    label: 'Session',
  },
  gaming: {
    bg: 'bg-purple-50 dark:bg-purple-950',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
    label: 'Gaming',
  },
  financial: {
    bg: 'bg-green-50 dark:bg-green-950',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-200 dark:border-green-800',
    label: 'Financial',
  },
  loyalty: {
    bg: 'bg-amber-50 dark:bg-amber-950',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    label: 'Loyalty',
  },
  staff: {
    bg: 'bg-slate-50 dark:bg-slate-950',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-800',
    label: 'Staff',
  },
  compliance: {
    bg: 'bg-red-50 dark:bg-red-950',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
    label: 'Compliance',
  },
  identity: {
    bg: 'bg-cyan-50 dark:bg-cyan-950',
    text: 'text-cyan-700 dark:text-cyan-300',
    border: 'border-cyan-200 dark:border-cyan-800',
    label: 'Identity',
  },
};

/**
 * Returns the style configuration for a source category.
 */
export function getSourceCategoryStyle(
  category: SourceCategory,
): SourceCategoryStyle {
  return SOURCE_CATEGORY_STYLES[category];
}

// === Timeline Card Interfaces ===

/**
 * Collapsed timeline card - minimal fields for list view.
 * Optimized for scan speed per UX baseline.
 */
export interface TimelineCardCollapsed {
  /** Synthetic event ID */
  eventId: string;
  /** Classified event type */
  eventType: InteractionEventType;
  /** When event occurred (ISO 8601) */
  occurredAt: string;
  /** Human-readable one-liner */
  summary: string;
  /** Visual grouping category */
  sourceCategory: SourceCategory;
  /** Icon for event type */
  icon: EventIcon;
  /** Monetary or points amount (show if present) */
  amount?: number | null;
}

/**
 * Expanded timeline card - full metadata for detail view.
 * Shown when user clicks/taps a collapsed card.
 */
export interface TimelineCardExpanded extends TimelineCardCollapsed {
  /** Staff who performed action (if applicable) */
  actorName?: string | null;
  /** Event-specific payload */
  metadata: InteractionEventMetadata;
  /** Source table for drilldown navigation */
  sourceTable: string;
  /** Actual row PK for drilldown link */
  sourceId: string;
  /** Actor staff ID (for linking) */
  actorId?: string | null;
}

// === Mapper Functions ===

/**
 * Maps an InteractionEventDTO to a collapsed card view.
 * Used in timeline list rendering.
 */
export function toCollapsedCard(
  event: InteractionEventDTO,
): TimelineCardCollapsed {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    summary: event.summary,
    sourceCategory: getSourceCategory(event.eventType),
    icon: getEventIcon(event.eventType),
    amount: event.amount,
  };
}

/**
 * Maps an InteractionEventDTO to an expanded card view.
 * Used when user expands a timeline card for details.
 */
export function toExpandedCard(
  event: InteractionEventDTO,
): TimelineCardExpanded {
  return {
    ...toCollapsedCard(event),
    actorName: event.actorName,
    metadata: event.metadata,
    sourceTable: event.sourceTable,
    sourceId: event.sourceId,
    actorId: event.actorId,
  };
}

// === Event Type Labels ===

/**
 * Human-readable labels for event types.
 * Used in filter chips and card headers.
 */
export const EVENT_TYPE_LABELS: Record<InteractionEventType, string> = {
  visit_start: 'Check-in',
  visit_end: 'Check-out',
  visit_resume: 'Visit Resumed',
  rating_start: 'Started Play',
  rating_pause: 'Paused Play',
  rating_resume: 'Resumed Play',
  rating_close: 'Ended Play',
  cash_in: 'Buy-in',
  cash_out: 'Cash-out',
  cash_observation: 'Cash Observation',
  financial_adjustment: 'Adjustment',
  points_earned: 'Points Earned',
  points_redeemed: 'Points Redeemed',
  points_adjusted: 'Points Adjusted',
  promo_issued: 'Promo Issued',
  promo_redeemed: 'Promo Redeemed',
  note_added: 'Note Added',
  tag_applied: 'Tag Applied',
  tag_removed: 'Tag Removed',
  mtl_recorded: 'MTL Entry',
  player_enrolled: 'Enrolled',
  identity_verified: 'ID Verified',
};

/**
 * Returns the human-readable label for an event type.
 */
export function getEventTypeLabel(eventType: InteractionEventType): string {
  return EVENT_TYPE_LABELS[eventType];
}

// === Event Type Groupings (for filter chips) ===

/**
 * Event types grouped by source category.
 * Used for rendering filter chip groups.
 */
export const EVENT_TYPES_BY_CATEGORY: Record<
  SourceCategory,
  InteractionEventType[]
> = {
  session: ['visit_start', 'visit_end', 'visit_resume'],
  gaming: ['rating_start', 'rating_pause', 'rating_resume', 'rating_close'],
  financial: [
    'cash_in',
    'cash_out',
    'cash_observation',
    'financial_adjustment',
  ],
  loyalty: [
    'points_earned',
    'points_redeemed',
    'points_adjusted',
    'promo_issued',
    'promo_redeemed',
  ],
  staff: ['note_added', 'tag_applied', 'tag_removed'],
  compliance: ['mtl_recorded'],
  identity: ['player_enrolled', 'identity_verified'],
};
