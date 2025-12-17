"use client";

import { cn } from "@/lib/utils";

interface ChipDenominationProps {
  value: number;
  className?: string;
}

/**
 * Casino chip-styled denomination badge
 * Distinctive circular design with edge pattern
 */
export function ChipDenomination({ value, className }: ChipDenominationProps) {
  // Color mapping for different denominations (casino standard)
  const colorMap: Record<number, { bg: string; border: string; text: string }> =
    {
      5: {
        bg: "bg-red-900/80",
        border: "border-red-500",
        text: "text-red-100",
      },
      25: {
        bg: "bg-emerald-900/80",
        border: "border-emerald-500",
        text: "text-emerald-100",
      },
      100: {
        bg: "bg-slate-800",
        border: "border-slate-400",
        text: "text-slate-100",
      },
      500: {
        bg: "bg-violet-900/80",
        border: "border-violet-500",
        text: "text-violet-100",
      },
      1000: {
        bg: "bg-amber-900/80",
        border: "border-amber-500",
        text: "text-amber-100",
      },
    };

  const colors = colorMap[value] || colorMap[100];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        "w-14 h-14 rounded-full",
        colors.bg,
        "border-2",
        colors.border,
        "shadow-lg shadow-black/30",
        // Inner ring pattern (casino chip edge style)
        "before:absolute before:inset-1 before:rounded-full before:border before:border-dashed before:border-white/20",
        // Outer glow on hover
        "transition-all duration-300",
        "hover:shadow-xl hover:scale-105",
        className,
      )}
    >
      <span className={cn("font-mono font-bold text-sm", colors.text)}>
        ${value}
      </span>
    </div>
  );
}
