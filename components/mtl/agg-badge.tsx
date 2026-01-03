/**
 * MTL Aggregate Badge (Tier 2 - COMPLIANCE AUTHORITY)
 *
 * Daily aggregate threshold indication per 31 CFR § 1021.311.
 * This is the AUTHORITATIVE compliance trigger surface.
 *
 * Badge Levels:
 * - none: Below watchlist aggregate
 * - agg_watchlist: Aggregate >= watchlist floor
 * - agg_ctr_near: Aggregate approaching CTR (80%+ of $10,000)
 * - agg_ctr_met: Aggregate EXCEEDS CTR threshold (> $10,000)
 *
 * COMPLIANCE NOTE: Per 31 CFR § 1021.311, CTR obligation triggers when
 * daily cash-in OR cash-out EXCEEDS (strictly >) $10,000 per patron per gaming day.
 * Cash-in and cash-out are tracked SEPARATELY.
 *
 * @see services/mtl/dtos.ts - AggBadge type
 * @see PRD-005 Two-tier badge system
 */

"use client";

import {
  AlertTriangle,
  Eye,
  FileWarning,
  Minus,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AggBadge as AggBadgeType } from "@/services/mtl/dtos";

export interface AggBadgeProps {
  badge: AggBadgeType;
  /** Direction context for label */
  direction?: "in" | "out";
  /** Show text label alongside icon */
  showLabel?: boolean;
  /** Compact size for table cells */
  size?: "default" | "sm";
  className?: string;
}

/**
 * Badge configuration for each aggregate threshold level
 */
const BADGE_CONFIG: Record<
  AggBadgeType,
  {
    label: string;
    shortLabel: string;
    icon: typeof AlertTriangle;
    className: string;
    description: string;
  }
> = {
  none: {
    label: "Normal",
    shortLabel: "-",
    icon: Minus,
    className:
      "bg-muted/50 text-muted-foreground border-muted hover:bg-muted/70",
    description: "Daily aggregate below watchlist threshold",
  },
  agg_watchlist: {
    label: "Watchlist",
    shortLabel: "Watch",
    icon: Eye,
    className:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/50",
    description: "Daily aggregate at or above watchlist floor",
  },
  agg_ctr_near: {
    label: "CTR Near",
    shortLabel: "Near",
    icon: FileWarning,
    className:
      "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800 hover:bg-orange-200 dark:hover:bg-orange-900/50",
    description: "Daily aggregate approaching CTR threshold",
  },
  agg_ctr_met: {
    label: "CTR REQUIRED",
    shortLabel: "CTR!",
    icon: ShieldAlert,
    className:
      "bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-600 hover:bg-red-700 dark:hover:bg-red-600 font-bold animate-pulse",
    description:
      "COMPLIANCE: Daily aggregate exceeds $10,000 - CTR filing required",
  },
};

/**
 * Aggregate Badge Component (Tier 2 - COMPLIANCE)
 *
 * This badge is the authoritative compliance indicator.
 * When agg_ctr_met is shown, CTR filing is REQUIRED.
 *
 * @example
 * // Simple usage
 * <AggBadge badge="agg_ctr_met" />
 *
 * @example
 * // With direction context
 * <AggBadge badge="agg_ctr_met" direction="in" showLabel />
 *
 * @example
 * // Compact size for tables
 * <AggBadge badge="agg_ctr_near" size="sm" />
 */
export function AggBadge({
  badge,
  direction,
  showLabel = false,
  size = "default",
  className,
}: AggBadgeProps) {
  const config = BADGE_CONFIG[badge];
  const Icon = config.icon;

  // For "none" badge without label, just render empty for cleaner tables
  if (badge === "none" && !showLabel) {
    return null;
  }

  const directionSuffix = direction
    ? direction === "in"
      ? " (In)"
      : " (Out)"
    : "";

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 transition-colors",
        size === "sm" && "px-1.5 py-0 text-[10px]",
        config.className,
        className,
      )}
      title={config.description}
    >
      <Icon
        className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")}
      />
      {showLabel && (
        <span>
          {size === "sm" ? config.shortLabel : config.label}
          {showLabel && direction && size !== "sm" && directionSuffix}
        </span>
      )}
    </Badge>
  );
}

/**
 * Render both in/out aggregate badges together
 * Common pattern for Gaming Day Summary rows
 */
export interface AggBadgePairProps {
  badgeIn: AggBadgeType;
  badgeOut: AggBadgeType;
  size?: "default" | "sm";
  className?: string;
}

export function AggBadgePair({
  badgeIn,
  badgeOut,
  size = "default",
  className,
}: AggBadgePairProps) {
  const showIn = badgeIn !== "none";
  const showOut = badgeOut !== "none";

  // If both are "none", show nothing
  if (!showIn && !showOut) {
    return null;
  }

  return (
    <div className={cn("flex gap-1", className)}>
      {showIn && (
        <AggBadge badge={badgeIn} direction="in" size={size} showLabel />
      )}
      {showOut && (
        <AggBadge badge={badgeOut} direction="out" size={size} showLabel />
      )}
    </div>
  );
}

/**
 * Get the badge configuration for a given badge type.
 * Useful for custom rendering or tooltips.
 */
export function getAggBadgeConfig(badge: AggBadgeType) {
  return BADGE_CONFIG[badge];
}

export { type AggBadgeType };
