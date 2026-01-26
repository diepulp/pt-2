/**
 * Rewards History Item Component
 *
 * Single item in the rewards history list.
 *
 * @see PRD-023 Player 360 Panels v0
 */

"use client";

import { formatDistanceToNow } from "date-fns";
import { Gift, Ticket, DollarSign, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RewardHistoryItemDTO } from "@/services/player360-dashboard/dtos";

// === Props ===

export interface RewardsHistoryItemProps {
  /** Reward item data */
  item: RewardHistoryItemDTO;
  /** Click handler to scroll to timeline event */
  onClick?: () => void;
  /** Additional class names */
  className?: string;
}

// === Type Config ===

const typeConfig = {
  matchplay: {
    icon: Ticket,
    label: "Match Play",
    color: "text-purple-400",
  },
  freeplay: {
    icon: DollarSign,
    label: "Free Play",
    color: "text-emerald-400",
  },
  comp: {
    icon: Star,
    label: "Comp",
    color: "text-amber-400",
  },
  other: {
    icon: Gift,
    label: "Reward",
    color: "text-blue-400",
  },
};

// === Component ===

/**
 * Single reward history item.
 *
 * @example
 * ```tsx
 * <RewardsHistoryItem
 *   item={rewardItem}
 *   onClick={() => scrollToEvent(rewardItem.id)}
 * />
 * ```
 */
export function RewardsHistoryItem({
  item,
  onClick,
  className,
}: RewardsHistoryItemProps) {
  const config = typeConfig[item.rewardType] ?? typeConfig.other;
  const TypeIcon = config.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-2 py-1.5 rounded text-left",
        "hover:bg-muted/50 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      data-testid={`rewards-history-item-${item.id}`}
    >
      {/* Icon */}
      <TypeIcon className={cn("h-3.5 w-3.5 shrink-0", config.color)} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium truncate">{config.label}</span>
          <span className="text-xs text-muted-foreground">
            {item.amount > 0 ? `$${item.amount}` : ""}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground/60">
          {formatDistanceToNow(new Date(item.issuedAt), { addSuffix: true })}
          {item.issuedBy.name && ` • ${item.issuedBy.name}`}
        </div>
      </div>
    </button>
  );
}
