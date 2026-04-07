'use client';

/**
 * Operational Confirmations View
 *
 * Client component that fetches and displays pending fills/credits
 * with inline confirmation actions.
 *
 * @see PRD-033 Cashier Workflow MVP
 */

import {
  PendingCreditQueue,
  PendingFillQueue,
} from '@/components/cashier/pending-fill-credit-queue';
import { RecentConfirmationsList } from '@/components/cashier/recent-confirmations-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useConfirmCredit,
  useConfirmFill,
  usePendingCredits,
  usePendingFills,
} from '@/hooks/cashier/use-cashier-operations';

export function OperationalConfirmationsView() {
  const fillsQuery = usePendingFills();
  const creditsQuery = usePendingCredits();
  const confirmFill = useConfirmFill();
  const confirmCredit = useConfirmCredit();

  const isLoading = fillsQuery.isLoading || creditsQuery.isLoading;
  const fills = fillsQuery.data ?? [];
  const credits = creditsQuery.data ?? [];

  const pendingFills = fills.filter((f) => f.status === 'requested');
  const pendingCredits = credits.filter((c) => c.status === 'requested');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="border-2 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle
                  className="text-sm font-bold uppercase tracking-widest"
                  style={{ fontFamily: 'monospace' }}
                >
                  {i === 1 ? 'Pending Fills' : 'Pending Credits'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[1, 2].map((j) => (
                    <div
                      key={j}
                      className="h-16 animate-pulse rounded-lg bg-muted/50"
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <PendingFillQueue
          fills={pendingFills}
          onConfirm={(params) => confirmFill.mutate(params)}
        />
        <PendingCreditQueue
          credits={pendingCredits}
          onConfirm={(params) => confirmCredit.mutate(params)}
        />
      </div>
      <RecentConfirmationsList fills={fills} credits={credits} />
    </div>
  );
}
