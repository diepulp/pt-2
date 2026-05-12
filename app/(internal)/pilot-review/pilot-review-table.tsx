'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  approvePilotAccessAction,
  rejectPilotAccessAction,
} from '@/app/actions/pilot/review-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PilotAccessRequestDTO } from '@/services/pilot/dtos';

interface Props {
  requests: PilotAccessRequestDTO[];
}

interface RowState {
  error: string | null;
}

export function PilotReviewTable({ requests }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [isPending, startTransition] = useTransition();

  function setRowError(id: string, error: string | null) {
    setRowStates((prev) => ({ ...prev, [id]: { error } }));
  }

  function handleApprove(requestId: string) {
    setRowError(requestId, null);
    setPendingId(requestId);
    startTransition(async () => {
      const result = await approvePilotAccessAction(requestId);
      if (!result.ok) {
        setRowError(
          requestId,
          result.error ?? 'Approval failed. Please try again.',
        );
      } else {
        router.refresh();
      }
      setPendingId(null);
    });
  }

  function handleReject(requestId: string) {
    setRowError(requestId, null);
    setPendingId(requestId);
    startTransition(async () => {
      const result = await rejectPilotAccessAction(requestId);
      if (!result.ok) {
        setRowError(
          requestId,
          result.error ?? 'Rejection failed. Please try again.',
        );
      } else {
        router.refresh();
      }
      setPendingId(null);
    });
  }

  if (requests.length === 0) {
    return (
      <Card className="border-2 border-dashed border-border/50 bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            No Pending Requests
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => {
        const isRowPending = isPending && pendingId === req.id;
        const rowError = rowStates[req.id]?.error ?? null;

        return (
          <Card
            key={req.id}
            className="border-2 border-border/50 transition-all duration-200 hover:border-accent/30"
          >
            <CardHeader className="pb-2">
              <CardTitle
                className="text-sm font-bold uppercase tracking-widest text-foreground"
                style={{ fontFamily: 'monospace' }}
              >
                {req.email}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Submitter metadata */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span className="font-semibold uppercase tracking-wider">
                    Name
                  </span>{' '}
                  {req.name}
                </span>
                <span>
                  <span className="font-semibold uppercase tracking-wider">
                    Casino
                  </span>{' '}
                  {req.casino_name}
                </span>
                <span>
                  <span className="font-semibold uppercase tracking-wider">
                    Role
                  </span>{' '}
                  {req.role}
                </span>
                {req.estimated_table_count != null && (
                  <span>
                    <span className="font-semibold uppercase tracking-wider">
                      Tables
                    </span>{' '}
                    <Badge
                      variant="outline"
                      className="ml-1 border-accent/30 bg-accent/10 text-accent"
                    >
                      {req.estimated_table_count}
                    </Badge>
                  </span>
                )}
                <span
                  className="tabular-nums"
                  style={{ fontFamily: 'monospace' }}
                >
                  {new Date(req.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>

              {/* Optional message */}
              {req.message && (
                <p className="line-clamp-2 text-xs text-muted-foreground/80 italic">
                  &ldquo;{req.message}&rdquo;
                </p>
              )}

              {/* Inline error */}
              {rowError && (
                <p className="text-xs text-destructive">{rowError}</p>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 border-accent/40 bg-accent/5 text-xs font-semibold uppercase tracking-wider text-accent hover:border-accent/60 hover:bg-accent/10"
                  disabled={isRowPending}
                  onClick={() => handleApprove(req.id)}
                >
                  {isRowPending && pendingId === req.id
                    ? 'Approving…'
                    : 'Approve'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider text-destructive hover:text-destructive"
                  disabled={isRowPending}
                  onClick={() => handleReject(req.id)}
                >
                  {isRowPending && pendingId === req.id
                    ? 'Rejecting…'
                    : 'Reject'}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
