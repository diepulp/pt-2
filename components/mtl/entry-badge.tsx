/**
 * MTL Entry Badge (Tier 1 - UX Convenience)
 *
 * Per-transaction threshold indication for UI display.
 * Visual indicator showing threshold proximity for individual transactions.
 *
 * Badge Levels:
 * - none: Below watchlist threshold
 * - watchlist_near: >= watchlist floor (default $3,000)
 * - ctr_near: Approaching CTR threshold (>= 80% of $10,000)
 * - ctr_met: Exceeds CTR threshold (> $10,000)
 *
 * IMPORTANT: This is NOT the compliance trigger.
 * See AggBadge for authoritative compliance determination.
 *
 * @see services/mtl/dtos.ts - EntryBadge type
 * @see PRD-005 Two-tier badge system
 */

"use client";

import { AlertTriangle, Eye, FileWarning, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EntryBadge as EntryBadgeType } from "@/services/mtl/dtos";

export interface EntryBadgeProps {
  badge: EntryBadgeType;
  /** Show text label alongside icon */
  showLabel?: boolean;
  /** Compact size for table cells */
  size?: "default" | "sm";
  className?: string;
}

/**
 * Badge configuration for each threshold level
 */
const BADGE_CONFIG: Record<
  EntryBadgeType,
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
    description: "Below watchlist threshold",
  },
  watchlist_near: {
    label: "Watchlist",
    shortLabel: "Watch",
    icon: Eye,
    className:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/50",
    description: "At or above watchlist floor ($3,000+)",
  },
  ctr_near: {
    label: "CTR Near",
    shortLabel: "Near",
    icon: FileWarning,
    className:
      "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800 hover:bg-orange-200 dark:hover:bg-orange-900/50",
    description: "Approaching CTR threshold (80%+ of $10,000)",
  },
  ctr_met: {
    label: "CTR Threshold Met",
    shortLabel: "CTR",
    icon: AlertTriangle,
    className:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800 hover:bg-red-200 dark:hover:bg-red-900/50 font-semibold",
    description: "Exceeds CTR reporting threshold (>$10,000)",
  },
};

/**
 * Entry Badge Component (Tier 1 - UX)
 *
 * @example
 * // Simple usage
 * <EntryBadge badge="ctr_met" />
 *
 * @example
 * // With label
 * <EntryBadge badge="watchlist_near" showLabel />
 *
 * @example
 * // Compact size for tables
 * <EntryBadge badge="ctr_near" size="sm" />
 */
export function EntryBadge({
  badge,
  showLabel = false,
  size = "default",
  className,
}: EntryBadgeProps) {
  const config = BADGE_CONFIG[badge];
  const Icon = config.icon;

  // For "none" badge without label, just render empty for cleaner tables
  if (badge === "none" && !showLabel) {
    return null;
  }

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
        <span>{size === "sm" ? config.shortLabel : config.label}</span>
      )}
    </Badge>
  );
}

/**
 * Get the badge configuration for a given badge type.
 * Useful for custom rendering or tooltips.
 */
export function getEntryBadgeConfig(badge: EntryBadgeType) {
  return BADGE_CONFIG[badge];
}

export { type EntryBadgeType };
