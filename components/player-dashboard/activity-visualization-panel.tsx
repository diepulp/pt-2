"use client";

import { Activity, Clock, MapPin, TrendingUp } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Mock activity data - will be replaced with service layer
const MOCK_ACTIVITY = {
  isLive: true,
  currentTable: "BJ-04",
  sessionDuration: "2h 15m",
  activityLevel: "high" as const,
  hourlyData: Array.from({ length: 12 }, (_, i) => ({
    time: `${String(i + 8).padStart(2, "0")}:00`,
    activity: Math.floor(Math.random() * 50) + 30 + (i > 6 ? 20 : 0),
    bets: Math.floor(Math.random() * 30) + 10,
    result: Math.floor(Math.random() * 600) - 200,
  })),
  recentActions: [
    { time: "14:32", action: "Bet placed", value: "$150", table: "BJ-04" },
    { time: "14:28", action: "Win", value: "+$225", table: "BJ-04" },
    { time: "14:25", action: "Bet placed", value: "$100", table: "BJ-04" },
    { time: "14:22", action: "Session resumed", value: null, table: "BJ-04" },
    { time: "14:15", action: "Break started", value: null, table: null },
  ],
};

interface ActivityVisualizationPanelProps {
  playerId: string | null;
  className?: string;
}

export function ActivityVisualizationPanel({
  playerId,
  className,
}: ActivityVisualizationPanelProps) {
  const [activeTab, setActiveTab] = React.useState("activity");

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
            <Activity className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            No activity data
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Select a player to view real-time activity
          </p>
        </div>
      </div>
    );
  }

  const {
    isLive,
    currentTable,
    sessionDuration,
    activityLevel,
    hourlyData,
    recentActions,
  } = MOCK_ACTIVITY;

  // Find max values for chart scaling
  const maxActivity = Math.max(...hourlyData.map((d) => d.activity));

  const getActivityLevelConfig = (level: string) => {
    switch (level) {
      case "high":
        return { color: "text-emerald-400", bg: "bg-emerald-500" };
      case "medium":
        return { color: "text-amber-400", bg: "bg-amber-500" };
      case "low":
        return { color: "text-slate-400", bg: "bg-slate-500" };
      default:
        return { color: "text-muted-foreground", bg: "bg-muted" };
    }
  };

  const levelConfig = getActivityLevelConfig(activityLevel);

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
            <Activity className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Real-Time Activity
            </h3>
            <p className="text-xs text-muted-foreground">
              {currentTable} • {sessionDuration}
            </p>
          </div>
        </div>

        {/* Live indicator */}
        {isLive && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">
              Live
            </span>
          </div>
        )}
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
              value="activity"
              className="flex-1 text-xs data-[state=active]:bg-background data-[state=active]:text-accent"
            >
              Activity
            </TabsTrigger>
            <TabsTrigger
              value="timeline"
              className="flex-1 text-xs data-[state=active]:bg-background data-[state=active]:text-accent"
            >
              Timeline
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="activity" className="flex-1 p-4 mt-0 flex flex-col">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 mb-4 shrink-0">
            <StatCard icon={MapPin} label="Location" value={currentTable} />
            <StatCard icon={Clock} label="Duration" value={sessionDuration} />
            <StatCard
              icon={TrendingUp}
              label="Activity"
              value={activityLevel}
              valueColor={levelConfig.color}
            />
          </div>

          {/* Activity Chart */}
          <div className="flex-1 rounded-lg bg-muted/20 border border-border/30 p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Hourly Activity
              </span>
              <span className="text-xs font-mono text-accent">
                Peak: {maxActivity}
              </span>
            </div>

            {/* Chart visualization */}
            <div className="relative h-32">
              {/* Grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="border-b border-border/20"
                    style={{ height: "1px" }}
                  />
                ))}
              </div>

              {/* Bars */}
              <div className="relative h-full flex items-end gap-1 px-1">
                {hourlyData.map((data, i) => (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-accent/40 to-accent/80 hover:from-accent/60 hover:to-accent transition-all cursor-pointer group relative"
                      style={{
                        height: `${(data.activity / maxActivity) * 100}%`,
                        minHeight: "4px",
                      }}
                    >
                      {/* Tooltip on hover */}
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-card border border-border/50 text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        {data.activity} actions
                      </div>
                    </div>
                    <span className="text-[8px] text-muted-foreground/50 font-mono">
                      {data.time.split(":")[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="flex-1 p-4 mt-0 overflow-auto">
          {/* Timeline */}
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-accent/50 via-border/50 to-transparent" />

            <div className="space-y-2">
              {recentActions.map((action, i) => (
                <div
                  key={i}
                  className="relative flex items-start gap-3 pl-7 py-2 rounded-lg hover:bg-muted/20 transition-colors group"
                >
                  {/* Dot */}
                  <div
                    className={cn(
                      "absolute left-1.5 top-3.5 w-3 h-3 rounded-full border-2 bg-background",
                      action.value?.startsWith("+")
                        ? "border-emerald-500"
                        : action.value?.startsWith("$")
                          ? "border-accent"
                          : "border-border",
                    )}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium group-hover:text-accent transition-colors">
                        {action.action}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground/60">
                        {action.time}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {action.value && (
                        <span
                          className={cn(
                            "text-xs font-mono",
                            action.value.startsWith("+")
                              ? "text-emerald-400"
                              : action.value.startsWith("-")
                                ? "text-red-400"
                                : "text-foreground",
                          )}
                        >
                          {action.value}
                        </span>
                      )}
                      {action.table && (
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 px-1 border-border/50"
                        >
                          {action.table}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  valueColor,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/20 border border-border/30">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div
        className={cn(
          "text-sm font-mono font-bold capitalize",
          valueColor || "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
