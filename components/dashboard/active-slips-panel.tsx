/**
 * Active Slips Panel
 *
 * Displays active (open + paused) rating slips for a selected table.
 * Provides lifecycle actions: pause, resume, close.
 *
 * Design: Brutalist panel with monospace typography, high-contrast states.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS4
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, X, Clock, User, AlertCircle } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveSlipsForDashboard, dashboardKeys } from "@/hooks/dashboard";
import { cn } from "@/lib/utils";
import type { RatingSlipDTO } from "@/services/rating-slip/dtos";
import {
  pauseRatingSlip,
  resumeRatingSlip,
  closeRatingSlip,
} from "@/services/rating-slip/http";

interface ActiveSlipsPanelProps {
  /** Selected table ID */
  tableId: string | undefined;
  /** Casino ID for cache invalidation */
  casinoId: string;
  /** Callback when a new slip should be created */
  onNewSlip?: () => void;
}

/**
 * Format duration from start time to now (or end time).
 * Returns format like "1h 23m" or "45m".
 */
function formatDuration(startTime: string, endTime?: string | null): string {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const diffMinutes = Math.floor((end - start) / 60000);

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Format time from ISO string to HH:MM format.
 */
function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function ActiveSlipsPanel({
  tableId,
  casinoId,
  onNewSlip,
}: ActiveSlipsPanelProps) {
  const queryClient = useQueryClient();

  // Fetch active slips for the selected table
  const {
    data: slips = [],
    isLoading,
    error,
  } = useActiveSlipsForDashboard(tableId);

  // Mutation: Pause a slip
  const pauseMutation = useMutation({
    mutationFn: pauseRatingSlip,
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
    },
  });

  // Mutation: Resume a slip
  const resumeMutation = useMutation({
    mutationFn: resumeRatingSlip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
    },
  });

  // Mutation: Close a slip
  const closeMutation = useMutation({
    mutationFn: (slipId: string) => closeRatingSlip(slipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.slips.scope });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.stats(casinoId),
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.tables.scope,
      });
    },
  });

  // Handle slip action
  const handleAction = (
    slip: RatingSlipDTO,
    action: "pause" | "resume" | "close",
  ) => {
    switch (action) {
      case "pause":
        pauseMutation.mutate(slip.id);
        break;
      case "resume":
        resumeMutation.mutate(slip.id);
        break;
      case "close":
        closeMutation.mutate(slip.id);
        break;
    }
  };

  // No table selected state
  if (!tableId) {
    return (
      <Card className="border-2 border-dashed border-border/50 bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            style={{ fontFamily: "monospace" }}
          >
            Select a Table
          </div>
          <p className="mt-2 text-xs text-muted-foreground/70">
            Choose a table from the grid to view active slips
          </p>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Card className="border-2 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: "monospace" }}
          >
            Active Slips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-muted/50"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-2 border-destructive/50 bg-destructive/5">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <div
              className="text-xs font-bold uppercase tracking-widest text-destructive"
              style={{ fontFamily: "monospace" }}
            >
              Error Loading Slips
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {error.message}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle
          className="text-sm font-bold uppercase tracking-widest"
          style={{ fontFamily: "monospace" }}
        >
          Active Slips ({slips.length})
        </CardTitle>
        {onNewSlip && (
          <Button
            variant="outline"
            size="sm"
            onClick={onNewSlip}
            className="h-7 text-xs font-semibold uppercase tracking-wider"
          >
            + New Slip
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {slips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70"
              style={{ fontFamily: "monospace" }}
            >
              No Active Slips
            </div>
            <p className="mt-2 text-xs text-muted-foreground/50">
              Click a seat to start a new rating slip
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {slips.map((slip) => (
              <SlipCard
                key={slip.id}
                slip={slip}
                onAction={(action) => handleAction(slip, action)}
                isLoading={
                  pauseMutation.isPending ||
                  resumeMutation.isPending ||
                  closeMutation.isPending
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// === Slip Card Component ===

interface SlipCardProps {
  slip: RatingSlipDTO;
  onAction: (action: "pause" | "resume" | "close") => void;
  isLoading: boolean;
}

function SlipCard({ slip, onAction, isLoading }: SlipCardProps) {
  const isPaused = slip.status === "paused";
  const isOpen = slip.status === "open";

  return (
    <div
      className={cn(
        "group relative rounded-lg border-2 p-3 transition-all",
        isPaused
          ? "border-yellow-500/50 bg-yellow-500/5"
          : "border-accent/30 bg-accent/5 hover:border-accent/50",
      )}
    >
      {/* Status indicator */}
      <div
        className={cn(
          "absolute right-3 top-3 h-2 w-2 rounded-full",
          isPaused
            ? "bg-yellow-500 animate-pulse"
            : "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]",
        )}
      />

      {/* Slip info */}
      <div className="flex items-start justify-between pr-6">
        <div className="space-y-1">
          {/* Seat number */}
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span
              className="text-sm font-bold"
              style={{ fontFamily: "monospace" }}
            >
              Seat {slip.seat_number ?? "—"}
            </span>
            {isPaused && (
              <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
                Paused
              </span>
            )}
          </div>

          {/* Duration and start time */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(slip.start_time, slip.end_time)}
            </span>
            <span>Started {formatTime(slip.start_time)}</span>
          </div>

          {/* Average bet if set */}
          {slip.average_bet !== null && (
            <div className="text-xs text-muted-foreground">
              Avg bet: ${slip.average_bet.toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex items-center gap-2">
        {isOpen && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction("pause")}
            disabled={isLoading}
            className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
          >
            <Pause className="h-3 w-3" />
            Pause
          </Button>
        )}
        {isPaused && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction("resume")}
            disabled={isLoading}
            className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider text-green-600 hover:text-green-600 dark:text-green-400"
          >
            <Play className="h-3 w-3" />
            Resume
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAction("close")}
          disabled={isLoading}
          className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider text-destructive hover:text-destructive"
        >
          <X className="h-3 w-3" />
          Close
        </Button>
      </div>
    </div>
  );
}
