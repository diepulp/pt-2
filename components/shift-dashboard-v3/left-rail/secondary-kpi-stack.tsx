'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCents } from '@/lib/format';
import type { ShiftCasinoMetricsDTO } from '@/services/table-context/shift-metrics/dtos';

export interface SecondaryKpiStackProps {
  data: ShiftCasinoMetricsDTO | undefined;
  isLoading?: boolean;
}

interface CompactKpiProps {
  title: string;
  valueCents: number | null | undefined;
  accentColor: string;
  isLoading?: boolean;
}

function CompactKpi({
  title,
  valueCents,
  accentColor,
  isLoading,
}: CompactKpiProps) {
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden">
        <div className={`absolute left-0 top-0 h-full w-1 ${accentColor}`} />
        <div className="py-2.5 pl-4 pr-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="mt-1.5 h-6 w-20" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute left-0 top-0 h-full w-1 ${accentColor}`} />
      <div className="py-2.5 pl-4 pr-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <p className="mt-1 text-lg font-semibold font-mono tabular-nums">
          {formatCents(valueCents)}
        </p>
      </div>
    </Card>
  );
}

/**
 * Vertical stack of 3 KPI cards for the left rail (~180px total).
 * Fills, Credits, Est. Drop in compact vertical layout.
 */
export function SecondaryKpiStack({ data, isLoading }: SecondaryKpiStackProps) {
  // buyins_total_cents is already the sum of rated + grind (see rpc_shift_table_metrics)
  const estDropTotal = data?.estimated_drop_buyins_total_cents ?? 0;

  return (
    <div className="grid grid-cols-1 gap-2">
      <CompactKpi
        title="Fills"
        valueCents={data?.fills_total_cents}
        accentColor="bg-blue-500"
        isLoading={isLoading}
      />
      <CompactKpi
        title="Credits"
        valueCents={data?.credits_total_cents}
        accentColor="bg-violet-500"
        isLoading={isLoading}
      />
      <CompactKpi
        title="Est. Drop"
        valueCents={isLoading ? null : estDropTotal}
        accentColor="bg-amber-500"
        isLoading={isLoading}
      />
    </div>
  );
}
