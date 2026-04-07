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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useAcknowledgeDrop,
  useUnacknowledgedDrops,
} from '@/hooks/cashier/use-cashier-operations';

export function DropAcknowledgementsView() {
  const dropsQuery = useUnacknowledgedDrops();
  const acknowledgeDrop = useAcknowledgeDrop();

  if (dropsQuery.isLoading) {
    return (
      <Card className="border-2 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Unacknowledged Drops
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg bg-muted/50"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
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
