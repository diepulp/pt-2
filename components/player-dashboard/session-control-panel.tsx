"use client";

import { Loader2, Settings } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { usePlayerDashboard } from "@/hooks/ui/use-player-dashboard";
import { useActiveVisit } from "@/hooks/visit/use-active-visit";
import { cn } from "@/lib/utils";

import { UnderDevelopmentIndicator } from "./under-development-indicator";

interface SessionControlPanelProps {
  className?: string;
}

export function SessionControlPanel({ className }: SessionControlPanelProps) {
  const { selectedPlayerId } = usePlayerDashboard();
  const {
    data: activeVisit,
    isLoading,
    error,
  } = useActiveVisit(selectedPlayerId || "");

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full",
          className,
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        <div className="flex flex-col items-center justify-center h-full p-6">
          <Loader2 className="h-6 w-6 text-accent/70 animate-spin" />
          <p className="text-xs text-muted-foreground mt-3">
            Loading session info...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full",
          className,
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />
        <div className="flex flex-col items-center justify-center h-full p-6">
          <Settings className="h-6 w-6 text-red-400/70 mb-2" />
          <p className="text-xs font-medium text-red-400">
            Error loading session
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {error.message || "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  if (!selectedPlayerId) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full",
          className,
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        <div className="flex flex-col items-center justify-center h-full p-6">
          <div className="w-12 h-12 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center mb-3">
            <Settings className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Session controls unavailable
          </p>
        </div>
      </div>
    );
  }

  // Check if player has active visit
  const hasActiveVisit = activeVisit?.has_active_visit || false;
  const visit = activeVisit?.visit || null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm flex flex-col",
        className,
      )}
    >
      {/* LED accent strip */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent to-transparent",
          hasActiveVisit ? "via-emerald-500/70" : "via-muted-foreground/30",
        )}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/20">
            <Settings className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">
            Session Controls
          </h3>
        </div>

        {/* Visit status indicator */}
        {hasActiveVisit && (
          <Badge
            variant="outline"
            className="text-[10px] h-5 bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          >
            <div className="w-1.5 h-1.5 rounded-full mr-1.5 bg-emerald-500 animate-pulse" />
            Checked In
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {hasActiveVisit && visit ? (
          <div className="space-y-3">
            {/* Visit info */}
            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-emerald-400 font-medium">
                  Active Visit
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  {new Date(visit.started_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Visit ID:{" "}
                <span className="font-mono">{visit.id.slice(0, 8)}</span>
              </p>
            </div>

            {/* Real-time session controls (Under Development) */}
            <UnderDevelopmentIndicator
              feature="Real-time Session Controls"
              description="Pause, resume, and monitor active gaming sessions in real-time"
              variant="inline"
            />
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-1">
              No active visit
            </p>
            <p className="text-xs text-muted-foreground/60">
              Player is not currently checked in
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
