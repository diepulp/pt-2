/**
 * Alerts Strip
 *
 * Condensed actionable alerts bar with severity indicators and recommended actions.
 * Implements Nielsen's Heuristic #9 (Help Users Recognize, Diagnose, and Recover).
 *
 * @see IMPLEMENTATION_STRATEGY.md §7.4
 */

'use client';

import {
  AlertTriangleIcon,
  BellIcon,
  ChevronRightIcon,
  InfoIcon,
  XCircleIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getAlertSeverityColor } from '@/lib/colors';
import { formatCents } from '@/lib/format';
import type { CashObsSpikeAlertDTO } from '@/services/table-context/dtos';

export interface AlertsStripProps {
  /** List of alerts */
  alerts: CashObsSpikeAlertDTO[] | undefined;
  /** Maximum alerts to display (default 2) */
  maxDisplay?: number;
  /** Callback when "View All" is clicked */
  onViewAll?: () => void;
  /** Callback when an alert is clicked */
  onAlertClick?: (alert: CashObsSpikeAlertDTO) => void;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Get recommended action based on alert type.
 */
function getRecommendedAction(alert: CashObsSpikeAlertDTO): string {
  switch (alert.alert_type) {
    case 'cash_out_observed_spike_telemetry':
      return 'Review player activity, verify with cage';
    default:
      return 'Investigate unusual activity';
  }
}

/**
 * Get severity icon component.
 */
function SeverityIcon({
  severity,
}: {
  severity: 'info' | 'warn' | 'critical';
}) {
  const colorConfig = getAlertSeverityColor(severity);

  switch (severity) {
    case 'critical':
      return <XCircleIcon className={`h-4 w-4 ${colorConfig.text}`} />;
    case 'warn':
      return <AlertTriangleIcon className={`h-4 w-4 ${colorConfig.text}`} />;
    case 'info':
    default:
      return <InfoIcon className={`h-4 w-4 ${colorConfig.text}`} />;
  }
}

/**
 * Single alert item.
 */
function AlertItem({
  alert,
  onClick,
}: {
  alert: CashObsSpikeAlertDTO;
  onClick?: () => void;
}) {
  const colorConfig = getAlertSeverityColor(alert.severity);
  const action = getRecommendedAction(alert);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg ${colorConfig.bgMuted} border ${colorConfig.border}/30 hover:${colorConfig.border}/50 transition-colors`}
    >
      <div className="flex items-start gap-3">
        <SeverityIcon severity={alert.severity} />

        <div className="flex-1 min-w-0">
          {/* Alert header */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`${colorConfig.text} ${colorConfig.border}/50 text-[10px] uppercase`}
            >
              {alert.severity}
            </Badge>
            <span className="font-mono text-sm font-medium truncate">
              {alert.entity_label}
            </span>
          </div>

          {/* Alert message */}
          <p className="mt-1 text-sm text-muted-foreground">
            {alert.alert_type === 'cash_out_observed_spike_telemetry' ? (
              <>
                Cash-out {formatCents(alert.observed_value)} exceeds{' '}
                {formatCents(alert.threshold)} threshold
              </>
            ) : (
              alert.message
            )}
          </p>

          {/* Recommended action */}
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="text-foreground">→</span> {action}
          </p>
        </div>

        <ChevronRightIcon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}

export function AlertsStrip({
  alerts,
  maxDisplay = 2,
  onViewAll,
  onAlertClick,
  isLoading,
}: AlertsStripProps) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
        </div>
      </Card>
    );
  }

  const totalCount = alerts?.length ?? 0;

  // Sort by severity and take top N
  const sortedAlerts = [...(alerts ?? [])]
    .sort((a, b) => {
      const order = { critical: 0, warn: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    })
    .slice(0, maxDisplay);

  const criticalCount =
    alerts?.filter((a) => a.severity === 'critical').length ?? 0;
  const warnCount = alerts?.filter((a) => a.severity === 'warn').length ?? 0;

  if (totalCount === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Alerts</span>
          </div>
          <span className="text-xs text-muted-foreground">No alerts</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground text-center py-4">
          No spike alerts in current time window
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 border-amber-500/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangleIcon className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium">
            Alerts <span className="text-muted-foreground">({totalCount})</span>
          </span>

          {criticalCount > 0 && (
            <Badge className="bg-rose-500/10 text-rose-500 text-[10px]">
              {criticalCount} critical
            </Badge>
          )}
          {warnCount > 0 && (
            <Badge className="bg-amber-500/10 text-amber-500 text-[10px]">
              {warnCount} warn
            </Badge>
          )}
        </div>

        {totalCount > maxDisplay && onViewAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewAll}
            className="text-xs h-auto py-1"
          >
            View All
            <ChevronRightIcon className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>

      {/* Alert items */}
      <div className="space-y-2">
        {sortedAlerts.map((alert, index) => (
          <AlertItem
            key={`${alert.entity_id}-${index}`}
            alert={alert}
            onClick={() => onAlertClick?.(alert)}
          />
        ))}
      </div>
    </Card>
  );
}
