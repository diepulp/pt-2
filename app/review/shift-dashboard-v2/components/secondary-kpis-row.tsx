/**
 * Secondary KPIs Row
 *
 * Row of secondary KPI cards: Fills, Credits, Est. Drop.
 * Provides operational context without competing with Hero KPI.
 *
 * @see IMPLEMENTATION_STRATEGY.md §3.2 Zone C
 */

'use client';

import type { ShiftCasinoMetricsDTO } from '@/services/table-context/shift-metrics/dtos';

import { SecondaryKpiCard } from './secondary-kpi-card';

export interface SecondaryKpisRowProps {
  /** Casino metrics data */
  data: ShiftCasinoMetricsDTO | undefined;
  /** Loading state */
  isLoading?: boolean;
}

export function SecondaryKpisRow({ data, isLoading }: SecondaryKpisRowProps) {
  // Compute combined estimated drop
  const estDropTotal =
    (data?.estimated_drop_rated_total_cents ?? 0) +
    (data?.estimated_drop_grind_total_cents ?? 0) +
    (data?.estimated_drop_buyins_total_cents ?? 0);

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
      {/* Fills */}
      <SecondaryKpiCard
        title="Fills"
        valueCents={data?.fills_total_cents}
        subtitle={`${data?.tables_count ?? 0} tables`}
        accentColor="bg-blue-500"
        isLoading={isLoading}
      />

      {/* Credits */}
      <SecondaryKpiCard
        title="Credits"
        valueCents={data?.credits_total_cents}
        subtitle={`${data?.tables_count ?? 0} tables`}
        accentColor="bg-violet-500"
        isLoading={isLoading}
      />

      {/* Est. Drop (Combined) */}
      <SecondaryKpiCard
        title="Est. Drop"
        valueCents={isLoading ? null : estDropTotal}
        subtitle="Rated + Grind + Cash"
        accentColor="bg-amber-500"
        isLoading={isLoading}
      />
    </div>
  );
}
