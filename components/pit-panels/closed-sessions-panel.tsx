"use client";

import { Clock, Loader2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useClosedSlipsForGamingDay } from "@/hooks/rating-slip";
import { cn } from "@/lib/utils";
import type { ClosedSlipForGamingDayDTO } from "@/services/rating-slip/dtos";

interface ClosedSessionsPanelProps {
  casinoId: string;
  gamingDay: string | null;
  onStartFromPrevious: (slipId: string) => void;
}

/**
 * Closed Sessions Panel - "Start From Previous" functionality
 * Displays closed terminal rating slips for the current gaming day.
 * Allows operators to start a new visit from any closed session.
 *
 * ISSUE-SFP-001 Fix: Uses infinite query with keyset pagination.
 * Only displays terminal slips (excludes intermediate move slips).
 *
 * @see PRD-020 Closed Sessions Panel
 * @see EXEC-SPEC-START-FROM-PREVIOUS-FIX.md
 */
export function ClosedSessionsPanel({
  casinoId,
  gamingDay,
  onStartFromPrevious,
}: ClosedSessionsPanelProps) {
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useClosedSlipsForGamingDay(casinoId, gamingDay ?? undefined);

  // Flatten pages to get all items
  const closedSlips = data?.pages.flatMap((page) => page.items) ?? [];

  // Format duration as HH:MM:SS
  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return "--:--";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
  };

  // Format time as HH:MM AM/PM
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Format currency
  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "--";
    return `$${amount.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
              <Users className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Closed Sessions
              </h2>
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg bg-muted/50"
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="text-sm font-medium text-destructive">
          Failed to load closed sessions
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Closed Sessions
            </h2>
            <p className="text-sm text-muted-foreground">
              Gaming Day: {gamingDay ?? "Loading..."}
            </p>
          </div>
        </div>

        {/* Session count badge */}
        <Badge variant="secondary" className="text-xs font-mono">
          {closedSlips.length} session{closedSlips.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Session List */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {closedSlips.length > 0 ? (
            <div className="space-y-2">
              {closedSlips.map((slip) => (
                <ClosedSlipRow
                  key={slip.id}
                  slip={slip}
                  onStartFromPrevious={() => onStartFromPrevious(slip.id)}
                  formatDuration={formatDuration}
                  formatTime={formatTime}
                  formatCurrency={formatCurrency}
                />
              ))}

              {/* Load More Button - ISSUE-SFP-001 */}
              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Load More"
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted/50 border border-border/50 mb-4">
                <Clock className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                No closed sessions today
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Closed sessions will appear here once players check out
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Summary Footer */}
      {closedSlips.length > 0 && (
        <div className="p-4 border-t border-border/40 bg-muted/10">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-foreground">
                {closedSlips.length}
              </div>
              <div className="text-xs text-muted-foreground/60">Sessions</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-emerald-400">
                {closedSlips.filter((s) => s.player !== null).length}
              </div>
              <div className="text-xs text-muted-foreground/60">Rated</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-amber-400">
                {closedSlips.filter((s) => s.player === null).length}
              </div>
              <div className="text-xs text-muted-foreground/60">Unrated</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Individual closed slip row component
 */
function ClosedSlipRow({
  slip,
  onStartFromPrevious,
  formatDuration,
  formatTime,
  formatCurrency,
}: {
  slip: ClosedSlipForGamingDayDTO;
  onStartFromPrevious: () => void;
  formatDuration: (seconds: number | null) => string;
  formatTime: (timestamp: string) => string;
  formatCurrency: (amount: number | null) => string;
}) {
  const playerName = slip.player
    ? `${slip.player.first_name} ${slip.player.last_name}`
    : "Unrated Player";

  return (
    <button
      onClick={onStartFromPrevious}
      className={cn(
        "w-full relative flex items-start gap-4 p-3 rounded-lg",
        "border border-border/40 bg-card/30",
        "hover:bg-muted/30 hover:border-accent/30 transition-all group text-left",
        "focus:outline-none focus:ring-2 focus:ring-accent/50",
      )}
    >
      {/* Player indicator */}
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-lg border",
          slip.player
            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
            : "bg-amber-500/20 text-amber-400 border-amber-500/30",
        )}
      >
        <Users className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors truncate">
            {playerName}
          </span>
          <span className="text-xs font-mono text-muted-foreground/70 tabular-nums shrink-0">
            {formatTime(slip.end_time)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{slip.table_name}</span>
          {slip.seat_number && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <span>Seat {slip.seat_number}</span>
            </>
          )}
          <span className="text-muted-foreground/40">|</span>
          <span className="font-mono">
            {formatDuration(slip.final_duration_seconds)}
          </span>
          {slip.average_bet !== null && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <span className="font-mono text-accent">
                {formatCurrency(slip.average_bet)} avg
              </span>
            </>
          )}
        </div>
        {slip.player?.tier && (
          <Badge
            variant="outline"
            className="mt-1.5 text-[10px] font-medium uppercase tracking-wider"
          >
            {slip.player.tier}
          </Badge>
        )}
      </div>

      {/* Hover indicator */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
