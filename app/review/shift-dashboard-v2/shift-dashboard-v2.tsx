/**
 * Shift Dashboard V2
 *
 * Redesigned shift dashboard applying Nielsen's 10 Usability Heuristics.
 * Features visual hierarchy, progressive disclosure, and actionable alerts.
 *
 * @see IMPLEMENTATION_STRATEGY.md
 */

'use client';

import { RefreshCwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { TimeWindowSelector } from '@/components/shift-dashboard/time-window-selector';
import {
  useActiveVisitorsSummary,
  useCashObsSummary,
  useShiftDashboardSummary,
  type ShiftTimeWindow,
} from '@/hooks/shift-dashboard';
import { cn } from '@/lib/utils';

import { AlertsStrip } from './components/alerts-strip';
import { FloorActivityDonut } from './components/floor-activity-donut';
import { HeroWinLossCard } from './components/hero-win-loss-card';
import { MetricsTable } from './components/metrics-table';
import { SecondaryKpisRow } from './components/secondary-kpis-row';
import { TelemetryDrawer } from './components/telemetry-drawer';

export interface ShiftDashboardV2Props {
  /** Initial time window (defaults to last 8 hours) */
  initialWindow?: ShiftTimeWindow;
}

/**
 * Get default time window (last 8 hours).
 */
function getDefaultWindow(): ShiftTimeWindow {
  const now = new Date();
  const start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: now.toISOString(),
  };
}

/**
 * Calculate time since last update.
 */
function getTimeSinceUpdate(lastUpdate: Date | null): string {
  if (!lastUpdate) return '';
  const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export function ShiftDashboardV2({ initialWindow }: ShiftDashboardV2Props) {
  // Time window state
  const [timeWindow, setTimeWindow] = useState<ShiftTimeWindow | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Initialize window on client mount to avoid SSR/client Date mismatch
  useEffect(() => {
    if (!timeWindow) {
      setTimeWindow(initialWindow ?? getDefaultWindow());
    }
  }, [timeWindow, initialWindow]);

  // Stable window for queries (avoid conditional hooks)
  const stableWindow = timeWindow ?? { start: '', end: '' };

  // === Data Queries ===
  // BFF hooks for optimized data fetching
  const {
    data: summary,
    isLoading: metricsLoading,
    dataUpdatedAt: metricsUpdatedAt,
  } = useShiftDashboardSummary({
    window: stableWindow,
  });

  const { data: cashObs, isLoading: cashObsLoading } = useCashObsSummary({
    window: stableWindow,
  });

  // Active visitors summary for Floor Activity Donut
  const { data: visitorsSummary, isLoading: visitorsLoading } =
    useActiveVisitorsSummary();

  // Track last update time
  useEffect(() => {
    if (metricsUpdatedAt) {
      setLastUpdate(new Date(metricsUpdatedAt));
    }
  }, [metricsUpdatedAt]);

  // Loading skeleton during window initialization
  if (!timeWindow) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Shift Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Operational metrics • Loading...
            </p>
          </div>
          <div className="h-10 w-[400px] animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 h-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  const isLoading = metricsLoading || cashObsLoading || visitorsLoading;

  return (
    <div className="space-y-6">
      {/* === Header === */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Shift Dashboard
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Operational metrics</span>
            {lastUpdate && (
              <>
                <span>•</span>
                <span
                  className={cn(
                    'flex items-center gap-1',
                    isLoading && 'animate-pulse',
                  )}
                >
                  {isLoading && (
                    <RefreshCwIcon className="h-3 w-3 animate-spin" />
                  )}
                  Last updated {getTimeSinceUpdate(lastUpdate)}
                </span>
              </>
            )}
          </div>
        </div>
        <TimeWindowSelector value={timeWindow} onChange={setTimeWindow} />
      </div>

      {/* === Primary KPIs Row === */}
      {/* Heuristic #8: Visual hierarchy - Hero card gets most prominence */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Hero Win/Loss Card - 2 columns */}
        <div className="lg:col-span-2">
          <HeroWinLossCard
            winLossCents={summary?.casino?.win_loss_estimated_total_cents}
            inventoryWinLossCents={
              summary?.casino?.win_loss_inventory_total_cents
            }
            estimatedWinLossCents={
              summary?.casino?.win_loss_estimated_total_cents
            }
            isLoading={metricsLoading}
          />
        </div>

        {/* Floor Activity Donut - 1 column */}
        <div>
          <FloorActivityDonut
            ratedCount={visitorsSummary?.rated_count ?? 0}
            unratedCount={visitorsSummary?.unrated_count ?? 0}
            ratedPercentage={visitorsSummary?.rated_percentage ?? 0}
            isLoading={visitorsLoading}
          />
        </div>
      </div>

      {/* === Secondary KPIs Row === */}
      <SecondaryKpisRow data={summary?.casino} isLoading={metricsLoading} />

      {/* === Alerts Strip === */}
      {/* Heuristic #9: Help users recognize errors with actionable alerts */}
      <AlertsStrip
        alerts={cashObs?.alerts}
        maxDisplay={2}
        isLoading={cashObsLoading}
      />

      {/* === Main Content Grid === */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Metrics Table - 2 columns */}
        <div className="lg:col-span-2">
          <MetricsTable
            casinoData={summary?.casino}
            pitsData={summary?.pits}
            tablesData={summary?.tables}
            isLoading={metricsLoading}
          />
        </div>

        {/* Telemetry Drawer - 1 column */}
        {/* Heuristic #3: Progressive disclosure for advanced data */}
        <div>
          <TelemetryDrawer
            casinoData={cashObs?.casino}
            pitsData={cashObs?.pits}
            tablesData={cashObs?.tables}
            isLoading={cashObsLoading}
          />
        </div>
      </div>
    </div>
  );
}
