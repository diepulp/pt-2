'use client';

/**
 * Recompute Baselines Button (PRD-055 WS6)
 *
 * Triggers POST /api/shift-intelligence/compute-baselines.
 * Intended for pit_boss + admin roles. Role check is at the API level;
 * this button is conditionally rendered by the parent.
 */

import { Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useComputeBaselines } from '@/hooks/shift-intelligence/use-compute-baselines';

export function RecomputeBaselinesButton() {
  const mutation = useComputeBaselines();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({})}
      >
        {mutation.isPending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <RefreshCw />
        )}
        {mutation.isPending ? 'Computing...' : 'Recompute Baselines'}
      </Button>

      {mutation.isSuccess && mutation.data && (
        <span className="text-xs text-muted-foreground">
          {mutation.data.tablesProcessed} tables,{' '}
          {mutation.data.metricsComputed} metrics
        </span>
      )}

      {mutation.isError && (
        <span className="text-xs text-destructive">
          Failed to compute baselines
        </span>
      )}
    </div>
  );
}
