'use client';

/**
 * Patron Transactions View
 *
 * Client component for cashier cash-out workflow:
 * 1. Search player and select active visit
 * 2. Create cash-out confirmation (dollars → cents, idempotent)
 * 3. View recent cash-outs for current gaming day
 * 4. Void a cash-out with reason code and note
 *
 * @see PRD-033 WS5 Patron Transactions
 * @see GAP-PRD033-PATRON-CASHOUT-UI
 */

import { useCallback, useState } from 'react';

import { AmountDisplay } from '@/components/cashier/amount-display';
import { CashOutForm } from '@/components/cashier/cash-out-form';
import {
  PlayerVisitSearch,
  type SelectedVisitContext,
} from '@/components/cashier/player-visit-search';
import { VoidConfirmationDialog } from '@/components/cashier/void-confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCashOutCreate,
  useRecentCashOuts,
  useVoidCashOut,
} from '@/hooks/cashier/use-patron-transactions';
import { useAuth } from '@/hooks/use-auth';
import type { FinancialTransactionDTO } from '@/services/player-financial/dtos';

export function PatronTransactionsView() {
  const { staffId, casinoId } = useAuth();

  const [visitContext, setVisitContext] = useState<SelectedVisitContext | null>(
    null,
  );

  const [voidTarget, setVoidTarget] = useState<FinancialTransactionDTO | null>(
    null,
  );

  // All hooks share the same gamingDay (undefined = no date filter, current day via API default)
  const recentCashOuts = useRecentCashOuts();
  const cashOutCreate = useCashOutCreate();
  const voidCashOut = useVoidCashOut();

  const handleSelectVisit = useCallback((ctx: SelectedVisitContext | null) => {
    setVisitContext(ctx);
  }, []);

  const handleCashOut = useCallback(
    (params: { amountCents: number; externalRef?: string }) => {
      if (!visitContext || !staffId || !casinoId) return;

      cashOutCreate.mutate({
        casino_id: casinoId,
        player_id: visitContext.player_id,
        visit_id: visitContext.visit_id,
        amount_cents: params.amountCents,
        created_by_staff_id: staffId,
        external_ref: params.externalRef,
      });
    },
    [visitContext, staffId, casinoId, cashOutCreate],
  );

  const handleVoid = useCallback(
    (params: {
      original_txn_id: string;
      reason_code:
        | 'data_entry_error'
        | 'duplicate'
        | 'wrong_player'
        | 'wrong_amount'
        | 'system_bug'
        | 'other';
      note: string;
    }) => {
      if (!voidTarget || !casinoId) return;

      voidCashOut.mutate({
        casino_id: casinoId,
        player_id: voidTarget.player_id,
        visit_id: voidTarget.visit_id,
        original_txn_id: params.original_txn_id,
        amount_cents: voidTarget.amount,
        reason_code: params.reason_code,
        note: params.note,
      });
      setVoidTarget(null);
    },
    [voidTarget, casinoId, voidCashOut],
  );

  return (
    <div className="space-y-6">
      {/* Player search + cash-out form */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PlayerVisitSearch onSelect={handleSelectVisit} />

        {visitContext ? (
          <CashOutForm
            playerName={visitContext.player_name}
            visitId={visitContext.visit_id}
            disabled={!staffId || !casinoId}
            onSubmit={handleCashOut}
          />
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cash-Out Confirmation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground py-4 text-center">
                Select a player with an active visit to create a cash-out.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent cash-outs */}
      <RecentCashOutsList
        transactions={recentCashOuts.data}
        isLoading={recentCashOuts.isLoading}
        onVoid={(txn) => setVoidTarget(txn)}
      />

      {/* Void dialog */}
      <VoidConfirmationDialog
        open={!!voidTarget}
        onOpenChange={(open) => {
          if (!open) setVoidTarget(null);
        }}
        transaction={voidTarget}
        onVoid={handleVoid}
      />
    </div>
  );
}

// === Recent Cash-Outs List ===

function RecentCashOutsList({
  transactions,
  isLoading,
  onVoid,
}: {
  transactions: FinancialTransactionDTO[] | undefined;
  isLoading: boolean;
  onVoid: (txn: FinancialTransactionDTO) => void;
}) {
  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const items = transactions ?? [];
  const originals = items.filter((t) => t.txn_kind === 'original');
  const voidedIds = new Set(
    items
      .filter((t) => t.txn_kind === 'adjustment' || t.txn_kind === 'reversal')
      .map((t) => t.related_transaction_id)
      .filter(Boolean),
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recent Cash-Outs</CardTitle>
          <Badge variant="secondary">{originals.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {originals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No cash-outs recorded today.
          </p>
        ) : (
          <div className="space-y-2">
            {originals.map((txn) => {
              const isVoided = voidedIds.has(txn.id);

              return (
                <div
                  key={txn.id}
                  className="flex items-center justify-between border border-border rounded-lg p-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <AmountDisplay
                        cents={txn.amount}
                        className={
                          isVoided
                            ? 'text-sm font-medium line-through text-muted-foreground'
                            : 'text-sm font-medium'
                        }
                      />
                      <Badge
                        variant="outline"
                        className={
                          isVoided
                            ? 'text-[10px] text-destructive border-destructive/30'
                            : 'text-[10px] text-emerald-500 border-emerald-500/30'
                        }
                      >
                        {isVoided ? 'Voided' : 'Confirmed'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(txn.created_at).toLocaleTimeString()}
                      {txn.external_ref && ` — Ref: ${txn.external_ref}`}
                    </div>
                  </div>

                  {!isVoided && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-destructive hover:text-destructive"
                      onClick={() => onVoid(txn)}
                    >
                      Void
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
