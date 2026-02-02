/**
 * Promo Exposure Panel Component
 *
 * Displays promo exposure metrics for shift dashboard:
 * - Issued coupons count and face value
 * - Outstanding (uncleared) exposure
 * - Void/Replace counts
 * - Expiring soon alerts
 *
 * Design: Brutalist aesthetic with monospace typography.
 * SEPARATE from cash KPIs per PRD-LOYALTY-PROMO DoD requirement.
 *
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS8
 */

'use client';

import * as React from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDollars } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PromoExposureRollupDTO } from '@/services/loyalty/rollups';

interface PromoExposurePanelProps {
  /** Promo exposure data from rollup query */
  exposure: PromoExposureRollupDTO | undefined;
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Alert thresholds (optional, for visual indicators) */
  thresholds?: {
    expiringSoonWarning?: number;
    voidRateWarning?: number;
  };
}

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  variant?: 'default' | 'warning' | 'alert';
  isLoading?: boolean;
}

function MetricCard({
  label,
  value,
  subValue,
  variant = 'default',
  isLoading,
}: MetricCardProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-24" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'text-[10px] font-bold uppercase tracking-widest',
          variant === 'warning' && 'text-yellow-500',
          variant === 'alert' && 'text-destructive',
          variant === 'default' && 'text-muted-foreground',
        )}
        style={{ fontFamily: 'monospace' }}
      >
        {label}
      </div>
      <div
        className={cn(
          'text-xl font-bold tabular-nums',
          variant === 'warning' && 'text-yellow-500',
          variant === 'alert' && 'text-destructive',
          variant === 'default' && 'text-foreground',
        )}
        style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
      {subValue && (
        <div
          className="text-[10px] text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          {subValue}
        </div>
      )}
    </div>
  );
}

/**
 * Calculate void rate percentage.
 */
function calculateVoidRate(voided: number, issued: number): number {
  if (issued === 0) return 0;
  return (voided / issued) * 100;
}

export function PromoExposurePanel({
  exposure,
  isLoading = false,
  error,
  thresholds = { expiringSoonWarning: 5, voidRateWarning: 5 },
}: PromoExposurePanelProps) {
  // Calculate derived metrics
  const voidRate = exposure
    ? calculateVoidRate(exposure.voidedCount, exposure.issuedCount)
    : 0;

  const hasExpiringSoonAlert =
    exposure &&
    exposure.expiringSoonCount > (thresholds.expiringSoonWarning ?? 5);
  const hasHighVoidRate = voidRate > (thresholds.voidRateWarning ?? 5);

  if (error) {
    return (
      <Card className="border-2 border-destructive/50 bg-destructive/5 p-4">
        <div
          className="text-xs font-bold uppercase tracking-widest text-destructive"
          style={{ fontFamily: 'monospace' }}
        >
          Promo Data Unavailable
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {error.message}
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-purple-500/30 bg-purple-500/5">
      {/* Header */}
      <div className="border-b-2 border-purple-500/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="text-xs font-bold uppercase tracking-widest text-purple-400"
            style={{ fontFamily: 'monospace' }}
          >
            Promo Exposure
          </div>
          {(hasExpiringSoonAlert || hasHighVoidRate) && (
            <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-yellow-500">
              Alert
            </span>
          )}
        </div>
        {exposure?.gamingDay && (
          <div
            className="mt-1 text-[10px] text-muted-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Gaming Day: {exposure.gamingDay}
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 p-4">
        {/* Issued */}
        <MetricCard
          label="Issued"
          value={exposure?.issuedCount ?? 0}
          subValue={
            exposure ? formatDollars(exposure.totalIssuedFaceValue) : undefined
          }
          isLoading={isLoading}
        />

        {/* Outstanding */}
        <MetricCard
          label="Outstanding"
          value={exposure?.outstandingCount ?? 0}
          subValue={
            exposure ? formatDollars(exposure.outstandingFaceValue) : undefined
          }
          variant={
            exposure && exposure.outstandingCount > 0 ? 'warning' : 'default'
          }
          isLoading={isLoading}
        />

        {/* Patron At-Risk */}
        <MetricCard
          label="Patron Risk"
          value={
            exposure ? formatDollars(exposure.totalIssuedPatronRisk) : '$0'
          }
          isLoading={isLoading}
        />

        {/* Expiring Soon */}
        <MetricCard
          label="Expiring Soon"
          value={exposure?.expiringSoonCount ?? 0}
          variant={hasExpiringSoonAlert ? 'alert' : 'default'}
          isLoading={isLoading}
        />

        {/* Voided */}
        <MetricCard
          label="Voided"
          value={exposure?.voidedCount ?? 0}
          subValue={`${voidRate.toFixed(1)}% rate`}
          variant={hasHighVoidRate ? 'warning' : 'default'}
          isLoading={isLoading}
        />

        {/* Replaced */}
        <MetricCard
          label="Replaced"
          value={exposure?.replacedCount ?? 0}
          isLoading={isLoading}
        />
      </div>

      {/* Alerts Section */}
      {(hasExpiringSoonAlert || hasHighVoidRate) && !isLoading && (
        <div className="border-t-2 border-purple-500/20 p-4">
          <div className="space-y-2">
            {hasExpiringSoonAlert && (
              <Alert
                variant="destructive"
                className="border-yellow-500/50 bg-yellow-500/10"
              >
                <AlertTitle className="text-xs font-bold text-yellow-500">
                  Expiring Coupons
                </AlertTitle>
                <AlertDescription className="text-[10px] text-yellow-500/80">
                  {exposure?.expiringSoonCount} coupons expiring within 24 hours
                </AlertDescription>
              </Alert>
            )}
            {hasHighVoidRate && (
              <Alert
                variant="destructive"
                className="border-yellow-500/50 bg-yellow-500/10"
              >
                <AlertTitle className="text-xs font-bold text-yellow-500">
                  High Void Rate
                </AlertTitle>
                <AlertDescription className="text-[10px] text-yellow-500/80">
                  Void rate ({voidRate.toFixed(1)}%) exceeds threshold (
                  {thresholds.voidRateWarning}%)
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
