"use client";

import { Activity, Clock, Play, Pause } from "lucide-react";
import * as React from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { RatingSlipDTO } from "@/services/rating-slip/dtos";

interface SeatOccupant {
  firstName: string;
  lastName: string;
  slipId?: string;
}

interface ActivityPanelProps {
  tableName: string;
  activeSlips: RatingSlipDTO[];
  seats: (SeatOccupant | null)[];
  isLoading: boolean;
  onSlipClick: (slipId: string) => void;
}

interface ActivityEvent {
  id: string;
  type: "started" | "paused";
  playerName: string;
  seatNumber: string | null;
  time: Date;
  slipId: string;
}

/**
 * Activity Panel - Recent table activity timeline
 * Displays real-time activity feed with PT-2 dark industrial design
 */
export function ActivityPanel({
  tableName,
  activeSlips,
  seats,
  isLoading,
  onSlipClick,
}: ActivityPanelProps) {
  // Build seat-to-player name map from seats array
  const seatPlayerMap = React.useMemo(() => {
    const map = new Map<string, string>();
    seats.forEach((occupant, index) => {
      if (occupant) {
        const seatNum = String(index + 1);
        map.set(seatNum, `${occupant.firstName} ${occupant.lastName}`);
      }
    });
    return map;
  }, [seats]);

  // Build activity events from slips
  const activityEvents = React.useMemo((): ActivityEvent[] => {
    return activeSlips
      .map((slip) => {
        const playerName = slip.seat_number
          ? (seatPlayerMap.get(slip.seat_number) ?? `Seat ${slip.seat_number}`)
          : "Unknown Player";

        return {
          id: slip.id,
          type: (slip.status === "open" ? "started" : "paused") as
            | "started"
            | "paused",
          playerName,
          seatNumber: slip.seat_number,
          time: new Date(slip.start_time),
          slipId: slip.id,
        };
      })
      .sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [activeSlips, seatPlayerMap]);

  const getActivityIcon = (type: ActivityEvent["type"]) => {
    switch (type) {
      case "started":
        return <Play className="h-3.5 w-3.5" />;
      case "paused":
        return <Pause className="h-3.5 w-3.5" />;
      default:
        return <Activity className="h-3.5 w-3.5" />;
    }
  };

  const getActivityLabel = (type: ActivityEvent["type"]) => {
    switch (type) {
      case "started":
        return "Rating started";
      case "paused":
        return "Session paused";
      default:
        return "Activity";
    }
  };

  const getActivityColor = (type: ActivityEvent["type"]) => {
    switch (type) {
      case "started":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "paused":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
              <Activity className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-muted/50"
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
            <Activity className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
            <p className="text-sm text-muted-foreground">
              {tableName} • {activityEvents.length} events
            </p>
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-xs font-medium text-emerald-400">Live</span>
        </div>
      </div>

      {/* Activity Timeline */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {activityEvents.length > 0 ? (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gradient-to-b from-accent/50 via-border/50 to-transparent" />

              <div className="space-y-1">
                {activityEvents.map((event, index) => (
                  <button
                    key={event.id}
                    onClick={() => onSlipClick(event.slipId)}
                    className={cn(
                      "w-full relative flex items-start gap-4 p-3 rounded-lg",
                      "hover:bg-muted/30 transition-all group text-left",
                      "focus:outline-none focus:ring-2 focus:ring-accent/50",
                    )}
                  >
                    {/* Timeline dot */}
                    <div
                      className={cn(
                        "relative z-10 flex items-center justify-center w-10 h-10 rounded-lg border",
                        getActivityColor(event.type),
                      )}
                    >
                      {getActivityIcon(event.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                          {getActivityLabel(event.type)}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground/70 tabular-nums">
                          {event.time.toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {event.playerName}
                        {event.seatNumber && (
                          <span className="text-muted-foreground/60">
                            {" "}
                            • Seat {event.seatNumber}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Hover indicator */}
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted/50 border border-border/50 mb-4">
                <Clock className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                No recent activity
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Activity will appear here when players are seated
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Summary Footer */}
      {activityEvents.length > 0 && (
        <div className="p-4 border-t border-border/40 bg-muted/10">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-foreground">
                {activityEvents.filter((e) => e.type === "started").length}
              </div>
              <div className="text-xs text-muted-foreground/60">Started</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-amber-400">
                {activityEvents.filter((e) => e.type === "paused").length}
              </div>
              <div className="text-xs text-muted-foreground/60">Paused</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-emerald-400">
                {activityEvents.length}
              </div>
              <div className="text-xs text-muted-foreground/60">Total</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
