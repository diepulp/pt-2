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

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTableCoverage } from '@/hooks/dashboard/use-table-coverage';
import { cn } from '@/lib/utils';

interface AnalyticsPanelProps {
  tableName: string;
  casinoId: string;
  selectedTableId?: string;
  gamingDay?: string | null;
}

/**
 * Format seconds into a human-readable duration string.
 */
function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Format ratio as percentage string.
 */
function formatPercent(ratio: number | null): string {
  if (ratio === null) return '0%';
  return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Color class for coverage tier badge.
 */
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

/**
 * Analytics Panel - Table performance metrics and insights
 *
 * Renders live coverage data from measurement_rating_coverage_v (MEAS-003)
 * and labels non-coverage mock metrics as Placeholder.
 *
 * @see PRD-048 WS3 — Coverage Data Wiring
 */
export function AnalyticsPanel({
  tableName,
  casinoId,
  selectedTableId,
  gamingDay,
}: AnalyticsPanelProps) {
  const { data: coverageData, isLoading: coverageLoading } = useTableCoverage(
    casinoId,
    gamingDay,
  );

  // Filter coverage for selected table
  const tableCoverage = selectedTableId
    ? coverageData?.find((c) => c.gaming_table_id === selectedTableId)
    : undefined;

  // Mock metrics data — labeled as Placeholder
  const metrics = [
    {
      label: 'Win/Loss',
      value: '+$12,450',
      change: '+8.2%',
      positive: true,
      icon: DollarSign,
    },
    {
      label: 'Handle',
      value: '$145,200',
      change: '+12.5%',
      positive: true,
      icon: BarChart3,
    },
    {
      label: 'Avg Session',
      value: '47 min',
      change: '-5.1%',
      positive: false,
      icon: Clock,
    },
    {
      label: 'Active Players',
      value: '6',
      change: '0%',
      positive: true,
      icon: Users,
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

        {/* Placeholder Metrics Grid */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Table Metrics
            </span>
            <Badge
              variant="outline"
              className="text-[10px] ml-auto text-muted-foreground"
            >
              Placeholder
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div
                  key={metric.label}
                  className={cn(
                    'relative overflow-hidden p-4 rounded-lg',
                    'border border-border/40 bg-card/50',
                    'backdrop-blur-sm opacity-60',
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
                    <div
                      className={cn(
                        'px-2 py-0.5 rounded text-xs font-mono',
                        metric.positive
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-amber-500/10 text-amber-400',
                      )}
                    >
                      {metric.change}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity Graph Placeholder */}
        <div className="relative overflow-hidden rounded-lg border border-border/40 bg-card/50 p-4 opacity-60">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Hourly Activity
            </span>
            <Badge
              variant="outline"
              className="text-[10px] ml-auto text-muted-foreground"
            >
              Placeholder
            </Badge>
          </div>

          {/* Mock bar chart */}
          <div className="flex items-end gap-2 h-32">
            {[35, 55, 75, 45, 85, 65, 90, 70, 50, 80, 60, 40].map(
              (height, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-accent/20 to-accent/60 transition-all hover:from-accent/30 hover:to-accent/80"
                  style={{ height: `${height}%` }}
                />
              ),
            )}
          </div>

          {/* Time labels */}
          <div className="flex justify-between mt-2 text-xs text-muted-foreground font-mono">
            <span>6AM</span>
            <span>9AM</span>
            <span>12PM</span>
            <span>3PM</span>
          </div>

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

        {/* Session Breakdown Placeholder */}
        <div className="rounded-lg border border-border/40 bg-card/50 p-4 opacity-60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Session Breakdown
            </h3>
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
            >
              Placeholder
            </Badge>
          </div>
          <div className="space-y-3">
            {[
              {
                label: 'High Rollers',
                count: 2,
                value: '$8,200',
                color: 'bg-violet-500',
              },
              {
                label: 'Regular Players',
                count: 3,
                value: '$3,150',
                color: 'bg-cyan-500',
              },
              {
                label: 'Casual Players',
                count: 1,
                value: '$1,100',
                color: 'bg-emerald-500',
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={cn('w-2 h-2 rounded-full', item.color)} />
                <span className="text-sm text-muted-foreground flex-1">
                  {item.label}
                </span>
                <span className="text-sm font-mono text-foreground">
                  {item.count}
                </span>
                <span className="text-sm font-mono text-accent">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
