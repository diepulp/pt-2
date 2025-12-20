"use client";

import {
  AlertTriangle,
  Clock,
  DollarSign,
  Flag,
  Ghost,
  Pause,
  Play,
  Settings,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Mock session data - will be replaced with service layer
const MOCK_SESSION = {
  isActive: true,
  isPaused: false,
  isGhostMode: false,
  isGrindFlagged: false,
  duration: 135, // minutes
  startTime: new Date(Date.now() - 135 * 60 * 1000),
  timeLimit: { current: 135, limit: 240, warning: 180 },
  spendLimit: { current: 2450, limit: 5000, warning: 4000 },
  avgBet: 125,
  handsPlayed: 48,
};

interface SessionControlPanelProps {
  playerId: string | null;
  className?: string;
}

export function SessionControlPanel({
  playerId,
  className,
}: SessionControlPanelProps) {
  const [session, setSession] = React.useState(MOCK_SESSION);

  if (!playerId) {
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

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getLimitStatus = (current: number, limit: number, warning: number) => {
    if (current >= limit) return "critical";
    if (current >= warning) return "warning";
    return "normal";
  };

  const timeLimitStatus = getLimitStatus(
    session.timeLimit.current,
    session.timeLimit.limit,
    session.timeLimit.warning,
  );

  const spendLimitStatus = getLimitStatus(
    session.spendLimit.current,
    session.spendLimit.limit,
    session.spendLimit.warning,
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm flex flex-col",
        className,
      )}
    >
      {/* LED accent strip - changes color based on status */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent to-transparent",
          session.isPaused
            ? "via-amber-500/70"
            : session.isGhostMode
              ? "via-purple-500/70"
              : "via-emerald-500/70",
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

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              session.isPaused
                ? "bg-amber-500"
                : session.isGhostMode
                  ? "bg-purple-500 animate-pulse"
                  : "bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]",
            )}
          />
          <span className="text-xs font-mono text-muted-foreground">
            {session.isPaused
              ? "PAUSED"
              : session.isGhostMode
                ? "GHOST"
                : "ACTIVE"}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4">
        {/* Session Duration */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Duration
            </span>
          </div>
          <span className="font-mono text-lg font-bold text-foreground">
            {formatDuration(session.duration)}
          </span>
        </div>

        {/* Limit Indicators */}
        <div className="grid grid-cols-2 gap-3">
          {/* Time Limit */}
          <LimitIndicator
            icon={Clock}
            label="Time"
            current={session.timeLimit.current}
            limit={session.timeLimit.limit}
            unit="m"
            status={timeLimitStatus}
          />

          {/* Spend Limit */}
          <LimitIndicator
            icon={DollarSign}
            label="Spend"
            current={session.spendLimit.current}
            limit={session.spendLimit.limit}
            unit="$"
            status={spendLimitStatus}
          />
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-2">
          {/* Pause/Resume */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSession((s) => ({ ...s, isPaused: !s.isPaused }))}
            className={cn(
              "flex-1 h-9",
              session.isPaused
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                : "hover:bg-muted/50",
            )}
          >
            {session.isPaused ? (
              <>
                <Play className="h-4 w-4 mr-1.5" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-1.5" />
                Pause
              </>
            )}
          </Button>

          {/* Ghost Mode */}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSession((s) => ({ ...s, isGhostMode: !s.isGhostMode }))
            }
            className={cn(
              "h-9 px-3",
              session.isGhostMode
                ? "bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                : "hover:bg-muted/50",
            )}
            title="Toggle Ghost Mode"
          >
            <Ghost className="h-4 w-4" />
          </Button>

          {/* Grind Flag */}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSession((s) => ({ ...s, isGrindFlagged: !s.isGrindFlagged }))
            }
            className={cn(
              "h-9 px-3",
              session.isGrindFlagged
                ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                : "hover:bg-muted/50",
            )}
            title="Toggle Grind Flag"
          >
            <Flag className="h-4 w-4" />
          </Button>
        </div>

        {/* Warnings */}
        {(timeLimitStatus !== "normal" || spendLimitStatus !== "normal") && (
          <div className="space-y-2">
            {timeLimitStatus === "critical" && (
              <WarningBanner
                type="critical"
                message="Time limit reached - session should end"
              />
            )}
            {timeLimitStatus === "warning" && (
              <WarningBanner
                type="warning"
                message="Approaching time limit threshold"
              />
            )}
            {spendLimitStatus === "critical" && (
              <WarningBanner type="critical" message="Spending limit reached" />
            )}
            {spendLimitStatus === "warning" && (
              <WarningBanner
                type="warning"
                message="Approaching spending limit"
              />
            )}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-3 border-t border-border/40 bg-muted/10 shrink-0">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-lg font-mono font-bold text-foreground">
              ${session.avgBet}
            </div>
            <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">
              Avg Bet
            </div>
          </div>
          <div>
            <div className="text-lg font-mono font-bold text-accent">
              {session.handsPlayed}
            </div>
            <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">
              Hands Played
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LimitIndicator({
  icon: Icon,
  label,
  current,
  limit,
  unit,
  status,
}: {
  icon: typeof Clock;
  label: string;
  current: number;
  limit: number;
  unit: string;
  status: "normal" | "warning" | "critical";
}) {
  const percentage = Math.min(100, (current / limit) * 100);

  return (
    <div className="p-2.5 rounded-lg bg-muted/20 border border-border/30">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden mb-1.5">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            status === "critical"
              ? "bg-red-500"
              : status === "warning"
                ? "bg-amber-500"
                : "bg-emerald-500",
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Values */}
      <div
        className={cn(
          "text-xs font-mono tabular-nums",
          status === "critical"
            ? "text-red-400"
            : status === "warning"
              ? "text-amber-400"
              : "text-muted-foreground",
        )}
      >
        {unit === "$" ? `$${current}/$${limit}` : `${current}/${limit}${unit}`}
      </div>
    </div>
  );
}

function WarningBanner({
  type,
  message,
}: {
  type: "warning" | "critical";
  message: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md text-xs",
        type === "critical"
          ? "bg-red-500/10 border border-red-500/30 text-red-400"
          : "bg-amber-500/10 border border-amber-500/30 text-amber-400",
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
