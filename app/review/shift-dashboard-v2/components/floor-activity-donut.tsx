/**
 * Floor Activity Donut
 *
 * Visual representation of rated vs unrated player ratio.
 * Key shift productivity metric showing value-generating players.
 *
 * @see IMPLEMENTATION_STRATEGY.md §7.2 Active Visitors Donut
 */

"use client";

import { InfoIcon, UsersIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { formatPercentage } from "../lib/format";

export interface FloorActivityDonutProps {
  /** Count of rated visitors (gaming_identified_rated) */
  ratedCount: number;
  /** Count of unrated visitors (gaming_ghost_unrated) */
  unratedCount: number;
  /** Pre-computed percentage of rated visitors */
  ratedPercentage?: number;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * SVG Donut Chart Component
 */
function DonutChart({
  ratedCount,
  unratedCount,
}: {
  ratedCount: number;
  unratedCount: number;
}) {
  const total = ratedCount + unratedCount;
  const ratedRatio = total > 0 ? ratedCount / total : 0;

  // SVG donut parameters
  const size = 120;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratedLength = ratedRatio * circumference;
  const unratedLength = circumference - ratedLength;

  // Rotation to start at 12 o'clock
  const rotation = -90;

  return (
    <div className="relative">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform"
      >
        {/* Background circle (unrated - slate) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-700"
        />

        {/* Foreground arc (rated - emerald) */}
        {ratedRatio > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={`${ratedLength} ${unratedLength}`}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
            className="text-emerald-500 transition-all duration-500"
          />
        )}
      </svg>

      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold font-mono tabular-nums">
          {total}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Active
        </span>
      </div>
    </div>
  );
}

export function FloorActivityDonut({
  ratedCount,
  unratedCount,
  ratedPercentage,
  isLoading,
}: FloorActivityDonutProps) {
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="h-4 w-4" />
        </div>
        <div className="mt-4 flex justify-center">
          <Skeleton className="h-[120px] w-[120px] rounded-full" />
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="mt-4 h-5 w-full" />
      </Card>
    );
  }

  const total = ratedCount + unratedCount;
  const computedPercentage =
    ratedPercentage ?? (total > 0 ? (ratedCount / total) * 100 : 0);

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Floor Activity
          </span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <InfoIcon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="text-sm">
                <strong>Rated</strong> = Identified players with tracked theo
                (value generating)
              </p>
              <p className="mt-1 text-sm">
                <strong>Unrated</strong> = Ghost players without ID (compliance
                only)
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Donut Chart */}
      <div className="mt-4 flex justify-center">
        <DonutChart ratedCount={ratedCount} unratedCount={unratedCount} />
      </div>

      {/* Legend */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-sm">Rated Visitors</span>
          </div>
          <span className="font-mono text-sm tabular-nums">
            {ratedCount}{" "}
            <span className="text-muted-foreground">
              ({formatPercentage(computedPercentage)})
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-slate-600" />
            <span className="text-sm">Unrated Visitors</span>
          </div>
          <span className="font-mono text-sm tabular-nums">
            {unratedCount}{" "}
            <span className="text-muted-foreground">
              ({formatPercentage(100 - computedPercentage)})
            </span>
          </span>
        </div>
      </div>

      {/* Key insight callout */}
      <div className="mt-4 rounded-md bg-emerald-500/10 px-3 py-2 text-center">
        <span className="text-sm font-medium text-emerald-500">
          {formatPercentage(computedPercentage)} of floor generating value
        </span>
      </div>
    </Card>
  );
}
