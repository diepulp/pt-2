/**
 * Hero Win/Loss Card
 *
 * Primary KPI component displaying the most important metric (Win/Loss)
 * with visual hierarchy per Nielsen's Heuristic #8 (Aesthetic & Minimalist Design).
 *
 * @see IMPLEMENTATION_STRATEGY.md §7.1
 */

'use client';

import { InfoIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { getWinLossColor } from '../lib/colors';
import { formatCents, formatCentsDelta } from '../lib/format';

export interface HeroWinLossCardProps {
  /** Primary win/loss value in cents (estimated with telemetry) */
  winLossCents: number | null | undefined;
  /** Inventory-based win/loss in cents */
  inventoryWinLossCents: number | null | undefined;
  /** Estimated win/loss with telemetry in cents */
  estimatedWinLossCents: number | null | undefined;
  /** Delta from prior shift in cents (future enhancement) */
  priorShiftDelta?: number | null;
  /** Loading state */
  isLoading?: boolean;
}

export function HeroWinLossCard({
  winLossCents,
  inventoryWinLossCents,
  estimatedWinLossCents,
  priorShiftDelta,
  isLoading,
}: HeroWinLossCardProps) {
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-4 w-4" />
        </div>
        <Skeleton className="mt-4 h-12 w-40" />
        <Skeleton className="mt-2 h-5 w-32" />
        <div className="mt-6 flex gap-6">
          <div>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-1 h-6 w-24" />
          </div>
          <div>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-1 h-6 w-24" />
          </div>
        </div>
      </Card>
    );
  }

  const primaryValue = winLossCents ?? estimatedWinLossCents ?? 0;
  const colorConfig = getWinLossColor(primaryValue);

  return (
    <Card className="relative overflow-hidden">
      {/* Colored top accent bar */}
      <div className={`absolute left-0 top-0 h-1 w-full ${colorConfig.bg}`} />

      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${colorConfig.bg}`} />
            <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Win/Loss
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
                  <strong>Win/Loss</strong> = Closing Bankroll - Opening
                  Bankroll + Credits - Fills
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Estimated includes telemetry-observed buy-ins and cash-outs.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Hero Value */}
        <p
          className={`mt-4 text-5xl font-semibold font-mono tabular-nums ${colorConfig.text}`}
        >
          {formatCents(primaryValue)}
        </p>

        {/* Trend indicator (future) */}
        {priorShiftDelta != null && (
          <div className="mt-2 flex items-center gap-1 text-sm">
            {priorShiftDelta >= 0 ? (
              <>
                <TrendingUpIcon className="h-4 w-4 text-emerald-500" />
                <span className="text-emerald-500">
                  {formatCentsDelta(priorShiftDelta)}
                </span>
              </>
            ) : (
              <>
                <TrendingDownIcon className="h-4 w-4 text-rose-500" />
                <span className="text-rose-500">
                  {formatCentsDelta(priorShiftDelta)}
                </span>
              </>
            )}
            <span className="text-muted-foreground">vs prior shift</span>
          </div>
        )}

        {/* Secondary metrics row */}
        <div className="mt-6 flex gap-8">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Inventory
            </p>
            <p className="mt-1 text-xl font-mono tabular-nums">
              {formatCents(inventoryWinLossCents)}
            </p>
            <p className="text-[10px] text-muted-foreground">(tray delta)</p>
          </div>

          <div className="border-l border-border pl-8">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Estimated
            </p>
            <p className="mt-1 text-xl font-mono tabular-nums">
              {formatCents(estimatedWinLossCents)}
            </p>
            <p className="text-[10px] text-muted-foreground">(+telemetry)</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
