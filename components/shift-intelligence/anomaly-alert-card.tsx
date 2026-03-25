'use client';

/**
 * Anomaly Alert Card (PRD-055 WS6)
 *
 * Renders a single anomaly alert with severity badge, deviation score,
 * direction indicator, and baseline context. Shows readiness state
 * indicators for non-ready baselines.
 */

import { ArrowDown, ArrowUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AnomalyAlertDTO } from '@/services/shift-intelligence/dtos';

interface AnomalyAlertCardProps {
  alert: AnomalyAlertDTO;
}

const SEVERITY_STYLES: Record<
  string,
  { variant: 'outline' | 'secondary' | 'destructive'; className: string }
> = {
  info: { variant: 'outline', className: 'border-blue-400 text-blue-600' },
  warn: {
    variant: 'secondary',
    className: 'bg-amber-100 text-amber-700 border-amber-300',
  },
  critical: { variant: 'destructive', className: '' },
};

function ReadinessIndicator({ alert }: { alert: AnomalyAlertDTO }) {
  if (alert.readinessState === 'ready') return null;

  const labels: Record<string, string> = {
    stale: alert.baselineGamingDay
      ? `Baseline stale (last: ${formatShortDate(alert.baselineGamingDay)})`
      : 'Baseline stale',
    missing: 'No baseline available',
    insufficient_data:
      alert.baselineSampleCount != null
        ? `Baseline building (${alert.baselineSampleCount}/3 days)`
        : 'Baseline building',
  };

  return (
    <p className="text-xs text-muted-foreground italic">
      {labels[alert.readinessState] ?? alert.readinessState}
    </p>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMetricLabel(metricType: string): string {
  const labels: Record<string, string> = {
    drop_total: 'Drop Total',
    hold_percent: 'Hold %',
    cash_obs_total: 'Cash Obs Total',
    win_loss_cents: 'Win/Loss',
  };
  return labels[metricType] ?? metricType;
}

export function AnomalyAlertCard({ alert }: AnomalyAlertCardProps) {
  const severityStyle = alert.severity
    ? SEVERITY_STYLES[alert.severity]
    : SEVERITY_STYLES.info;

  const DirectionIcon = alert.direction === 'above' ? ArrowUp : ArrowDown;

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="gap-1 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            {alert.tableLabel} &mdash; {formatMetricLabel(alert.metricType)}
          </CardTitle>
          {alert.severity && (
            <Badge
              variant={severityStyle.variant}
              className={cn('text-xs uppercase', severityStyle.className)}
            >
              {alert.severity}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">{alert.message}</p>

        {alert.isAnomaly && alert.deviationScore != null && alert.direction && (
          <div className="flex items-center gap-2 text-sm">
            <DirectionIcon className="size-3.5 text-muted-foreground" />
            <span className="font-medium">
              {alert.deviationScore.toFixed(1)}x deviation ({alert.direction})
            </span>
          </div>
        )}

        {alert.readinessState === 'ready' &&
          alert.baselineMedian != null &&
          alert.baselineMad != null && (
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>Median: {alert.baselineMedian.toFixed(1)}</span>
              <span>MAD: {alert.baselineMad.toFixed(1)}</span>
              {alert.baselineSampleCount != null && (
                <span>Samples: {alert.baselineSampleCount}</span>
              )}
            </div>
          )}

        <ReadinessIndicator alert={alert} />
      </CardContent>
    </Card>
  );
}
