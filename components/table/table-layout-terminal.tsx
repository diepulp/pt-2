"use client";

import { Pencil } from "lucide-react";
import * as React from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useSeatPositions } from "./use-seat-positions";

interface SeatOccupant {
  firstName: string;
  lastName: string;
}

interface TableLayoutTerminalProps {
  seats: (SeatOccupant | null)[];
  onSeatClick?: (index: number, occupant: SeatOccupant | null) => void;
  isLoading?: boolean;
  dealerName?: string;
  // Dashboard-specific props (WS1: PRD-006)
  tableId?: string;
  gameType?: string;
  tableStatus?: "active" | "inactive" | "closed";
  activeSlipsCount?: number;
  variant?: "full" | "compact";
  isSelected?: boolean;
  onTableAction?: (action: "open" | "close" | "details") => void;
  // Betting limits (PRD-012)
  minBet?: number;
  maxBet?: number;
  onEditLimits?: () => void;
}

// Modern Minimalist Theme
// Uses Tailwind semantic tokens: background, card, accent, muted, etc.

export const TableLayoutTerminal = React.memo<TableLayoutTerminalProps>(
  function TableLayoutTerminal({
    seats,
    onSeatClick,
    isLoading = false,
    dealerName,
    tableId,
    gameType,
    tableStatus = "active",
    activeSlipsCount,
    variant = "full",
    isSelected = false,
    onTableAction,
    minBet,
    maxBet,
    onEditLimits,
  }) {
    const positions = useSeatPositions(seats.length);

    const isCompact = variant === "compact";

    // Compact variant: Render thumbnail with metadata overlay
    if (isCompact) {
      return (
        <div
          className={cn(
            "relative group rounded-lg overflow-hidden border transition-all duration-200",
            "w-[100px] h-[80px]", // Fixed compact size
            isSelected
              ? "border-accent/80 ring-2 ring-accent/40 shadow-lg"
              : "border-border/50 hover:border-accent/50",
            tableStatus === "inactive" && "opacity-60",
            tableStatus === "closed" && "opacity-40 grayscale",
          )}
        >
          {/* Table ID Badge */}
          {tableId && (
            <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded bg-background/90 border border-border/50 backdrop-blur-sm">
              <span className="text-[9px] font-bold text-foreground">
                {tableId}
              </span>
            </div>
          )}

          {/* Active Slips Count Badge */}
          {activeSlipsCount !== undefined && activeSlipsCount > 0 && (
            <div className="absolute top-1 right-1 z-10 px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground">
              <span className="text-[9px] font-bold">{activeSlipsCount}</span>
            </div>
          )}

          {/* Game Type & Status Badge */}
          {gameType && (
            <div className="absolute bottom-1 left-1 z-10 px-1.5 py-0.5 rounded bg-muted/90 border border-border/50 backdrop-blur-sm">
              <span className="text-[8px] font-semibold uppercase text-muted-foreground">
                {gameType}
              </span>
            </div>
          )}

          {/* Status Indicator */}
          <div className="absolute bottom-1 right-1 z-10">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                tableStatus === "active" &&
                  "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]",
                tableStatus === "inactive" && "bg-yellow-500",
                tableStatus === "closed" && "bg-gray-500",
              )}
            />
          </div>

          {/* Simplified table visualization */}
          <div className="absolute inset-0 bg-gradient-to-b from-card/80 via-card/60 to-background/80">
            {/* Table arc shape */}
            <div className="absolute inset-x-[8%] top-[15%] bottom-[5%] rounded-t-[50%] border border-border/30 bg-card/40" />

            {/* Seat indicators (simplified) */}
            <div className="absolute inset-0 flex items-start justify-center gap-1 pt-2">
              {seats.slice(0, Math.min(seats.length, 7)).map((occupant, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    occupant
                      ? "bg-accent shadow-[0_0_4px_hsl(var(--accent)/0.6)]"
                      : "bg-muted border border-border/40",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Full variant: Original full-featured rendering
    return (
      <TooltipProvider delayDuration={100}>
        <section
          aria-label="Table layout"
          className={cn(
            "relative w-full",
            isSelected &&
              "ring-2 ring-accent/50 ring-offset-4 ring-offset-background rounded-lg",
          )}
        >
          {/* Ambient glow behind table */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] aspect-[3/2] rounded-full blur-3xl opacity-20 pointer-events-none bg-accent/20" />

          {/* Main table container - responsive with aspect ratio */}
          <div className="relative w-full max-w-[500px] mx-auto aspect-[16/10]">
            {/* Table surface */}
            <div
              className={cn(
                "absolute inset-x-[5%] top-[8%] bottom-0",
                "rounded-t-[50%]",
                "border border-border/50",
                "shadow-[inset_0_2px_40px_rgba(0,0,0,0.4),_0_16px_48px_-8px_rgba(0,0,0,0.4),_0_0_0_1px_rgba(255,255,255,0.05)]",
                "overflow-hidden",
                "bg-gradient-to-b from-card via-card/90 to-background",
              )}
            >
              {/* Subtle noise texture overlay */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
              />

              {/* Radial highlight at top */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--accent)/0.1),transparent)]" />

              {/* Subtle grid pattern */}
              <div className="pointer-events-none absolute inset-0 opacity-[0.04] bg-[radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] [background-size:20px_20px]" />

              {/* Inner rail/border effect */}
              <div className="absolute inset-[6%] rounded-t-[50%] border border-border/20 pointer-events-none" />

              {/* Loading skeleton overlay */}
              {isLoading && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex gap-3">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-muted animate-pulse"
                          style={{ animationDelay: `${i * 100}ms` }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] sm:text-xs font-medium text-muted-foreground tracking-wide uppercase">
                      Loading table...
                    </span>
                  </div>
                </div>
              )}

              {/* Table Identity - Centered inside semi-circle */}
              {tableId && (
                <div className="absolute top-[69%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1.5">
                  {/* Table name with status glow ring */}
                  <div
                    className={cn(
                      "relative px-4 py-2 rounded-xl",
                      "bg-gradient-to-b from-card/90 to-card/70",
                      "border backdrop-blur-md",
                      "shadow-[0_4px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]",
                      tableStatus === "active" && [
                        "border-emerald-500/40",
                        "shadow-[0_0_20px_rgba(16,185,129,0.2),0_4px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]",
                      ],
                      tableStatus === "inactive" && "border-amber-500/40",
                      tableStatus === "closed" && "border-border/40",
                    )}
                  >
                    {/* Status pulse ring for active tables */}
                    {tableStatus === "active" && (
                      <div className="absolute inset-0 rounded-xl border border-emerald-500/30 animate-pulse" />
                    )}

                    <div className="flex items-center gap-2.5">
                      {/* Table ID */}
                      <span className="text-lg sm:text-xl font-bold tracking-wide text-muted-foreground/70 ">
                        {tableId}
                      </span>

                      {/* Status badge */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
                              tableStatus === "active" && [
                                "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
                              ],
                              tableStatus === "inactive" && [
                                "bg-amber-500/20 text-amber-400 border border-amber-500/30",
                              ],
                              tableStatus === "closed" && [
                                "bg-muted text-muted-foreground border border-border/50",
                              ],
                            )}
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                tableStatus === "active" &&
                                  "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]",
                                tableStatus === "inactive" && "bg-amber-400",
                                tableStatus === "closed" &&
                                  "bg-muted-foreground",
                              )}
                            />
                            {tableStatus}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <span>
                            Table is{" "}
                            {tableStatus === "active"
                              ? "open and accepting players"
                              : tableStatus === "inactive"
                                ? "temporarily paused"
                                : "closed for the day"}
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Game type subtitle */}
                    {/* {gameType && (
                    <div className="mt-1 text-center">
                      <span className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
                        {gameType}
                      </span>
                    </div>
                  )} */}
                  </div>
                </div>
              )}

              {/* Dealer position */}
              {/* <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10">
              <div className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-muted/50 border border-border/50 backdrop-blur-sm">
                <span className="text-[8px] sm:text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                  Dealer
                </span>
              </div>
              {dealerName && (
                <span className="text-[10px] sm:text-xs text-foreground/80 font-medium">
                  {dealerName}
                </span>
              )}
            </div> */}
            </div>

            {/* Seats layer - positioned over the table */}
            <div className="absolute inset-0">
              {seats.map((occupant, i) => {
                const pos = positions[i];
                if (!pos) return null;

                return (
                  <button
                    key={i}
                    onClick={() => onSeatClick?.(i, occupant)}
                    className={cn(
                      "group absolute -translate-x-1/2 -translate-y-1/2 focus:outline-hidden",
                      "animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both",
                    )}
                    style={{
                      left: pos.left,
                      top: pos.top,
                      animationDelay: `${i * 80}ms`,
                    }}
                    aria-label={
                      occupant
                        ? `Seat ${i + 1}, occupied by ${occupant.firstName} ${occupant.lastName}`
                        : `Seat ${i + 1}, empty`
                    }
                  >
                    {/* Seat glow effect on hover/occupied */}
                    <div
                      className={cn(
                        "absolute inset-0 rounded-full blur-md transition-opacity duration-300 pointer-events-none",
                        occupant
                          ? "bg-accent/40 opacity-100"
                          : "bg-accent/20 opacity-0 group-hover:opacity-100",
                      )}
                      style={{ transform: "scale(1.4)" }}
                    />

                    {/* Main seat circle - responsive sizing with larger touch targets on mobile */}
                    <div
                      className={cn(
                        "relative w-12 h-12 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full",
                        "border backdrop-blur-sm",
                        "transition-all duration-300 ease-out",
                        occupant
                          ? "border-accent/60 bg-accent/20 shadow-[0_0_20px_hsl(var(--accent)/0.3)]"
                          : "border-border/40 bg-card/40 shadow-[0_8px_20px_rgba(0,0,0,0.3)]",
                        "group-hover:scale-110 group-hover:border-accent/50 group-hover:bg-accent/10",
                        "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background",
                        // Touch-friendly: ensure minimum 44x44px tap target
                        "min-w-[44px] min-h-[44px]",
                      )}
                    >
                      {/* Seat number */}
                      <span
                        className={cn(
                          "absolute inset-0 grid place-items-center font-semibold transition-all duration-300",
                          occupant
                            ? "text-accent-foreground text-xs sm:text-sm"
                            : "text-muted-foreground text-[10px] sm:text-xs group-hover:text-foreground",
                        )}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {i + 1}
                      </span>

                      {/* Inner ring for depth */}
                      <div className="absolute inset-1 sm:inset-1.5 rounded-full border border-white/5" />
                    </div>

                    {/* Status badge */}
                    <span
                      className={cn(
                        "absolute -bottom-2 sm:-bottom-2.5 left-1/2 -translate-x-1/2",
                        "rounded-full px-1.5 sm:px-2 py-0.5",
                        "text-[7px] sm:text-[9px] font-bold tracking-wider uppercase",
                        "transition-all duration-300",
                        "shadow-xs",
                        occupant
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground border border-border/50",
                        "group-hover:scale-105",
                      )}
                    >
                      {occupant ? "Taken" : "Open"}
                    </span>

                    {/* Player name tooltip on hover for occupied seats */}
                    {occupant && (
                      <div
                        className={cn(
                          "absolute -top-8 sm:-top-10 left-1/2 -translate-x-1/2",
                          "px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md",
                          "bg-popover border border-border",
                          "text-[9px] sm:text-[11px] font-medium text-popover-foreground whitespace-nowrap",
                          "opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100",
                          "transition-all duration-200",
                          "shadow-lg",
                          "pointer-events-none",
                          "z-20",
                        )}
                      >
                        {occupant.firstName} {occupant.lastName}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-b border-r border-border rotate-45" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table stats footer */}
          <div className="mt-4 flex justify-center gap-4 sm:gap-6 text-[10px] sm:text-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 sm:gap-2 cursor-default">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.5)]" />
                  <span className="text-muted-foreground font-medium">
                    {seats.filter(Boolean).length} Occupied
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>Players currently seated at this table</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 sm:gap-2 cursor-default">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-muted border border-border/50" />
                  <span className="text-muted-foreground/70 font-medium">
                    {seats.filter((s) => !s).length} Available
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>Open seats ready for players</span>
              </TooltipContent>
            </Tooltip>

            {/* Betting limits badge (PRD-012) */}
            {minBet !== undefined && maxBet !== undefined && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/40 dark:border-emerald-400/30 cursor-default">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      ${minBet.toLocaleString()} – ${maxBet.toLocaleString()}
                    </span>
                    {onEditLimits && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditLimits();
                        }}
                        className="ml-0.5 p-0.5 rounded hover:bg-emerald-500/20 dark:hover:bg-emerald-400/20 transition-colors"
                        aria-label="Edit table limits"
                      >
                        <Pencil className="size-3 text-emerald-600 dark:text-emerald-400" />
                      </button>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <span>Table betting limits (min – max)</span>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </section>
      </TooltipProvider>
    );
  },
);

export default TableLayoutTerminal;
