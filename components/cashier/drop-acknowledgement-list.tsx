'use client';

/**
 * Drop Acknowledgement List
 *
 * Shows unacknowledged drop events awaiting cage received stamp.
 * Single-click acknowledge action.
 *
 * @see PRD-033 Cashier Workflow MVP
 */

import { useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TableDropEventDTO } from '@/services/table-context/dtos';

interface DropAcknowledgementListProps {
  drops: TableDropEventDTO[];
  onAcknowledge: (dropEventId: string) => void;
}

export function DropAcknowledgementList({
  drops,
  onAcknowledge,
}: DropAcknowledgementListProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Unacknowledged Drops</CardTitle>
          <Badge variant="secondary">{drops.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {drops.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No unacknowledged drops for today.
          </p>
        ) : (
          <div className="space-y-3">
            {drops.map((drop) => (
              <DropItem
                key={drop.id}
                drop={drop}
                onAcknowledge={onAcknowledge}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DropItem({
  drop,
  onAcknowledge,
}: {
  drop: TableDropEventDTO;
  onAcknowledge: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleAcknowledge = () => {
    startTransition(() => {
      onAcknowledge(drop.id);
    });
  };

  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              Table: {drop.table_id.slice(0, 8)}...
            </span>
            <Badge variant="outline" className="text-xs">
              Drop
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>Box: {drop.drop_box_id}</div>
            {drop.seal_no && <div>Seal: {drop.seal_no}</div>}
            {drop.gaming_day && <div>Gaming Day: {drop.gaming_day}</div>}
            <div>Removed: {new Date(drop.removed_at).toLocaleTimeString()}</div>
          </div>
        </div>
        <Button size="sm" onClick={handleAcknowledge} disabled={isPending}>
          {isPending ? 'Stamping...' : 'Received'}
        </Button>
      </div>
    </div>
  );
}
