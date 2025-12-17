"use client";

import { LayoutGrid, Users, UserPlus } from "lucide-react";
import * as React from "react";

import { TableLayoutTerminal } from "@/components/table";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DashboardTableDTO } from "@/hooks/dashboard/types";
import { cn } from "@/lib/utils";
import type { RatingSlipDTO } from "@/services/rating-slip/dtos";

interface SeatOccupant {
  firstName: string;
  lastName: string;
  slipId?: string;
}

interface TablesPanelProps {
  // Data
  tableName: string;
  selectedTable: DashboardTableDTO | null;
  seats: (SeatOccupant | null)[];
  activeSlips: RatingSlipDTO[];
  isLoading: boolean;

  // Callbacks
  onSeatClick: (index: number, occupant: SeatOccupant | null) => void;
  onNewSlip: () => void;
}

/**
 * Tables Panel - Table layout visualization with seat management
 * Displays real-time table data with PT-2 dark industrial design
 */
export function TablesPanel({
  tableName,
  selectedTable,
  seats,
  activeSlips,
  isLoading,
  onSeatClick,
  onNewSlip,
}: TablesPanelProps) {
  // Calculate stats from real data
  const occupiedSeats = seats.filter((s) => s !== null).length;
  const totalSeats = seats.length;
  const activeSlipsCount = activeSlips.length;

  // Calculate average session time
  const avgSessionTime = React.useMemo(() => {
    if (activeSlips.length === 0) return "0m";

    const totalMinutes = activeSlips.reduce((acc, slip) => {
      const start = new Date(slip.start_time).getTime();
      const end = slip.end_time
        ? new Date(slip.end_time).getTime()
        : Date.now();
      return acc + (end - start) / 60000;
    }, 0);

    const avgMinutes = Math.floor(totalMinutes / activeSlips.length);

    if (avgMinutes < 60) {
      return `${avgMinutes}m`;
    }

    const hours = Math.floor(avgMinutes / 60);
    const minutes = avgMinutes % 60;
    return `${hours}h ${minutes}m`;
  }, [activeSlips]);

  // Get last activity time
  const lastActivity = React.useMemo(() => {
    if (activeSlips.length === 0) return "No activity";

    const latest = activeSlips.reduce((latest, slip) => {
      const slipTime = new Date(slip.start_time).getTime();
      return slipTime > latest ? slipTime : latest;
    }, 0);

    return new Date(latest).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  }, [activeSlips]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
              <LayoutGrid className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Table Layout
              </h2>
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            <div className="h-32 animate-pulse rounded-lg bg-muted/50" />
            <div className="h-64 animate-pulse rounded-lg bg-muted/50" />
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (!selectedTable) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="text-sm font-medium text-muted-foreground">
          Select a table to view layout
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
            <LayoutGrid className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Table Layout
            </h2>
            <p className="text-sm text-muted-foreground">
              {tableName} • Last activity: {lastActivity}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onNewSlip}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            New Slip
          </Button>
        </div>
      </div>

      {/* Panel Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Stats Summary Card - with LED accent strip */}
          <div className="relative overflow-hidden p-4 rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm">
            {/* LED accent strip */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

            {/* Grid overlay for depth */}
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.02]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            />

            <div className="relative grid grid-cols-4 gap-4">
              <StatItem
                icon={Users}
                label="Seats"
                value={`${occupiedSeats}/${totalSeats}`}
                subtext="occupied"
              />
              <StatItem
                label="Avg Session"
                value={avgSessionTime}
                subtext="duration"
              />
              <StatItem
                label="Active Slips"
                value={activeSlipsCount.toString()}
                subtext="rating slips"
                highlight
              />
              <StatItem
                label="Table Status"
                value={selectedTable.status}
                subtext="current state"
                positive={selectedTable.status === "active"}
              />
            </div>
          </div>

          {/* Table Layout Visualization */}
          <div className="relative overflow-hidden rounded-lg border border-border/40 bg-card/30 backdrop-blur-sm">
            {/* Section Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/30">
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Seat Positions
              </h3>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.5)]" />
                  <span className="text-muted-foreground font-medium">
                    Occupied
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-muted border border-border/50" />
                  <span className="text-muted-foreground/70 font-medium">
                    Available
                  </span>
                </div>
              </div>
            </div>

            {/* Table Terminal Component */}
            <div className="p-6 bg-gradient-to-b from-background/50 to-background/80">
              <TableLayoutTerminal
                seats={seats}
                dealerName={undefined}
                tableId={selectedTable.label}
                gameType={selectedTable.type}
                tableStatus={selectedTable.status}
                activeSlipsCount={selectedTable.activeSlipsCount}
                variant="full"
                onSeatClick={onSeatClick}
              />
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

/** Stat display item with PT-2 styling */
function StatItem({
  icon: Icon,
  label,
  value,
  subtext,
  highlight,
  positive,
}: {
  icon?: typeof Users;
  label: string;
  value: string;
  subtext: string;
  highlight?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        {Icon && <Icon className="h-4 w-4" />}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <div
        className={cn(
          "font-mono text-xl font-bold tracking-tight",
          highlight && "text-accent",
          positive && "text-emerald-400",
          !highlight && !positive && "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground/60">{subtext}</div>
    </div>
  );
}

/** Action card with hover effects */
function ActionCard({
  title,
  description,
  icon: Icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: typeof Users;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden p-4 rounded-lg border border-dashed border-accent/30 bg-card/20 hover:bg-accent/5 hover:border-accent/50 transition-all text-left"
    >
      {/* Hover glow effect */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-accent/10 border border-accent/20 group-hover:bg-accent/20 transition-colors">
          <Icon className="h-4 w-4 text-accent" />
        </div>
        <div>
          <h4 className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
            {title}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}
