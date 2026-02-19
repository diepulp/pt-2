/**
 * Shift Dashboard Page
 *
 * Main page composition for the shift dashboard.
 * Combines all dashboard components with time window control.
 *
 * @see ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md
 * @see PRD-Shift-Dashboards-v0.2
 */

'use client';

import { useEffect } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCashObsSummary,
  useShiftDashboardSummary,
  type ShiftTimeWindow,
} from '@/hooks/shift-dashboard';
import { useShiftDashboardUI } from '@/hooks/ui/use-shift-dashboard-ui';

import { AlertsPanel } from './alerts-panel';
import { CashObservationsPanel } from './cash-observations-panel';
import { CasinoSummaryCard } from './casino-summary-card';
import { PitMetricsTable } from './pit-metrics-table';
import { TableMetricsTable } from './table-metrics-table';
import { TimeWindowSelector } from './time-window-selector';

export interface ShiftDashboardPageProps {
  /**
   * Initial time window. Defaults to last 8 hours.
   */
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

export function ShiftDashboardPage({ initialWindow }: ShiftDashboardPageProps) {
  // Zustand store for UI state
  const {
    timeWindow,
    setTimeWindow,
    lens,
    setLens,
    selectedPitId,
    drillDownToPit,
    resetNavigation,
  } = useShiftDashboardUI();

  // Initialize window on client mount to avoid SSR/client Date mismatch
  useEffect(() => {
    if (!timeWindow) {
      setTimeWindow(initialWindow ?? getDefaultWindow());
    }
  }, [timeWindow, initialWindow, setTimeWindow]);

  // === Authoritative Metrics Queries ===
  // Pass a stable empty window during SSR to avoid conditional hook calls
  const stableWindow = timeWindow ?? { start: '', end: '' };

  // PERF: Single BFF call replaces 3 separate metrics queries
  // @see SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md
  const { data: summary, isLoading: metricsLoading } = useShiftDashboardSummary(
    {
      window: stableWindow,
    },
  );

  // === Telemetry Queries ===
  // PERF-001: Single BFF call replaces 4 separate cash obs queries
  // @see SHIFT_DASHBOARD_HTTP_CASCADE.md
  const { data: cashObs, isLoading: cashObsLoading } = useCashObsSummary({
    window: stableWindow,
  });

  // ADR-035 INV-035-3: Validate selectedPitId against loaded data
  useEffect(() => {
    if (summary?.pits && selectedPitId) {
      const pitExists = summary.pits.some((p) => p.pit_id === selectedPitId);
      if (!pitExists) {
        resetNavigation();
      }
    }
  }, [summary?.pits, selectedPitId, resetNavigation]);

  // Handle pit selection for drill-down (compound action)
  const handlePitSelect = (pitId: string) => {
    drillDownToPit(pitId);
  };

  // Handle lens change
  const handleLensChange = (value: string) => {
    const newLens = value as 'casino' | 'pit' | 'table';
    setLens(newLens);
    if (newLens === 'casino') {
      resetNavigation();
    }
  };

  // Show loading skeleton until window is initialized (avoids hydration mismatch)
  if (!timeWindow) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Shift Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Operational metrics and telemetry for the current shift window
            </p>
          </div>
          <div className="h-10 w-[400px] animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 h-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with time window selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Shift Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Operational metrics and telemetry for the current shift window
          </p>
        </div>
        <TimeWindowSelector value={timeWindow} onChange={setTimeWindow} />
      </div>

      {/* Casino summary KPIs */}
      <CasinoSummaryCard data={summary?.casino} isLoading={metricsLoading} />

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Metrics tables (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Lens navigation tabs */}
          <Tabs value={lens} onValueChange={handleLensChange}>
            <TabsList>
              <TabsTrigger value="casino">Casino</TabsTrigger>
              <TabsTrigger value="pit">By Pit</TabsTrigger>
              <TabsTrigger value="table">By Table</TabsTrigger>
            </TabsList>

            <TabsContent value="casino" className="mt-4">
              {/* Casino view shows pit summary and table metrics */}
              <div className="space-y-6">
                <PitMetricsTable
                  data={summary?.pits}
                  isLoading={metricsLoading}
                  onPitSelect={handlePitSelect}
                />
              </div>
            </TabsContent>

            <TabsContent value="pit" className="mt-4">
              <PitMetricsTable
                data={summary?.pits}
                isLoading={metricsLoading}
                onPitSelect={handlePitSelect}
              />
            </TabsContent>

            <TabsContent value="table" className="mt-4">
              <TableMetricsTable
                data={summary?.tables}
                isLoading={metricsLoading}
                pitFilter={selectedPitId ?? undefined}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right column: Telemetry panels (1 col) */}
        <div className="space-y-6">
          {/* Alerts panel */}
          <AlertsPanel data={cashObs?.alerts} isLoading={cashObsLoading} />

          {/* Cash observations panel - matches current lens */}
          {/* PERF-001: Now uses consolidated BFF data */}
          <CashObservationsPanel
            casinoData={cashObs?.casino}
            pitsData={cashObs?.pits}
            tablesData={cashObs?.tables}
            isLoading={cashObsLoading}
            view={lens}
          />
        </div>
      </div>
    </div>
  );
}
