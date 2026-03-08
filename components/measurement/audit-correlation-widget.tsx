/**
 * Audit Correlation Widget (MEAS-002)
 *
 * Displays audit event correlation metrics.
 * Casino-level only — no breakdown support.
 *
 * @see EXEC-046 WS5 — Widget Components
 */

'use client';

import { formatNumber, formatPercentage } from '@/lib/format';
import type { AuditCorrelationDto, WidgetError } from '@/services/measurement';

import { MetricWidget } from './metric-widget';

export interface AuditCorrelationWidgetProps {
  data: AuditCorrelationDto | null;
  error?: WidgetError;
  currentFilter?: { pitId?: string; tableId?: string };
  isLoading?: boolean;
}

export function AuditCorrelationWidget({
  data,
  error,
  currentFilter,
  isLoading,
}: AuditCorrelationWidgetProps) {
  return (
    <MetricWidget
      title="Audit Correlation"
      freshness="request-time"
      error={error}
      supportedDimensions={data?.supportedDimensions}
      currentFilter={currentFilter}
      isLoading={isLoading}
    >
      {data ? (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Total Slips</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatNumber(data.totalSlips)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Full Chain</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatNumber(data.fullChainCount)}
              </p>
            </div>
          </div>

          {/* Chain rate */}
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground">Full Chain Rate</p>
            <p className="text-2xl font-semibold font-mono tabular-nums">
              {formatPercentage(data.fullChainRate, 1)}
            </p>
          </div>

          {/* Correlation breakdown */}
          <div className="border-t pt-3 grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">With PFT</p>
              <p className="text-sm font-semibold font-mono tabular-nums">
                {formatNumber(data.slipsWithPft)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">With MTL</p>
              <p className="text-sm font-semibold font-mono tabular-nums">
                {formatNumber(data.slipsWithMtl)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">With Loyalty</p>
              <p className="text-sm font-semibold font-mono tabular-nums">
                {formatNumber(data.slipsWithLoyalty)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No data available
        </p>
      )}
    </MetricWidget>
  );
}
