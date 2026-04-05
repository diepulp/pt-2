'use client';

import { Bell, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useDismissedAlerts } from '@/hooks/admin/dismissed-alerts-context';
import { useAdminAlerts } from '@/hooks/admin/use-admin-alerts';
import {
  usePersistAlerts,
  useShiftAlerts,
} from '@/hooks/shift-intelligence/use-shift-alerts';
import { computeAlertKey } from '@/lib/admin/alert-key';
import type { ShiftAlertDTO } from '@/services/shift-intelligence/dtos';

import { AcknowledgeAlertDialog } from './acknowledge-alert-dialog';
import { AlertDetailCard } from './alert-detail-card';
import { AlertEmptyState } from './alert-empty-state';
import { FallbackBanner } from './fallback-banner';
import { SeverityFilter } from './severity-filter';

type Severity = 'critical' | 'warn' | 'info';

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

function todayGamingDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AlertsPageClient() {
  const { data: alerts, isLoading, timeWindow } = useAdminAlerts();
  const { dismissAlert, isDismissed } = useDismissedAlerts();

  // PRD-056: Persistent baseline alerts
  const gamingDay = todayGamingDay();
  const persistMutation = usePersistAlerts();
  const { data: shiftAlertsData, isLoading: isLoadingShiftAlerts } =
    useShiftAlerts(gamingDay);

  // Persist alerts on mount (PRD §6 Flow 1)
  useEffect(() => {
    persistMutation.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, []);

  const [selectedSeverities, setSelectedSeverities] = useState<Set<Severity>>(
    () => new Set<Severity>(['critical', 'warn', 'info']),
  );

  const [ackTarget, setAckTarget] = useState<ShiftAlertDTO | null>(null);

  const handleToggleSeverity = (severity: Severity) => {
    setSelectedSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) {
        if (next.size > 1) next.delete(severity);
      } else {
        next.add(severity);
      }
      return next;
    });
  };

  const filteredAlerts = useMemo(() => {
    if (!alerts) return [];
    return alerts
      .filter((a) => {
        if (!selectedSeverities.has(a.severity)) return false;
        if (isDismissed(computeAlertKey(a))) return false;
        return true;
      })
      .sort((a, b) => {
        const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (sevDiff !== 0) return sevDiff;
        const obsDiff = b.observed_value - a.observed_value;
        if (obsDiff !== 0) return obsDiff;
        return a.entity_label.localeCompare(b.entity_label);
      });
  }, [alerts, selectedSeverities, isDismissed]);

  const baselineAlerts = shiftAlertsData?.alerts ?? [];

  return (
    <div className="flex flex-1 flex-col">
      {/* Header — matches SettingsContentSection exemplar */}
      <div className="flex-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Bell className="h-6 w-6 text-accent" />
            <h3
              className="text-xl font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Alerts
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
              onClick={() => persistMutation.mutate(undefined)}
              disabled={persistMutation.isPending}
            >
              <RefreshCw
                className={`h-3 w-3 ${persistMutation.isPending ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
            <SeverityFilter
              selected={selectedSeverities}
              onToggle={handleToggleSeverity}
            />
          </div>
        </div>
        <p className="mt-1 pl-[34px] text-base text-muted-foreground">
          Cash observation &amp; baseline anomaly alerts.
        </p>
      </div>
      <Separator className="my-4 flex-none" />

      <div className="w-full space-y-4 overflow-y-auto pe-4 pb-4">
        {/* Fallback banner */}
        <FallbackBanner source={timeWindow.source} />

        {/* Persistent Baseline Alerts Section (PRD-056) */}
        {(isLoadingShiftAlerts || baselineAlerts.length > 0) && (
          <div className="space-y-3">
            <h2
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              Baseline Alerts
            </h2>
            {isLoadingShiftAlerts ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              baselineAlerts.map((alert) => (
                <Card
                  key={alert.id}
                  className={`gap-2 py-3 ${alert.status === 'acknowledged' ? 'opacity-50 border-muted' : 'border-2'}`}
                >
                  <CardHeader className="gap-1 pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm">
                          {alert.tableLabel} &mdash; {alert.metricType}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-teal-400 text-teal-600"
                        >
                          Baseline
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            alert.severity === 'high'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="text-xs uppercase"
                        >
                          {alert.severity}
                        </Badge>
                        {alert.status === 'open' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setAckTarget(alert)}
                          >
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-sm">{alert.message}</p>
                    {alert.acknowledgment && (
                      <p className="text-xs text-muted-foreground">
                        Acknowledged by{' '}
                        {alert.acknowledgment.acknowledgedByName ?? 'staff'}
                        {alert.acknowledgment.isFalsePositive &&
                          ' (false positive)'}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Cash Observation Alerts Section */}
        {(isLoading || filteredAlerts.length > 0) && (
          <div className="space-y-3">
            <h2
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              Cash Observation Alerts
            </h2>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-4 w-full mt-3" />
                    <div className="flex gap-4 mt-3">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3" role="log" aria-label="Alert list">
                {filteredAlerts.map((alert) => {
                  const key = computeAlertKey(alert);
                  return (
                    <AlertDetailCard
                      key={key}
                      alert={alert}
                      alertKey={key}
                      onDismiss={dismissAlert}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty state when both sections are empty */}
        {!isLoading &&
          !isLoadingShiftAlerts &&
          filteredAlerts.length === 0 &&
          baselineAlerts.length === 0 && <AlertEmptyState />}

        {/* Acknowledge dialog */}
        <AcknowledgeAlertDialog
          alert={ackTarget}
          open={!!ackTarget}
          onOpenChange={(open) => !open && setAckTarget(null)}
        />
      </div>
    </div>
  );
}
