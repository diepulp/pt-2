/**
 * Alerts Panel
 *
 * Displays cash observation spike alerts for shift dashboard.
 * TELEMETRY-ONLY: These alerts are observational, NOT authoritative.
 *
 * @see ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md §3.4
 */

"use client";

import {
  AlertTriangleIcon,
  BellIcon,
  InfoIcon,
  XCircleIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CashObsSpikeAlertDTO } from "@/services/table-context/dtos";

export interface AlertsPanelProps {
  data: CashObsSpikeAlertDTO[] | undefined;
  isLoading?: boolean;
}

/**
 * Format cents to currency string.
 */
function formatCurrency(cents: number | null | undefined): string {
  if (cents == null) return "$0";
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

/**
 * Get severity colors and icon.
 */
function getSeverityConfig(severity: "info" | "warn" | "critical") {
  switch (severity) {
    case "critical":
      return {
        borderClass: "border-l-4 border-red-500",
        bgClass: "bg-red-50/10",
        icon: <XCircleIcon className="h-4 w-4 text-red-500" />,
        badgeClass: "bg-red-500/10 text-red-500",
      };
    case "warn":
      return {
        borderClass: "border-l-4 border-amber-500",
        bgClass: "bg-amber-50/10",
        icon: <AlertTriangleIcon className="h-4 w-4 text-amber-500" />,
        badgeClass: "bg-amber-500/10 text-amber-500",
      };
    case "info":
    default:
      return {
        borderClass: "border-l-4 border-blue-500",
        bgClass: "bg-blue-50/10",
        icon: <InfoIcon className="h-4 w-4 text-blue-500" />,
        badgeClass: "bg-blue-500/10 text-blue-500",
      };
  }
}

/**
 * Single alert card.
 */
function AlertCard({ alert }: { alert: CashObsSpikeAlertDTO }) {
  const config = getSeverityConfig(alert.severity);

  return (
    <div
      className={`${config.borderClass} ${config.bgClass} p-3 rounded-r-lg`}
      role="alert"
      aria-label={`${alert.severity} alert for ${alert.entity_label}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {config.icon}
          <Badge
            variant="outline"
            className="border-amber-500/50 text-amber-600 text-[10px]"
          >
            TELEMETRY
          </Badge>
          <span className="font-mono text-sm">{alert.entity_label}</span>
        </div>
        <Badge className={`${config.badgeClass} text-[10px] uppercase`}>
          {alert.severity}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground mt-2">{alert.message}</p>

      <div className="flex gap-6 mt-2 text-xs">
        <div>
          <span className="text-muted-foreground">Observed: </span>
          <span className="font-mono tabular-nums text-amber-600">
            {formatCurrency(alert.observed_value)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Threshold: </span>
          <span className="font-mono tabular-nums">
            {formatCurrency(alert.threshold)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
        <span className="uppercase tracking-wider">
          {alert.entity_type === "table" ? "Table" : "Pit"} Alert
        </span>
        <span>·</span>
        <span>Observational Only</span>
      </div>
    </div>
  );
}

/**
 * Skeleton for loading state.
 */
function AlertSkeleton() {
  return (
    <div className="border-l-4 border-muted bg-muted/10 p-3 rounded-r-lg">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-4 w-full mt-2" />
      <div className="flex gap-4 mt-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

export function AlertsPanel({ data, isLoading }: AlertsPanelProps) {
  const criticalCount =
    data?.filter((a) => a.severity === "critical").length ?? 0;
  const warnCount = data?.filter((a) => a.severity === "warn").length ?? 0;
  const totalCount = data?.length ?? 0;

  return (
    <Card className="border-dashed border-amber-500/30 bg-amber-50/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellIcon className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">Spike Alerts</CardTitle>
            <Badge
              variant="outline"
              className="border-amber-500/50 text-amber-600 text-[10px]"
            >
              TELEMETRY
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge className="bg-red-500/10 text-red-500 text-[10px]">
                {criticalCount} critical
              </Badge>
            )}
            {warnCount > 0 && (
              <Badge className="bg-amber-500/10 text-amber-500 text-[10px]">
                {warnCount} warn
              </Badge>
            )}
            {totalCount === 0 && !isLoading && (
              <span className="text-xs text-muted-foreground">No alerts</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <AlertSkeleton />
            <AlertSkeleton />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <BellIcon className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              No spike alerts in this time window
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Alerts trigger when observed totals exceed thresholds
            </p>
          </div>
        ) : (
          <div
            className="space-y-3 max-h-[400px] overflow-y-auto"
            role="log"
            aria-label="Spike alerts list"
          >
            {/* Sort by severity: critical first, then warn, then info */}
            {[...data]
              .sort((a, b) => {
                const order = { critical: 0, warn: 1, info: 2 };
                return order[a.severity] - order[b.severity];
              })
              .map((alert, index) => (
                <AlertCard key={`${alert.entity_id}-${index}`} alert={alert} />
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
