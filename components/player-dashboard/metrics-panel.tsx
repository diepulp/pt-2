"use client";

import { ArrowDown, ArrowUp, BarChart3, Minus, TrendingUp } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Mock metrics data - will be replaced with service layer
const MOCK_METRICS = {
  summary: {
    avgSessionDuration: { value: 5.3, change: 12, trend: "up" as const },
    winRate: { value: 68, change: 5, trend: "up" as const },
    totalHands: { value: 1247, change: 156, trend: "up" as const },
    avgBet: { value: 142, change: -8, trend: "down" as const },
  },
  dailyData: [
    { day: "Mon", sessions: 4.2, wins: 12, losses: 8, netResult: 850 },
    { day: "Tue", sessions: 3.8, wins: 10, losses: 6, netResult: 620 },
    { day: "Wed", sessions: 5.1, wins: 15, losses: 9, netResult: 1100 },
    { day: "Thu", sessions: 4.7, wins: 13, losses: 7, netResult: 780 },
    { day: "Fri", sessions: 6.2, wins: 18, losses: 5, netResult: 2100 },
    { day: "Sat", sessions: 7.1, wins: 22, losses: 6, netResult: 2450 },
    { day: "Sun", sessions: 5.8, wins: 19, losses: 8, netResult: 1680 },
  ],
};

interface MetricsPanelProps {
  playerId: string | null;
  className?: string;
}

export function MetricsPanel({ playerId, className }: MetricsPanelProps) {
  const [activeTab, setActiveTab] = React.useState("overview");

  if (!playerId) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full",
          className,
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        <div className="flex flex-col items-center justify-center h-full p-8">
          <div className="w-16 h-16 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center mb-4">
            <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            No metrics available
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Select a player to view performance
          </p>
        </div>
      </div>
    );
  }

  const { summary, dailyData } = MOCK_METRICS;

  // Find max value for chart scaling
  const maxResult = Math.max(...dailyData.map((d) => Math.abs(d.netResult)));

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm flex flex-col",
        className,
      )}
    >
      {/* LED accent strip */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/20">
            <TrendingUp className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">
            Performance Metrics
          </h3>
        </div>

        <Badge variant="outline" className="text-[10px] h-5 border-accent/30">
          Last 7 Days
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col"
      >
        <div className="px-4 pt-3 shrink-0">
          <TabsList className="w-full h-8 bg-muted/30 p-0.5">
            <TabsTrigger
              value="overview"
              className="flex-1 text-xs data-[state=active]:bg-background data-[state=active]:text-accent"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="sessions"
              className="flex-1 text-xs data-[state=active]:bg-background data-[state=active]:text-accent"
            >
              Sessions
            </TabsTrigger>
            <TabsTrigger
              value="results"
              className="flex-1 text-xs data-[state=active]:bg-background data-[state=active]:text-accent"
            >
              Results
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 p-4 mt-0">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MetricCard
              label="Avg Session"
              value={`${summary.avgSessionDuration.value}h`}
              change={`${summary.avgSessionDuration.change > 0 ? "+" : ""}${summary.avgSessionDuration.change}%`}
              trend={summary.avgSessionDuration.trend}
            />
            <MetricCard
              label="Win Rate"
              value={`${summary.winRate.value}%`}
              change={`${summary.winRate.change > 0 ? "+" : ""}${summary.winRate.change}%`}
              trend={summary.winRate.trend}
              highlight
            />
            <MetricCard
              label="Total Hands"
              value={summary.totalHands.value.toLocaleString()}
              change={`+${summary.totalHands.change}`}
              trend={summary.totalHands.trend}
            />
            <MetricCard
              label="Avg Bet"
              value={`$${summary.avgBet.value}`}
              change={`${summary.avgBet.change}%`}
              trend={summary.avgBet.trend}
            />
          </div>

          {/* Mini Chart Preview */}
          <div className="rounded-lg bg-muted/20 border border-border/30 p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Weekly Trend
              </span>
              <span className="text-xs font-mono text-emerald-400">
                +$9,580
              </span>
            </div>
            <div className="flex items-end gap-1.5 h-12">
              {dailyData.map((day) => (
                <div
                  key={day.day}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div
                    className={cn(
                      "w-full rounded-t transition-all",
                      day.netResult >= 0
                        ? "bg-emerald-500/70"
                        : "bg-red-500/70",
                    )}
                    style={{
                      height: `${(Math.abs(day.netResult) / maxResult) * 100}%`,
                      minHeight: "4px",
                    }}
                  />
                  <span className="text-[8px] text-muted-foreground/60">
                    {day.day[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="flex-1 p-4 mt-0">
          <div className="space-y-2">
            {dailyData.map((day) => (
              <div
                key={day.day}
                className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/30"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono w-8 text-muted-foreground">
                    {day.day}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{day.sessions}h</span>
                    <span className="text-xs text-muted-foreground/60">
                      played
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-emerald-400">{day.wins}W</span>
                  <span className="text-xs text-muted-foreground">/</span>
                  <span className="text-xs text-red-400">{day.losses}L</span>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="results" className="flex-1 p-4 mt-0">
          <div className="space-y-2">
            {dailyData.map((day) => (
              <div
                key={day.day}
                className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/30"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono w-8 text-muted-foreground">
                    {day.day}
                  </span>
                  <div
                    className={cn(
                      "h-2 rounded-full",
                      day.netResult >= 0
                        ? "bg-emerald-500/50"
                        : "bg-red-500/50",
                    )}
                    style={{
                      width: `${(Math.abs(day.netResult) / maxResult) * 120 + 20}px`,
                    }}
                  />
                </div>
                <span
                  className={cn(
                    "text-sm font-mono font-medium",
                    day.netResult >= 0 ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {day.netResult >= 0 ? "+" : ""}$
                  {day.netResult.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({
  label,
  value,
  change,
  trend,
  highlight,
}: {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down" | "neutral";
  highlight?: boolean;
}) {
  const TrendIcon =
    trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;

  return (
    <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div
          className={cn(
            "flex items-center gap-0.5 text-[10px] font-medium",
            trend === "up"
              ? "text-emerald-400"
              : trend === "down"
                ? "text-red-400"
                : "text-muted-foreground",
          )}
        >
          <TrendIcon className="h-3 w-3" />
          {change}
        </div>
      </div>
      <div
        className={cn(
          "text-xl font-mono font-bold tracking-tight",
          highlight ? "text-accent" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
