/**
 * Player 360 Snapshot Card (WS-UX-F)
 *
 * Shareable player snapshot component for shift reports and other dashboards.
 * Per UX baseline §8: "Expose a shareable player snapshot component"
 *
 * @see player-360-crm-dashboard-ux-ui-baselines.md §8
 * @see EXEC-SPEC-029.md WS-UX-F
 */

'use client';

import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Clock,
  Copy,
  Share2,
  Tag,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// === Types ===

/**
 * Engagement band classification.
 */
export type EngagementBand = 'active' | 'cooling' | 'dormant';

/**
 * Player snapshot data for sharing.
 */
export interface PlayerSnapshotData {
  /** Player ID */
  playerId: string;
  /** Player full name */
  playerName: string;
  /** Current engagement band */
  engagementBand: EngagementBand;
  /** Last seen timestamp (ISO 8601) */
  lastSeen: string;
  /** Today's total cash-in */
  todayCashIn: number;
  /** Today's total cash-out */
  todayCashOut: number;
  /** Theoretical win (if available) */
  todayTheo?: number;
  /** Active tags requiring attention */
  tags: string[];
  /** Optional note to include */
  note?: string;
  /** Player's loyalty tier (if available) */
  loyaltyTier?: string;
  /** Gaming day this snapshot is for */
  gamingDay: string;
}

// === Engagement Band Styles ===

interface EngagementBandStyle {
  bg: string;
  text: string;
  border: string;
  label: string;
}

const ENGAGEMENT_BAND_STYLES: Record<EngagementBand, EngagementBandStyle> = {
  active: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    border: 'border-green-500/30',
    label: 'Active',
  },
  cooling: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Cooling',
  },
  dormant: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'Dormant',
  },
};

// === Snapshot Card Component ===

interface SnapshotCardProps {
  /** Snapshot data */
  snapshot: PlayerSnapshotData;
  /** Callback when "Add to Shift Report" is clicked */
  onAddToShiftReport?: (snapshot: PlayerSnapshotData) => void;
  /** Callback when copy is clicked */
  onCopy?: (snapshot: PlayerSnapshotData) => void;
  /** Whether the card is in compact mode */
  compact?: boolean;
  /** Whether to show the share actions */
  showActions?: boolean;
  className?: string;
}

/**
 * Shareable player snapshot card.
 * Designed to be portable across dashboards per UX baseline §8.
 */
export function SnapshotCard({
  snapshot,
  onAddToShiftReport,
  onCopy,
  compact = false,
  showActions = true,
  className,
}: SnapshotCardProps) {
  const bandStyle = ENGAGEMENT_BAND_STYLES[snapshot.engagementBand];

  const formatLastSeen = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg',
        'border border-border/40 bg-card/50 backdrop-blur-sm',
        className,
      )}
    >
      {/* LED accent strip */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-background/50">
        <div className="flex items-center gap-2 min-w-0">
          {/* Avatar initials */}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold bg-gradient-to-br from-accent/40 to-accent/60 shrink-0">
            {snapshot.playerName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)}
          </div>

          {/* Name + ID */}
          <div className="min-w-0">
            <h4 className="text-sm font-semibold truncate">
              {snapshot.playerName}
            </h4>
            <p className="text-[10px] font-mono text-muted-foreground">
              {snapshot.playerId.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>

        {/* Engagement band */}
        <Badge
          variant="outline"
          className={cn(
            'h-5 text-[10px] shrink-0',
            bandStyle.bg,
            bandStyle.text,
            bandStyle.border,
          )}
        >
          <div className="w-1.5 h-1.5 rounded-full mr-1 bg-current" />
          {bandStyle.label}
        </Badge>
      </div>

      {/* Content */}
      <div className={cn('p-3', compact ? 'space-y-2' : 'space-y-3')}>
        {/* Last seen */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="text-xs">
            Last seen: {formatLastSeen(snapshot.lastSeen)}
          </span>
        </div>

        {/* Financial summary */}
        <div className="grid grid-cols-2 gap-2">
          {/* Cash In */}
          <div className="p-2 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
              <ArrowDown className="h-3 w-3 text-green-400" />
              <span className="text-[10px] uppercase tracking-wide">
                Today In
              </span>
            </div>
            <p className="text-sm font-semibold text-green-400">
              ${snapshot.todayCashIn.toLocaleString()}
            </p>
          </div>

          {/* Cash Out */}
          <div className="p-2 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
              <ArrowUp className="h-3 w-3 text-red-400" />
              <span className="text-[10px] uppercase tracking-wide">
                Today Out
              </span>
            </div>
            <p className="text-sm font-semibold text-red-400">
              ${snapshot.todayCashOut.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Theo (if available) */}
        {snapshot.todayTheo !== undefined && !compact && (
          <div className="p-2 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Today Theo
              </span>
              <span className="text-sm font-semibold">
                ${snapshot.todayTheo.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Tags */}
        {snapshot.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
            {snapshot.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="h-5 text-[10px] bg-muted/30"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Note (if provided) */}
        {snapshot.note && !compact && (
          <div className="p-2 rounded-lg bg-muted/10 border border-dashed border-border/40">
            <p className="text-xs text-muted-foreground italic">
              &quot;{snapshot.note}&quot;
            </p>
          </div>
        )}

        {/* Gaming day */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Gaming Day: {snapshot.gamingDay}</span>
        </div>
      </div>

      {/* Actions */}
      {showActions && (onAddToShiftReport || onCopy) && (
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/40 bg-background/50">
          {onCopy && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCopy(snapshot)}
              className="h-7 px-2 text-xs gap-1.5"
            >
              <Copy className="h-3 w-3" />
              Copy
            </Button>
          )}
          {onAddToShiftReport && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onAddToShiftReport(snapshot)}
              className="h-7 px-3 text-xs gap-1.5"
            >
              <Share2 className="h-3 w-3" />
              Add to Shift Report
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// === Compact Snapshot ===

interface CompactSnapshotProps {
  snapshot: PlayerSnapshotData;
  onClick?: () => void;
  className?: string;
}

/**
 * Compact inline snapshot for lists.
 */
export function CompactSnapshot({
  snapshot,
  onClick,
  className,
}: CompactSnapshotProps) {
  const bandStyle = ENGAGEMENT_BAND_STYLES[snapshot.engagementBand];

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'w-full flex items-center gap-3 p-2 rounded-lg text-left',
        'border border-border/30 bg-card/30',
        'transition-colors',
        onClick && 'hover:bg-card/50 hover:border-border/50 cursor-pointer',
        !onClick && 'cursor-default',
        className,
      )}
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold bg-gradient-to-br from-accent/40 to-accent/60 shrink-0">
        {snapshot.playerName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)}
      </div>

      {/* Name + engagement */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{snapshot.playerName}</p>
        <p className="text-[10px] text-muted-foreground">
          ${snapshot.todayCashIn.toLocaleString()} in / $
          {snapshot.todayCashOut.toLocaleString()} out
        </p>
      </div>

      {/* Engagement indicator */}
      <div
        className={cn(
          'w-2 h-2 rounded-full shrink-0',
          snapshot.engagementBand === 'active' && 'bg-green-400',
          snapshot.engagementBand === 'cooling' && 'bg-amber-400',
          snapshot.engagementBand === 'dormant' && 'bg-slate-400',
        )}
        title={bandStyle.label}
      />
    </button>
  );
}

// === Snapshot Serialization ===

/**
 * Serializes a snapshot to a shareable text format.
 */
export function snapshotToText(snapshot: PlayerSnapshotData): string {
  const lines: string[] = [
    `Player: ${snapshot.playerName}`,
    `Status: ${ENGAGEMENT_BAND_STYLES[snapshot.engagementBand].label}`,
    `Gaming Day: ${snapshot.gamingDay}`,
    '',
    `Cash In: $${snapshot.todayCashIn.toLocaleString()}`,
    `Cash Out: $${snapshot.todayCashOut.toLocaleString()}`,
  ];

  if (snapshot.todayTheo !== undefined) {
    lines.push(`Theo: $${snapshot.todayTheo.toLocaleString()}`);
  }

  if (snapshot.tags.length > 0) {
    lines.push('', `Tags: ${snapshot.tags.join(', ')}`);
  }

  if (snapshot.note) {
    lines.push('', `Note: ${snapshot.note}`);
  }

  return lines.join('\n');
}

/**
 * Copies snapshot to clipboard as text.
 */
export async function copySnapshotToClipboard(
  snapshot: PlayerSnapshotData,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(snapshotToText(snapshot));
    return true;
  } catch {
    return false;
  }
}
