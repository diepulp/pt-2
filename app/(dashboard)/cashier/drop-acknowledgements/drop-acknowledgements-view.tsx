'use client';

/**
 * Drop Acknowledgements View
 *
 * Client component that fetches and displays unacknowledged drop events
 * with single-click acknowledge action.
 *
 * @see PRD-033 Cashier Workflow MVP
 */

import { DropAcknowledgementList } from '@/components/cashier/drop-acknowledgement-list';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAcknowledgeDrop,
  useUnacknowledgedDrops,
} from '@/hooks/cashier/use-cashier-operations';

export function DropAcknowledgementsView() {
  const dropsQuery = useUnacknowledgedDrops();
  const acknowledgeDrop = useAcknowledgeDrop();

  if (dropsQuery.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const drops = dropsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <DropAcknowledgementList
        drops={drops}
        onAcknowledge={(id) => acknowledgeDrop.mutate(id)}
      />
    </div>
  );
}
