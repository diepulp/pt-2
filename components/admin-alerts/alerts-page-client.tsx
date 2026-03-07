'use client';

import { BellIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useDismissedAlerts } from '@/hooks/admin/dismissed-alerts-context';
import { useAdminAlerts } from '@/hooks/admin/use-admin-alerts';
import { computeAlertKey } from '@/lib/admin/alert-key';

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

export function AlertsPageClient() {
  const { data: alerts, isLoading, timeWindow } = useAdminAlerts();
  const { dismissAlert, isDismissed } = useDismissedAlerts();

  const [selectedSeverities, setSelectedSeverities] = useState<Set<Severity>>(
    () => new Set<Severity>(['critical', 'warn', 'info']),
  );

  const handleToggleSeverity = (severity: Severity) => {
    setSelectedSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) {
        // Don't allow deselecting all
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
        // Severity order: critical first
        const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (sevDiff !== 0) return sevDiff;
        // Then by observed_value descending
        const obsDiff = b.observed_value - a.observed_value;
        if (obsDiff !== 0) return obsDiff;
        // Then by entity_label ascending
        return a.entity_label.localeCompare(b.entity_label);
      });
  }, [alerts, selectedSeverities, isDismissed]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BellIcon className="h-5 w-5 text-amber-500" />
          <div>
            <h1 className="text-lg font-semibold">Alerts</h1>
            <p className="text-xs text-muted-foreground">
              Cash observation spike alerts
            </p>
          </div>
        </div>
        <SeverityFilter
          selected={selectedSeverities}
          onToggle={handleToggleSeverity}
        />
      </div>

      {/* Fallback banner */}
      <FallbackBanner source={timeWindow.source} />

      {/* Content */}
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
      ) : filteredAlerts.length === 0 ? (
        <AlertEmptyState />
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
  );
}
