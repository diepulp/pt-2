'use client';

import { RefreshCwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { TimeWindowSelector } from '@/components/shift-dashboard/time-window-selector';
import { AlertsStrip } from '@/components/shift-dashboard-v3/center/alerts-strip';
import { MetricsTable } from '@/components/shift-dashboard-v3/center/metrics-table';
import {
  FloorActivityRadar,
  WinLossTrendChart,
} from '@/components/shift-dashboard-v3/charts';
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
import {
  useActiveVisitorsSummary,
  useCashObsSummary,
  useShiftDashboardSummary,
  type ShiftTimeWindow,
} from '@/hooks/shift-dashboard';
import { cn } from '@/lib/utils';

function getDefaultWindow(): ShiftTimeWindow {
  const now = new Date();
  const start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: now.toISOString(),
  };
}

function getTimeSinceUpdate(lastUpdate: Date | null): string {
  if (!lastUpdate) return '';
  const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export function ShiftDashboardV3() {
  const [timeWindow, setTimeWindow] = useState<ShiftTimeWindow | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Initialize window on client mount to avoid SSR/client Date mismatch
  useEffect(() => {
    if (!timeWindow) {
      setTimeWindow(getDefaultWindow());
    }
  }, [timeWindow]);

  const stableWindow = timeWindow ?? { start: '', end: '' };

  // === Data Queries (identical to v2) ===
  const {
    data: summary,
    isLoading: metricsLoading,
    dataUpdatedAt: metricsUpdatedAt,
  } = useShiftDashboardSummary({ window: stableWindow });

  const { data: cashObs, isLoading: cashObsLoading } = useCashObsSummary({
    window: stableWindow,
  });

  const { data: visitorsSummary, isLoading: visitorsLoading } =
    useActiveVisitorsSummary();

  useEffect(() => {
    if (metricsUpdatedAt) {
      setLastUpdate(new Date(metricsUpdatedAt));
    }
  }, [metricsUpdatedAt]);

  const isLoading = metricsLoading || cashObsLoading || visitorsLoading;

  // Compute quality counts from table data
  const qualityCounts = computeQualityCounts(summary?.tables);

  return (
    <ShiftDashboardLayout>
      {/* === Sticky Header === */}
      <ShiftDashboardHeader>
        <div className="flex items-center justify-between px-6 py-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Shift Dashboard
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Operational metrics</span>
              {lastUpdate && (
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
                    {getTimeSinceUpdate(lastUpdate)}
                  </span>
                </>
              )}
            </div>
          </div>
          {timeWindow && (
            <TimeWindowSelector value={timeWindow} onChange={setTimeWindow} />
          )}
        </div>
        {/* Coverage bar (WS6: trust integration) */}
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
          <div className="space-y-3 p-4">
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
        </ShiftLeftRail>

        {/* Center Panel */}
        <ShiftCenterPanel>
          {/* Charts row */}
          <div className="grid gap-6 lg:grid-cols-2">
            <FloorActivityRadar
              ratedCount={visitorsSummary?.rated_count ?? 0}
              unratedCount={visitorsSummary?.unrated_count ?? 0}
              ratedPercentage={visitorsSummary?.rated_percentage}
              isLoading={visitorsLoading}
            />
            <WinLossTrendChart
              pitsData={summary?.pits}
              isLoading={metricsLoading}
            />
          </div>

          {/* Expansion slot for Phase 2 */}
          <div data-slot="utilization-timeline" />

          {/* Alerts */}
          <AlertsStrip
            alerts={cashObs?.alerts}
            maxDisplay={3}
            isLoading={cashObsLoading}
          />

          {/* Metrics Table (drill-down) */}
          <MetricsTable
            casinoData={summary?.casino}
            pitsData={summary?.pits}
            tablesData={summary?.tables}
            isLoading={metricsLoading}
          />

          {/* Expansion slot for Phase 3 */}
          <div data-slot="trending-charts" />
        </ShiftCenterPanel>

        {/* Right Rail */}
        <ShiftRightRail collapsedContent={<CollapsedIconStrip />}>
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-end">
              <RailCollapseToggle />
            </div>
            <TelemetryRailPanel
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
