/**
 * Player 360 Compliance Panel (WS-UX-F)
 *
 * Compliance panel with CTR progress metric and MTL event list.
 * Per UX baseline §6: "CTR as computed status/aggregate metric, not timeline event"
 *
 * @see player-360-crm-dashboard-ux-ui-baselines.md §6
 * @see EXEC-SPEC-029.md WS-UX-F
 */

"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Clock,
  ExternalLink,
  Shield,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { Panel, PanelContent, PanelHeader } from "../layout";
import { MetricTileSkeleton } from "../skeletons";

// === Types ===

/**
 * Currency Transaction Report (CTR) threshold status.
 */
export interface CtrStatus {
  /** Total cash-in + cash-out for gaming day */
  todayTotal: number;
  /** CTR reporting threshold (typically $10,000) */
  threshold: number;
  /** Whether threshold has been reached */
  isTriggered: boolean;
  /** Whether CTR has been filed */
  isFiled: boolean;
  /** Gaming day for this status */
  gamingDay: string;
}

/**
 * Multiple Transaction Log entry for display.
 */
export interface MtlEntry {
  id: string;
  /** Direction: cash-in or cash-out */
  direction: "in" | "out";
  /** Transaction type */
  txnType: string;
  /** Amount in dollars */
  amount: number;
  /** When recorded */
  recordedAt: string;
  /** Source of transaction */
  source: string;
  /** Staff who recorded */
  recordedBy: {
    id: string;
    name: string;
  };
}

/**
 * Compliance panel props.
 */
interface CompliancePanelProps {
  /** CTR status for current gaming day */
  ctrStatus: CtrStatus | null;
  /** MTL entries for current gaming day */
  mtlEntries: MtlEntry[];
  /** Whether data is loading */
  isLoading?: boolean;
  /** Callback when MTL entry is clicked */
  onMtlClick?: (entry: MtlEntry) => void;
  /** Callback to view full compliance history */
  onViewHistory?: () => void;
  className?: string;
}

/**
 * Compliance panel with CTR progress and MTL list.
 */
export function CompliancePanel({
  ctrStatus,
  mtlEntries,
  isLoading = false,
  onMtlClick,
  onViewHistory,
  className,
}: CompliancePanelProps) {
  // Loading state
  if (isLoading) {
    return (
      <Panel className={cn("flex flex-col", className)}>
        <PanelHeader
          icon={<Shield className="h-4 w-4 text-accent" />}
          title="Compliance"
        />
        <PanelContent className="space-y-4">
          <MetricTileSkeleton />
          <MetricTileSkeleton />
          <MetricTileSkeleton />
        </PanelContent>
      </Panel>
    );
  }

  return (
    <Panel className={cn("flex flex-col", className)}>
      <PanelHeader
        icon={<Shield className="h-4 w-4 text-accent" />}
        title="Compliance"
        actions={
          onViewHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewHistory}
              className="h-7 px-2 text-xs gap-1"
            >
              History
              <ExternalLink className="h-3 w-3" />
            </Button>
          )
        }
      />

      <PanelContent className="space-y-4">
        {/* CTR Progress */}
        {ctrStatus && <CtrProgressTile status={ctrStatus} />}

        {/* MTL Summary */}
        <MtlSummary entries={mtlEntries} />

        {/* MTL List */}
        {mtlEntries.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Today&apos;s MTL Entries
            </h4>
            <div className="space-y-1.5">
              {mtlEntries.slice(0, 5).map((entry) => (
                <MtlEntryRow
                  key={entry.id}
                  entry={entry}
                  onClick={onMtlClick ? () => onMtlClick(entry) : undefined}
                />
              ))}
              {mtlEntries.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onViewHistory}
                  className="w-full h-7 text-xs text-muted-foreground"
                >
                  View all {mtlEntries.length} entries
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!ctrStatus && mtlEntries.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No compliance data for today</p>
          </div>
        )}
      </PanelContent>
    </Panel>
  );
}

// === CTR Progress Tile ===

interface CtrProgressTileProps {
  status: CtrStatus;
  className?: string;
}

/**
 * CTR threshold progress indicator.
 * Shows aggregate metric as progress bar, not timeline event.
 */
function CtrProgressTile({ status, className }: CtrProgressTileProps) {
  const percentage = Math.min(
    100,
    (status.todayTotal / status.threshold) * 100,
  );
  const isNearThreshold = percentage >= 80 && !status.isTriggered;

  return (
    <div
      className={cn(
        "p-3 rounded-lg border",
        status.isTriggered
          ? "border-red-500/30 bg-red-500/5"
          : isNearThreshold
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-border/40 bg-card/50",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            CTR Threshold
          </span>
          {status.isTriggered && (
            <Badge
              variant="outline"
              className={cn(
                "h-5 text-[10px]",
                status.isFiled
                  ? "bg-green-500/10 text-green-400 border-green-500/30"
                  : "bg-red-500/10 text-red-400 border-red-500/30",
              )}
            >
              {status.isFiled ? "Filed" : "Triggered"}
            </Badge>
          )}
          {isNearThreshold && (
            <Badge
              variant="outline"
              className="h-5 text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Near threshold
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {status.gamingDay}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-2">
        <div
          className={cn(
            "h-full transition-all",
            status.isTriggered
              ? "bg-red-500"
              : isNearThreshold
                ? "bg-amber-500"
                : "bg-accent",
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Values */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">
          ${status.todayTotal.toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">
          of ${status.threshold.toLocaleString()} threshold
        </span>
      </div>
    </div>
  );
}

// === MTL Summary ===

interface MtlSummaryProps {
  entries: MtlEntry[];
  className?: string;
}

/**
 * Summary of MTL entries for the day.
 */
function MtlSummary({ entries, className }: MtlSummaryProps) {
  if (entries.length === 0) return null;

  const cashIn = entries
    .filter((e) => e.direction === "in")
    .reduce((sum, e) => sum + e.amount, 0);

  const cashOut = entries
    .filter((e) => e.direction === "out")
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {/* Cash In Total */}
      <div className="p-2.5 rounded-lg border border-border/40 bg-card/50">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
          <ArrowDown className="h-3 w-3 text-green-400" />
          <span className="text-[10px] uppercase tracking-wide">Cash In</span>
        </div>
        <p className="text-sm font-semibold text-green-400">
          ${cashIn.toLocaleString()}
        </p>
      </div>

      {/* Cash Out Total */}
      <div className="p-2.5 rounded-lg border border-border/40 bg-card/50">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
          <ArrowUp className="h-3 w-3 text-red-400" />
          <span className="text-[10px] uppercase tracking-wide">Cash Out</span>
        </div>
        <p className="text-sm font-semibold text-red-400">
          ${cashOut.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// === MTL Entry Row ===

interface MtlEntryRowProps {
  entry: MtlEntry;
  onClick?: () => void;
  className?: string;
}

/**
 * Individual MTL entry row.
 */
function MtlEntryRow({ entry, onClick, className }: MtlEntryRowProps) {
  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "w-full flex items-center gap-3 p-2 rounded-lg text-left",
        "border border-border/30 bg-card/30",
        "transition-colors",
        onClick && "hover:bg-card/50 hover:border-border/50 cursor-pointer",
        !onClick && "cursor-default",
        className,
      )}
    >
      {/* Direction icon */}
      <div
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
          entry.direction === "in"
            ? "bg-green-500/10 text-green-400"
            : "bg-red-500/10 text-red-400",
        )}
      >
        {entry.direction === "in" ? (
          <ArrowDown className="h-4 w-4" />
        ) : (
          <ArrowUp className="h-4 w-4" />
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{entry.txnType}</span>
          <span className="text-xs text-muted-foreground">{entry.source}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatTime(entry.recordedAt)}</span>
          <span>•</span>
          <span>{entry.recordedBy.name}</span>
        </div>
      </div>

      {/* Amount */}
      <span
        className={cn(
          "text-sm font-semibold shrink-0",
          entry.direction === "in" ? "text-green-400" : "text-red-400",
        )}
      >
        {entry.direction === "in" ? "+" : "-"}${entry.amount.toLocaleString()}
      </span>

      {/* Chevron if clickable */}
      {onClick && (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </button>
  );
}

// === Exports ===

export { CtrProgressTile, MtlEntryRow, MtlSummary };
