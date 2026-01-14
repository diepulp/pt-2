/**
 * Shift Dashboard Page
 *
 * Main page composition for the shift dashboard.
 * Combines all dashboard components with time window control.
 *
 * @see ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md
 * @see PRD-Shift-Dashboards-v0.2
 */

"use client";

import { useEffect } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCashObsCasino,
  useCashObsPits,
  useCashObsTables,
  useShiftAlerts,
  useShiftCasinoMetrics,
  useShiftPitMetrics,
  useShiftTableMetrics,
  type ShiftTimeWindow,
} from "@/hooks/shift-dashboard";
import { useShiftDashboardUI } from "@/hooks/ui/use-shift-dashboard-ui";

import { AlertsPanel } from "./alerts-panel";
import { CashObservationsPanel } from "./cash-observations-panel";
import { CasinoSummaryCard } from "./casino-summary-card";
import { PitMetricsTable } from "./pit-metrics-table";
import { TableMetricsTable } from "./table-metrics-table";
import { TimeWindowSelector } from "./time-window-selector";

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
  const stableWindow = timeWindow ?? { start: "", end: "" };
  const casinoMetrics = useShiftCasinoMetrics({ window: stableWindow });
  const pitMetrics = useShiftPitMetrics({ window: stableWindow });
  const tableMetrics = useShiftTableMetrics({ window: stableWindow });

  // === Telemetry Queries ===
  const cashObsCasino = useCashObsCasino({ window: stableWindow });
  const cashObsPits = useCashObsPits({ window: stableWindow });
  const cashObsTables = useCashObsTables({ window: stableWindow });
  const alerts = useShiftAlerts({ window: stableWindow });

  // Handle pit selection for drill-down (compound action)
  const handlePitSelect = (pitId: string) => {
    drillDownToPit(pitId);
  };

  // Handle lens change
  const handleLensChange = (value: string) => {
    const newLens = value as "casino" | "pit" | "table";
    setLens(newLens);
    if (newLens === "casino") {
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
      <CasinoSummaryCard
        data={casinoMetrics.data}
        isLoading={casinoMetrics.isLoading}
      />

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
                  data={pitMetrics.data}
                  isLoading={pitMetrics.isLoading}
                  onPitSelect={handlePitSelect}
                />
              </div>
            </TabsContent>

            <TabsContent value="pit" className="mt-4">
              <PitMetricsTable
                data={pitMetrics.data}
                isLoading={pitMetrics.isLoading}
                onPitSelect={handlePitSelect}
              />
            </TabsContent>

            <TabsContent value="table" className="mt-4">
              <TableMetricsTable
                data={tableMetrics.data}
                isLoading={tableMetrics.isLoading}
                pitFilter={selectedPitId ?? undefined}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right column: Telemetry panels (1 col) */}
        <div className="space-y-6">
          {/* Alerts panel */}
          <AlertsPanel data={alerts.data} isLoading={alerts.isLoading} />

          {/* Cash observations panel - matches current lens */}
          <CashObservationsPanel
            casinoData={cashObsCasino.data}
            pitsData={cashObsPits.data}
            tablesData={cashObsTables.data}
            isLoading={
              cashObsCasino.isLoading ||
              cashObsPits.isLoading ||
              cashObsTables.isLoading
            }
            view={lens}
          />
        </div>
      </div>
    </div>
  );
}
