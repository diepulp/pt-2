/**
 * Casino Summary Card
 *
 * Casino-level KPI summary card for shift dashboard.
 * Displays aggregated metrics from all tables in the casino.
 *
 * @see ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md §3.1
 */

'use client';

import { ArrowRightIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCents } from '@/lib/format';
import type { ShiftCasinoMetricsDTO } from '@/services/table-context/shift-metrics/dtos';

export interface CasinoSummaryCardProps {
  data: ShiftCasinoMetricsDTO | undefined;
  isLoading?: boolean;
}

/**
 * KPI Card with colored left-border accent.
 */
function KpiCard({
  title,
  value,
  subtitle,
  accentColor,
  trend,
  isLoading,
  link,
}: {
  title: string;
  value: string;
  subtitle?: string;
  accentColor: string;
  trend?: { value: number; label: string };
  isLoading?: boolean;
  link?: { href: string; label: string };
}) {
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden">
        <div className={`absolute left-0 top-0 h-full w-1 ${accentColor}`} />
        <div className="p-6 pl-5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="mt-3 h-8 w-28" />
          <Skeleton className="mt-2 h-4 w-16" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden">
      {/* Colored left accent bar */}
      <div className={`absolute left-0 top-0 h-full w-1 ${accentColor}`} />

      <div className="p-6 pl-5">
        {/* Header: dot indicator + title */}
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-sm font-medium">{title}</span>
        </div>

        {/* Metric */}
        <p className="mt-3 text-2xl font-semibold font-mono tabular-nums">
          {value}
        </p>

        {/* Subtitle */}
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        )}

        {/* Trend line */}
        {trend && (
          <div className="mt-1 flex items-center gap-1 text-xs">
            {trend.value >= 0 ? (
              <>
                <TrendingUpIcon className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500">
                  {trend.value.toFixed(1)}%
                </span>
              </>
            ) : (
              <>
                <TrendingDownIcon className="h-3 w-3 text-red-500" />
                <span className="text-red-500">
                  {Math.abs(trend.value).toFixed(1)}%
                </span>
              </>
            )}
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        )}

        {/* Action link */}
        {link && (
          <Button variant="link" asChild className="mt-3 h-auto p-0 text-xs">
            <Link href={link.href}>
              {link.label} <ArrowRightIcon className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * Coverage badge based on tables with telemetry.
 */
function CoverageBadge({
  tablesWithTelemetry,
  totalTables,
}: {
  tablesWithTelemetry: number;
  totalTables: number;
}) {
  const coverage =
    totalTables > 0 ? (tablesWithTelemetry / totalTables) * 100 : 0;

  if (coverage >= 80) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 text-[10px]">
        Good Coverage
      </Badge>
    );
  } else if (coverage >= 50) {
    return (
      <Badge className="bg-amber-500/10 text-amber-500 text-[10px]">
        Partial Coverage
      </Badge>
    );
  } else {
    return (
      <Badge className="bg-red-500/10 text-red-500 text-[10px]">
        Low Coverage
      </Badge>
    );
  }
}

export function CasinoSummaryCard({ data, isLoading }: CasinoSummaryCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <KpiCard
                key={i}
                title=""
                value=""
                accentColor="bg-accent"
                isLoading
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Casino Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <CardTitle className="text-sm font-medium">Casino Summary</CardTitle>
          <CoverageBadge
            tablesWithTelemetry={data.tables_with_telemetry_count}
            totalTables={data.tables_count}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span>{data.pits_count} pits</span>
          <span>·</span>
          <span>{data.tables_count} tables</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {/* Win/Loss (Inventory) */}
          <KpiCard
            title="Win/Loss (Inventory)"
            value={formatCents(data.win_loss_inventory_total_cents)}
            subtitle="Based on snapshots"
            accentColor="bg-accent"
          />

          {/* Win/Loss (Estimated) */}
          <KpiCard
            title="Win/Loss (Estimated)"
            value={formatCents(data.win_loss_estimated_total_cents)}
            subtitle="Based on telemetry"
            accentColor="bg-emerald-500"
          />

          {/* Total Fills */}
          <KpiCard
            title="Fills"
            value={formatCents(data.fills_total_cents)}
            subtitle={`${data.tables_count} tables`}
            accentColor="bg-blue-500"
          />

          {/* Total Credits */}
          <KpiCard
            title="Credits"
            value={formatCents(data.credits_total_cents)}
            subtitle={`${data.tables_count} tables`}
            accentColor="bg-violet-500"
          />
        </div>

        {/* Second row: Drop breakdown */}
        <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-3">
          <KpiCard
            title="Est. Drop (Rated)"
            value={formatCents(data.estimated_drop_rated_total_cents)}
            subtitle="Rated player buy-ins"
            accentColor="bg-amber-500"
          />

          <KpiCard
            title="Est. Drop (Grind)"
            value={formatCents(data.estimated_drop_grind_total_cents)}
            subtitle="Unrated play estimate"
            accentColor="bg-amber-500"
          />

          <KpiCard
            title="Est. Drop (Cash)"
            value={formatCents(data.estimated_drop_buyins_total_cents)}
            subtitle="Observed buy-ins"
            accentColor="bg-amber-500"
          />
        </div>
      </CardContent>
    </Card>
  );
}
