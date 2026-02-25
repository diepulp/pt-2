'use client';

import { RefreshCwIcon } from 'lucide-react';
import React, { lazy, Suspense, useMemo, useState } from 'react';

import { PanelErrorBoundary } from '@/components/error-boundary';
import { CheckpointButton } from '@/components/shift-dashboard/checkpoint-button';
import { DeltaBadge } from '@/components/shift-dashboard/delta-badge';
import { TimeWindowSelector } from '@/components/shift-dashboard/time-window-selector';
import { AlertsStrip } from '@/components/shift-dashboard-v3/center/alerts-strip';
import { MetricsTable } from '@/components/shift-dashboard-v3/center/metrics-table';
import { FloorActivityRadar } from '@/components/shift-dashboard-v3/charts';
import {
  ShiftDashboardLayout,
  ShiftDashboardHeader,
  ShiftLeftRail,
  ShiftCenterPanel,
  ShiftRightRail,
} from '@/components/shift-dashboard-v3/layout';
import {
  HeroWinLossCompact,
  SecondaryKpiStack,
  QualitySummaryCard,
} from '@/components/shift-dashboard-v3/left-rail';
import {
  TelemetryRailPanel,
  QualityDetailCard,
  RailCollapseToggle,
  CollapsedIconStrip,
} from '@/components/shift-dashboard-v3/right-rail';
import { CoverageBar } from '@/components/shift-dashboard-v3/trust';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useActiveVisitorsSummary,
  useCashObsSummary,
  useShiftDashboardSummary,
  type ShiftTimeWindow,
} from '@/hooks/shift-dashboard';
import { cn } from '@/lib/utils';

// Code-split Recharts (WS2: ~200KB deferred until chart panel visible)
const WinLossTrendChart = lazy(() =>
  import('@/components/shift-dashboard-v3/charts/win-loss-trend-chart').then(
    (mod) => ({ default: mod.WinLossTrendChart }),
  ),
);

// React.memo wrappers for heavy child components (WS2: P1-1)
// Justified: orchestrator has 3 independent query hooks causing 5-9 full
// tree re-renders on cold mount. Each child receives a stable subset of
// props; memo prevents the cascade.
const MemoAlertsStrip = React.memo(AlertsStrip);
const MemoMetricsTable = React.memo(MetricsTable);
const MemoTelemetryRailPanel = React.memo(TelemetryRailPanel);

function ChartSkeleton() {
  return (
    <Card className="p-6">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-4 h-[250px] w-full" />
    </Card>
  );
}

function getDefaultWindow(): ShiftTimeWindow {
  const now = new Date();
  const start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: now.toISOString(),
  };
}

function getTimeSinceUpdate(updatedAt: number): string {
  if (!updatedAt) return '';
  const seconds = Math.floor((Date.now() - updatedAt) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export function ShiftDashboardV3() {
  const [timeWindow, setTimeWindow] =
    useState<ShiftTimeWindow>(getDefaultWindow);

  // === Data Queries ===
  const {
    data: summary,
    isLoading: metricsLoading,
    error: metricsError,
    dataUpdatedAt: metricsUpdatedAt,
  } = useShiftDashboardSummary({ window: timeWindow });

  const {
    data: cashObs,
    isLoading: cashObsLoading,
    error: cashObsError,
  } = useCashObsSummary({ window: timeWindow });

  const {
    data: visitorsSummary,
    isLoading: visitorsLoading,
    error: visitorsError,
  } = useActiveVisitorsSummary();

  const isLoading = metricsLoading || cashObsLoading || visitorsLoading;

  // Memoize quality counts — reduces on each query re-render
  const qualityCounts = useMemo(
    () => computeQualityCounts(summary?.tables),
    [summary?.tables],
  );

  // Throw errors to PanelErrorBoundary when queries fail fatally
  if (metricsError && cashObsError && visitorsError) {
    throw metricsError;
  }

  return (
    <ShiftDashboardLayout>
      {/* === Sticky Header === */}
      <ShiftDashboardHeader>
        <div className="flex items-center justify-between px-6 py-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Shift Dashboard
            </h1>
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground"
              aria-live="polite"
            >
              <span>Operational metrics</span>
              {metricsUpdatedAt > 0 && (
                <>
                  <span>·</span>
                  <span
                    className={cn(
                      'flex items-center gap-1',
                      isLoading && 'animate-pulse',
                    )}
                  >
                    {isLoading && (
                      <RefreshCwIcon className="h-3 w-3 animate-spin" />
                    )}
                    {getTimeSinceUpdate(metricsUpdatedAt)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DeltaBadge />
            <CheckpointButton />
            <TimeWindowSelector value={timeWindow} onChange={setTimeWindow} />
          </div>
        </div>
        {/* Coverage bar */}
        {summary?.casino && (
          <div className="px-6 pb-2">
            <CoverageBar
              ratio={summary.casino.snapshot_coverage_ratio}
              tier={summary.casino.coverage_tier}
              tablesWithOpening={summary.casino.tables_with_opening_snapshot}
              tablesWithClosing={summary.casino.tables_with_closing_snapshot}
              totalTables={summary.casino.tables_count}
              size="sm"
            />
          </div>
        )}
      </ShiftDashboardHeader>

      {/* === Three-Panel Body === */}
      <div className="flex">
        {/* Left Rail */}
        <ShiftLeftRail>
          <PanelErrorBoundary panelName="Summary">
            <div className="space-y-3 p-4" aria-live="polite">
              <HeroWinLossCompact
                winLossCents={summary?.casino?.win_loss_estimated_total_cents}
                metricGrade={summary?.casino?.provenance?.grade}
                isLoading={metricsLoading}
              />
              <SecondaryKpiStack
                data={summary?.casino}
                isLoading={metricsLoading}
              />
              <QualitySummaryCard
                goodCoverageCount={qualityCounts.good}
                lowCoverageCount={qualityCounts.low}
                noCoverageCount={qualityCounts.none}
                totalTables={summary?.casino?.tables_count ?? 0}
                isLoading={metricsLoading}
              />

              {/* Expansion slot for Phase 5 */}
              <div data-slot="theo-kpi" />
            </div>
          </PanelErrorBoundary>
        </ShiftLeftRail>

        {/* Center Panel */}
        <ShiftCenterPanel>
          <PanelErrorBoundary panelName="Charts & Metrics">
            {/* Charts row */}
            <div className="grid gap-6 lg:grid-cols-2">
              <FloorActivityRadar
                ratedCount={visitorsSummary?.rated_count ?? 0}
                unratedCount={visitorsSummary?.unrated_count ?? 0}
                ratedPercentage={visitorsSummary?.rated_percentage}
                isLoading={visitorsLoading}
              />
              <Suspense fallback={<ChartSkeleton />}>
                <WinLossTrendChart
                  pitsData={summary?.pits}
                  isLoading={metricsLoading}
                />
              </Suspense>
            </div>

            {/* Expansion slot for Phase 2 */}
            <div data-slot="utilization-timeline" />

            {/* Alerts */}
            <MemoAlertsStrip
              alerts={cashObs?.alerts}
              maxDisplay={3}
              isLoading={cashObsLoading}
            />

            {/* Metrics Table (drill-down) */}
            <MemoMetricsTable
              casinoData={summary?.casino}
              pitsData={summary?.pits}
              tablesData={summary?.tables}
              isLoading={metricsLoading}
            />

            {/* Expansion slot for Phase 3 */}
            <div data-slot="trending-charts" />
          </PanelErrorBoundary>
        </ShiftCenterPanel>

        {/* Right Rail */}
        <ShiftRightRail collapsedContent={<CollapsedIconStrip />}>
          <PanelErrorBoundary panelName="Telemetry">
            <div className="space-y-3 p-3">
              <div className="flex items-center justify-end">
                <RailCollapseToggle />
              </div>
              <MemoTelemetryRailPanel
                casinoData={cashObs?.casino}
                pitsData={cashObs?.pits}
                tablesData={cashObs?.tables}
                isLoading={cashObsLoading}
              />
              <QualityDetailCard
                goodCount={qualityCounts.good}
                lowCount={qualityCounts.low}
                noneCount={qualityCounts.none}
                isLoading={metricsLoading}
              />

              {/* Expansion slot for Phase 5 */}
              <div data-slot="theo-sidebar" />
            </div>
          </PanelErrorBoundary>
        </ShiftRightRail>
      </div>
    </ShiftDashboardLayout>
  );
}

function computeQualityCounts(
  tables:
    | Array<{ telemetry_quality: 'GOOD_COVERAGE' | 'LOW_COVERAGE' | 'NONE' }>
    | undefined,
) {
  if (!tables) return { good: 0, low: 0, none: 0 };
  return tables.reduce(
    (acc, t) => {
      if (t.telemetry_quality === 'GOOD_COVERAGE') acc.good++;
      else if (t.telemetry_quality === 'LOW_COVERAGE') acc.low++;
      else acc.none++;
      return acc;
    },
    { good: 0, low: 0, none: 0 },
  );
}
