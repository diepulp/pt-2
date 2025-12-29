"use client";

import {
  Circle,
  Pause,
  XCircle,
  User,
  Users,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  DollarSign,
  Zap,
} from "lucide-react";
import { memo } from "react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { TableData, TableAlert, GameType } from "../types";

interface TableCardProps {
  table: TableData;
  onSelect?: (tableId: string) => void;
  className?: string;
}

const gameTypeConfig: Record<GameType, { label: string; abbr: string; color: string }> = {
  blackjack: { label: "Blackjack", abbr: "BJ", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  poker: { label: "Poker", abbr: "PKR", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  roulette: { label: "Roulette", abbr: "RLT", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
  baccarat: { label: "Baccarat", abbr: "BAC", color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
};

const statusConfig = {
  active: {
    label: "Open",
    icon: Circle,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    fill: "fill-emerald-400",
  },
  inactive: {
    label: "Paused",
    icon: Pause,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    fill: "",
  },
  closed: {
    label: "Closed",
    icon: XCircle,
    color: "text-zinc-500",
    bgColor: "bg-zinc-500/10",
    borderColor: "border-zinc-500/20",
    fill: "",
  },
};

const alertIcons: Record<TableAlert["type"], React.ComponentType<{ className?: string }>> = {
  fill: ArrowDownToLine,
  drop: ArrowUpFromLine,
  mtl: DollarSign,
  limit: AlertTriangle,
  high_action: Zap,
};

const alertColors: Record<TableAlert["severity"], string> = {
  info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  critical: "bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse",
};

function formatCurrency(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}K`;
  }
  return `$${amount}`;
}

export const TableCard = memo(function TableCard({
  table,
  onSelect,
  className,
}: TableCardProps) {
  const status = statusConfig[table.status];
  const StatusIcon = status.icon;
  const gameType = gameTypeConfig[table.gameType];
  const hasAlerts = table.alerts && table.alerts.length > 0;
  const criticalAlerts = table.alerts?.filter((a) => a.severity === "critical") ?? [];

  return (
    <button
      onClick={() => onSelect?.(table.id)}
      className={cn(
        "group relative flex flex-col p-4 rounded-xl text-left transition-all duration-200",
        "bg-card/60 backdrop-blur-sm border",
        "hover:bg-card/80 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "active:scale-[0.98]",
        status.borderColor,
        criticalAlerts.length > 0 && "ring-1 ring-rose-500/30",
        table.status === "closed" && "opacity-60",
        className
      )}
    >
      {/* Critical alert indicator */}
      {criticalAlerts.length > 0 && (
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
      )}

      {/* Header: Table ID + Status */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          {/* Table Label - BIG */}
          <h3 className="text-xl font-bold tracking-tight text-foreground truncate font-mono">
            {table.label}
          </h3>
          {/* Game Type Badge */}
          <div className="flex items-center gap-2 mt-1">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
                gameType.color
              )}
            >
              {gameType.label}
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
            status.bgColor,
            status.color
          )}
        >
          <StatusIcon className={cn("w-3 h-3", status.fill)} />
          <span>{status.label}</span>
        </div>
      </div>

      {/* Bet Limits */}
      <div className="flex items-center gap-3 mb-3 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Min</span>
          <span className="font-mono font-medium text-foreground">
            {table.minBet ? formatCurrency(table.minBet) : "—"}
          </span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Max</span>
          <span className="font-mono font-medium text-foreground">
            {table.maxBet ? formatCurrency(table.maxBet) : "—"}
          </span>
        </div>
      </div>

      {/* Dealer & Occupancy Row */}
      <div className="flex items-center justify-between gap-2 text-sm">
        {/* Dealer */}
        <div className="flex items-center gap-1.5 min-w-0">
          <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground truncate">
            {table.dealerName || "—"}
          </span>
        </div>

        {/* Occupancy */}
        {table.maxOccupancy && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span
              className={cn(
                "font-mono text-xs",
                table.occupancy === table.maxOccupancy
                  ? "text-amber-400"
                  : "text-muted-foreground"
              )}
            >
              {table.occupancy ?? 0}/{table.maxOccupancy}
            </span>
          </div>
        )}
      </div>

      {/* Alerts Row */}
      {hasAlerts && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/50">
          {table.alerts!.slice(0, 3).map((alert) => {
            const AlertIcon = alertIcons[alert.type];
            return (
              <Tooltip key={alert.id}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border cursor-default",
                      alertColors[alert.severity]
                    )}
                  >
                    <AlertIcon className="w-3 h-3" />
                    <span className="truncate max-w-[80px]">{alert.label}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {alert.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
          {table.alerts!.length > 3 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-muted-foreground bg-muted/50">
              +{table.alerts!.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Hover overlay effect */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </button>
  );
});
