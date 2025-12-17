"use client";

import {
  TrendingUp,
  BarChart3,
  Clock,
  Users,
  DollarSign,
  Activity,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface AnalyticsPanelProps {
  tableName: string;
}

/**
 * Analytics Panel - Table performance metrics and insights
 * Static UI for review, displaying mock analytics data
 */
export function AnalyticsPanel({ tableName }: AnalyticsPanelProps) {
  // Mock metrics data
  const metrics = [
    {
      label: "Win/Loss",
      value: "+$12,450",
      change: "+8.2%",
      positive: true,
      icon: DollarSign,
    },
    {
      label: "Handle",
      value: "$145,200",
      change: "+12.5%",
      positive: true,
      icon: BarChart3,
    },
    {
      label: "Avg Session",
      value: "47 min",
      change: "-5.1%",
      positive: false,
      icon: Clock,
    },
    {
      label: "Active Players",
      value: "6",
      change: "0%",
      positive: true,
      icon: Users,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
            <TrendingUp className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
            <p className="text-sm text-muted-foreground">
              {tableName} • Today's Performance
            </p>
          </div>
        </div>
      </div>

      {/* Panel Content */}
      <div className="flex-1 p-4 space-y-6">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                className={cn(
                  "relative overflow-hidden p-4 rounded-lg",
                  "border border-border/40 bg-card/50",
                  "backdrop-blur-sm",
                )}
              >
                {/* Accent strip */}
                <div
                  className={cn(
                    "absolute top-0 left-0 right-0 h-0.5",
                    metric.positive
                      ? "bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"
                      : "bg-gradient-to-r from-transparent via-amber-500/50 to-transparent",
                  )}
                />

                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                      <span className="text-xs uppercase tracking-wide">
                        {metric.label}
                      </span>
                    </div>
                    <div className="font-mono text-xl font-bold text-foreground">
                      {metric.value}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-mono",
                      metric.positive
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-amber-500/10 text-amber-400",
                    )}
                  >
                    {metric.change}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Activity Graph Placeholder */}
        <div className="relative overflow-hidden rounded-lg border border-border/40 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Hourly Activity
            </span>
          </div>

          {/* Mock bar chart */}
          <div className="flex items-end gap-2 h-32">
            {[35, 55, 75, 45, 85, 65, 90, 70, 50, 80, 60, 40].map(
              (height, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-accent/20 to-accent/60 transition-all hover:from-accent/30 hover:to-accent/80"
                  style={{ height: `${height}%` }}
                />
              ),
            )}
          </div>

          {/* Time labels */}
          <div className="flex justify-between mt-2 text-xs text-muted-foreground font-mono">
            <span>6AM</span>
            <span>9AM</span>
            <span>12PM</span>
            <span>3PM</span>
          </div>

          {/* Grid overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.02]"
            style={{
              backgroundImage:
                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />
        </div>

        {/* Quick Stats */}
        <div className="rounded-lg border border-border/40 bg-card/50 p-4">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-3">
            Session Breakdown
          </h3>
          <div className="space-y-3">
            {[
              {
                label: "High Rollers",
                count: 2,
                value: "$8,200",
                color: "bg-violet-500",
              },
              {
                label: "Regular Players",
                count: 3,
                value: "$3,150",
                color: "bg-cyan-500",
              },
              {
                label: "Casual Players",
                count: 1,
                value: "$1,100",
                color: "bg-emerald-500",
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full", item.color)} />
                <span className="text-sm text-muted-foreground flex-1">
                  {item.label}
                </span>
                <span className="text-sm font-mono text-foreground">
                  {item.count}
                </span>
                <span className="text-sm font-mono text-accent">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
