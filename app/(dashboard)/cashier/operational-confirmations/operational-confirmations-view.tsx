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
import { Skeleton } from '@/components/ui/skeleton';
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
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
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
