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
    <Card className="border-2 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Unacknowledged Drops
          </CardTitle>
          <Badge variant="secondary">{drops.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {drops.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              All Drops Acknowledged
            </div>
          </div>
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
    <div className="group relative rounded-lg border-2 border-yellow-500/50 bg-yellow-500/5 p-3 transition-all hover:border-yellow-500/70">
      <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium font-mono">
              Table: {drop.table_id.slice(0, 8)}...
            </span>
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-400 border-amber-500/30"
            >
              Drop
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums space-y-0.5">
            <div>Box: {drop.drop_box_id}</div>
            {drop.seal_no && <div>Seal: {drop.seal_no}</div>}
            {drop.gaming_day && <div>Gaming Day: {drop.gaming_day}</div>}
            <div>Removed: {new Date(drop.removed_at).toLocaleTimeString()}</div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
          onClick={handleAcknowledge}
          disabled={isPending}
        >
          {isPending ? 'Stamping...' : 'Received'}
        </Button>
      </div>
    </div>
  );
}
