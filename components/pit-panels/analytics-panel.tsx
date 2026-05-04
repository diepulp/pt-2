'use client';

import {
  TrendingUp,
  BarChart3,
  Clock,
  Users,
  DollarSign,
  Activity,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { useState } from 'react';

import { FinancialValue } from '@/components/financial';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTableCoverage } from '@/hooks/dashboard/use-table-coverage';
import {
  useTableSlipAnalytics,
  type HourlyBucket,
  type PlayerSegment,
} from '@/hooks/dashboard/use-table-slip-analytics';
import { useShiftTableMetrics } from '@/hooks/shift-dashboard/use-shift-table-metrics';
import { cn } from '@/lib/utils';
import type { ShiftTableMetricsDTO } from '@/services/table-context/shift-metrics/dtos';

interface AnalyticsPanelProps {
  tableName: string;
  casinoId: string;
  selectedTableId?: string;
  gamingDay?: string | null;
  /** Number of active (open + paused) slips at the selected table */
  activeSlipCount?: number;
}

// === Formatters ===

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatPercent(ratio: number | null): string {
  if (ratio === null) return '0%';
  return `${(ratio * 100).toFixed(1)}%`;
}

/** Format cents to dollar string with sign. */
function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '$0';
  const dollars = cents / 100;
  const abs = Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  if (dollars >= 0) return `+$${abs}`;
  return `-$${abs}`;
}

/** Format cents as unsigned dollar string. */
function formatCentsUnsigned(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '$0';
  const dollars = Math.abs(cents / 100);
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Format hour (0-23) to display label. */
function formatHour(hour: number): string {
  if (hour === 0) return '12AM';
  if (hour < 12) return `${hour}AM`;
  if (hour === 12) return '12PM';
  return `${hour - 12}PM`;
}

function tierColor(tier: string): string {
  switch (tier) {
    case 'HIGH':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'MEDIUM':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'LOW':
      return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    default:
      return 'bg-red-500/10 text-red-400 border-red-500/20';
  }
}

// === Shift Time Window ===

/** Build an 8-hour lookback window from current time (same pattern as shift dashboard v3). */
function getDefaultShiftWindow(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: now.toISOString() };
}

// === Component ===

/**
 * Analytics Panel - Table performance metrics and insights
 *
 * Live sections:
 * - Rating Coverage (MEAS-003) — useTableCoverage
 * - Table Metrics (Win/Loss, Handle, Avg Session, Active Players) — useShiftTableMetrics + coverage
 * - Hourly Activity chart — useTableSlipAnalytics
 * - Session Breakdown by player segment — useTableSlipAnalytics
 *
 * @see analytics-panel-pre-wiring-report.md
 * @see PRD-048 WS3 — Coverage Data Wiring
 */
export function AnalyticsPanel({
  tableName,
  casinoId,
  selectedTableId,
  gamingDay,
  activeSlipCount = 0,
}: AnalyticsPanelProps) {
  // === Data Hooks ===

  const { data: coverageData, isLoading: coverageLoading } = useTableCoverage(
    casinoId,
    gamingDay,
  );

  // Stable window reference — prevents TanStack Query key churn on every re-render.
  // Same pattern as ShiftDashboardV3 (useState lazy init).
  const [shiftWindow] = useState(getDefaultShiftWindow);
  const { data: shiftTables, isLoading: shiftLoading } = useShiftTableMetrics({
    window: shiftWindow,
    enabled: !!selectedTableId,
  });

  const { data: slipAnalytics, isLoading: slipAnalyticsLoading } =
    useTableSlipAnalytics(selectedTableId, gamingDay);

  // === Derived State ===

  const tableCoverage = selectedTableId
    ? coverageData?.find((c) => c.gaming_table_id === selectedTableId)
    : undefined;

  const tableMetrics: ShiftTableMetricsDTO | undefined = selectedTableId
    ? shiftTables?.find((t) => t.table_id === selectedTableId)
    : undefined;

  // Avg session: rated_seconds / slip_count from coverage data
  const avgSessionSeconds =
    tableCoverage && tableCoverage.slip_count && tableCoverage.slip_count > 0
      ? Math.round(
          (tableCoverage.rated_seconds ?? 0) / tableCoverage.slip_count,
        )
      : null;

  const metricsLoading = shiftLoading || coverageLoading;

  // Build metrics array from live data
  const metrics = [
    {
      label: 'Win/Loss',
      value: formatCents(tableMetrics?.win_loss_inventory_cents),
      icon: DollarSign,
      positive: (tableMetrics?.win_loss_inventory_cents ?? 0) >= 0,
      grade: tableMetrics?.metric_grade,
    },
    {
      label: 'Estimated Drop',
      value: (
        <FinancialValue
          variant="compact"
          label="Estimated Drop"
          value={{
            value: tableMetrics?.estimated_drop_buyins_cents ?? 0,
            type: 'estimated',
            source: 'shift_metrics',
            completeness: {
              status: tableMetrics == null ? 'unknown' : 'complete',
            },
          }}
        />
      ),
      icon: BarChart3,
      positive: true,
    },
    {
      label: 'Avg Session',
      value:
        avgSessionSeconds !== null ? formatDuration(avgSessionSeconds) : '--',
      icon: Clock,
      positive: true,
    },
    {
      label: 'Active Players',
      value: String(activeSlipCount),
      icon: Users,
      positive: activeSlipCount > 0,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
            <TrendingUp className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
            <p className="text-sm text-muted-foreground">
              {tableName} &bull; Today&apos;s Performance
            </p>
          </div>
        </div>
      </div>

      {/* Panel Content */}
      <div className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* Coverage Metrics (Live — MEAS-003) */}
        <div className="rounded-lg border border-border/40 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Rating Coverage
            </span>
            <Badge
              variant="outline"
              className="text-[10px] ml-auto border-accent/30 text-accent"
            >
              MEAS-003
            </Badge>
          </div>

          {coverageLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            </div>
          ) : tableCoverage ? (
            <div className="space-y-3">
              {/* Coverage Tier */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Coverage Tier
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    'font-mono text-xs',
                    tierColor(tableCoverage.coverage_tier),
                  )}
                >
                  {tableCoverage.coverage_tier}
                </Badge>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-border/30 bg-background/50">
                  <div className="text-xs text-muted-foreground mb-1">
                    Rated Ratio
                  </div>
                  <div className="font-mono text-lg font-bold text-foreground">
                    {formatPercent(tableCoverage.rated_ratio)}
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-border/30 bg-background/50">
                  <div className="text-xs text-muted-foreground mb-1">
                    Untracked
                  </div>
                  <div className="font-mono text-lg font-bold text-foreground">
                    {formatDuration(tableCoverage.untracked_seconds)}
                  </div>
                </div>
              </div>

              {/* Additional stats */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Slips: {tableCoverage.slip_count ?? 0}</span>
                <span>
                  Rated: {formatDuration(tableCoverage.rated_seconds)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>No coverage data for this table</span>
            </div>
          )}
        </div>

        {/* Table Metrics (Live — Shift Metrics + Coverage) */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Table Metrics
            </span>
            {tableMetrics?.metric_grade && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] ml-auto',
                  tableMetrics.metric_grade === 'AUTHORITATIVE'
                    ? 'border-emerald-500/30 text-emerald-400'
                    : 'border-amber-500/30 text-amber-400',
                )}
              >
                {tableMetrics.metric_grade}
              </Badge>
            )}
          </div>
          {metricsLoading ? (
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {metrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <div
                    key={metric.label}
                    className={cn(
                      'relative overflow-hidden p-4 rounded-lg',
                      'border border-border/40 bg-card/50',
                      'backdrop-blur-sm',
                    )}
                  >
                    {/* Accent strip */}
                    <div
                      className={cn(
                        'absolute top-0 left-0 right-0 h-0.5',
                        metric.positive
                          ? 'bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent'
                          : 'bg-gradient-to-r from-transparent via-amber-500/50 to-transparent',
                      )}
                    />

                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Icon className="h-4 w-4" />
                          <span className="text-xs uppercase tracking-wide">
                            {metric.label}
                          </span>
                        </div>
                        <div className="font-mono text-xl font-bold text-foreground">
                          {metric.value}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hourly Activity (Live — Slip Analytics) */}
        <HourlyActivityChart
          hourlyActivity={slipAnalytics?.hourlyActivity ?? []}
          isLoading={slipAnalyticsLoading}
        />

        {/* Session Breakdown (Live — Slip Analytics) */}
        <SessionBreakdown
          segments={slipAnalytics?.sessionBreakdown ?? []}
          isLoading={slipAnalyticsLoading}
        />
      </div>
    </div>
  );
}

// === Sub-Components ===

function HourlyActivityChart({
  hourlyActivity,
  isLoading,
}: {
  hourlyActivity: HourlyBucket[];
  isLoading: boolean;
}) {
  const maxCount = Math.max(1, ...hourlyActivity.map((b) => b.count));

  // Build 24-hour grid (sparse fill from data)
  const hours = Array.from({ length: 24 }, (_, i) => {
    const bucket = hourlyActivity.find((b) => b.hour === i);
    return { hour: i, count: bucket?.count ?? 0 };
  });

  // Only show hours in the active range (first with data - 1 to last with data + 1)
  const firstActive =
    hourlyActivity.length > 0 ? Math.max(0, hourlyActivity[0].hour - 1) : 6;
  const lastActive =
    hourlyActivity.length > 0
      ? Math.min(23, hourlyActivity[hourlyActivity.length - 1].hour + 1)
      : 17;
  const visibleHours = hours.slice(firstActive, lastActive + 1);

  // Label positions: first, middle, last
  const labelIndices = new Set([
    0,
    Math.floor(visibleHours.length / 2),
    visibleHours.length - 1,
  ]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/40 bg-card/50 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-accent" />
        <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Hourly Activity
        </span>
        {hourlyActivity.length > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] ml-auto border-accent/30 text-accent"
          >
            {hourlyActivity.reduce((s, b) => s + b.count, 0)} slips
          </Badge>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : hourlyActivity.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No closed slips yet today
        </div>
      ) : (
        <>
          <div className="flex items-end gap-1 h-32">
            {visibleHours.map((h) => {
              const pct = maxCount > 0 ? (h.count / maxCount) * 100 : 0;
              return (
                <div
                  key={h.hour}
                  className={cn(
                    'flex-1 rounded-t transition-all',
                    h.count > 0
                      ? 'bg-gradient-to-t from-accent/20 to-accent/60 hover:from-accent/30 hover:to-accent/80'
                      : 'bg-muted/20',
                  )}
                  style={{ height: `${Math.max(pct, 2)}%` }}
                  title={`${formatHour(h.hour)}: ${h.count} slip${h.count !== 1 ? 's' : ''}`}
                />
              );
            })}
          </div>

          <div className="flex justify-between mt-2 text-xs text-muted-foreground font-mono">
            {visibleHours.map((h, i) =>
              labelIndices.has(i) ? (
                <span key={h.hour}>{formatHour(h.hour)}</span>
              ) : (
                <span key={h.hour} />
              ),
            )}
          </div>
        </>
      )}

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
    </div>
  );
}

function SessionBreakdown({
  segments,
  isLoading,
}: {
  segments: PlayerSegment[];
  isLoading: boolean;
}) {
  const totalCount = segments.reduce((s, seg) => s + seg.count, 0);

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Session Breakdown
        </h3>
        {totalCount > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] border-accent/30 text-accent"
          >
            {totalCount} sessions
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : totalCount === 0 ? (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          No closed sessions yet today
        </div>
      ) : (
        <div className="space-y-3">
          {segments.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div className={cn('w-2 h-2 rounded-full', item.color)} />
              <span className="text-sm text-muted-foreground flex-1">
                {item.label}
              </span>
              <span className="text-sm font-mono text-foreground">
                {item.count}
              </span>
              <span className="text-sm font-mono text-accent">
                {formatCentsUnsigned(item.theoCents)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
