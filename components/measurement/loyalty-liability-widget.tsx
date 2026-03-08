/**
 * Loyalty Liability Widget (MEAS-004)
 *
 * Displays loyalty point liability and valuation metrics.
 * Casino-level only — no breakdown support.
 * MANDATORY: Shows "As of [snapshot_date]" via FreshnessBadge.
 *
 * @see EXEC-046 WS5 — Widget Components
 */

'use client';

import { formatCents, formatNumber } from '@/lib/format';
import type { LoyaltyLiabilityDto, WidgetError } from '@/services/measurement';

import { MetricWidget } from './metric-widget';

export interface LoyaltyLiabilityWidgetProps {
  data: LoyaltyLiabilityDto | null;
  error?: WidgetError;
  currentFilter?: { pitId?: string; tableId?: string };
  isLoading?: boolean;
}

export function LoyaltyLiabilityWidget({
  data,
  error,
  currentFilter,
  isLoading,
}: LoyaltyLiabilityWidgetProps) {
  // MEAS-004: null data is valid (new casino, no snapshot yet) — NOT an error
  if (!data && !error && !isLoading) {
    return (
      <MetricWidget title="Loyalty Liability" freshness="periodic">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-muted-foreground">No data yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Loyalty snapshots will appear once generated
          </p>
        </div>
      </MetricWidget>
    );
  }

  return (
    <MetricWidget
      title="Loyalty Liability"
      freshness="periodic"
      snapshotDate={data?.snapshotDate}
      error={error}
      supportedDimensions={data?.supportedDimensions}
      currentFilter={currentFilter}
      isLoading={isLoading}
    >
      {data ? (
        <div className="space-y-4">
          {/* Primary: Dollar value */}
          <div>
            <p className="text-xs text-muted-foreground">Estimated Liability</p>
            <p className="text-2xl font-semibold font-mono tabular-nums">
              {formatCents(data.estimatedMonetaryValueCents)}
            </p>
          </div>

          {/* Points and players */}
          <div className="border-t pt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Total Points</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatNumber(data.totalOutstandingPoints)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Players</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatNumber(data.playerCount)}
              </p>
            </div>
          </div>

          {/* Valuation rate */}
          {data.centsPerPoint != null && (
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground">Valuation Rate</p>
              <p className="text-sm font-semibold font-mono tabular-nums">
                {(data.centsPerPoint / 100).toFixed(4)} $/pt
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No data available
        </p>
      )}
    </MetricWidget>
  );
}
