'use client';

import { Calendar, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useGamingDay } from '@/hooks/casino';

/**
 * Displays the current gaming day for the authenticated user's casino.
 * Uses compute_gaming_day RPC to ensure temporal consistency per TEMP-001.
 *
 * @see hooks/casino/use-gaming-day.ts
 * @see app/api/v1/casino/gaming-day/route.ts
 */
export function GamingDayIndicator() {
  const { data: gamingDayData, isLoading, isError } = useGamingDay();

  // Loading state: show skeleton indicator
  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1.5 font-mono text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading...</span>
      </Badge>
    );
  }

  // Error state: fallback to client date with warning style
  if (isError || !gamingDayData) {
    const fallbackDate = new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    return (
      <Badge
        variant="outline"
        className="gap-1.5 font-mono text-xs border-yellow-500/50 text-yellow-600"
        title="Using local date - server gaming day unavailable"
      >
        <Calendar className="h-3 w-3" />
        <span>{fallbackDate}</span>
      </Badge>
    );
  }

  // Success: format gaming day from server response
  const gamingDayFormatted = new Date(
    gamingDayData.gaming_day + 'T00:00:00',
  ).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Badge
      variant="outline"
      className="gap-1.5 font-mono text-xs"
      title={`Gaming Day: ${gamingDayData.gaming_day} (${gamingDayData.timezone})`}
    >
      <Calendar className="h-3 w-3" />
      <span>{gamingDayFormatted}</span>
    </Badge>
  );
}
