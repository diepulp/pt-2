/**
 * Metric Widget Shell
 *
 * Shared card container for measurement metric widgets.
 * Handles loading, error, and unsupported-filter states.
 *
 * @see EXEC-046 WS5 — Widget Components
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { measurementKeys } from '@/hooks/measurement/keys';
import type { FilterDimension, WidgetError } from '@/services/measurement';

import { FreshnessBadge, type FreshnessBadgeProps } from './freshness-badge';

export interface MetricWidgetProps {
  title: string;
  freshness: FreshnessBadgeProps['freshness'];
  snapshotDate?: string;
  children: React.ReactNode;
  error?: WidgetError;
  supportedDimensions?: FilterDimension[];
  currentFilter?: { pitId?: string; tableId?: string };
  isLoading?: boolean;
}

function hasActiveFilter(filter?: { pitId?: string; tableId?: string }) {
  return filter?.pitId || filter?.tableId;
}

function isFilterSupported(
  supportedDimensions?: FilterDimension[],
  filter?: { pitId?: string; tableId?: string },
) {
  if (!hasActiveFilter(filter)) return true;
  if (!supportedDimensions || supportedDimensions.length === 0) return false;
  return true;
}

export function MetricWidget({
  title,
  freshness,
  snapshotDate,
  children,
  error,
  supportedDimensions,
  currentFilter,
  isLoading,
}: MetricWidgetProps) {
  const queryClient = useQueryClient();

  const handleRetry = () => {
    queryClient.invalidateQueries({
      queryKey: measurementKeys.summary.scope,
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-14" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <FreshnessBadge freshness={freshness} snapshotDate={snapshotDate} />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-muted-foreground">Metric unavailable</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {error.message}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleRetry}
            >
              <RefreshCwIcon className="mr-1.5 h-3 w-3" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Unsupported filter state
  if (
    hasActiveFilter(currentFilter) &&
    !isFilterSupported(supportedDimensions, currentFilter)
  ) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <FreshnessBadge freshness={freshness} snapshotDate={snapshotDate} />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-muted-foreground">Casino-level only</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              This metric does not support pit/table filtering
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Normal state
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <FreshnessBadge freshness={freshness} snapshotDate={snapshotDate} />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
