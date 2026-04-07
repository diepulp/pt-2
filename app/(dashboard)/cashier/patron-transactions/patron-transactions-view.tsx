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
          <Card className="border-2 border-dashed border-border/50 bg-muted/20">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div
                className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                style={{ fontFamily: 'monospace' }}
              >
                Select a Player
              </div>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Search for a player with an active visit to create a cash-out.
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
    return (
      <Card className="border-2 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Recent Cash-Outs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-muted/50"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
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
    <Card className="border-2 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Recent Cash-Outs
          </CardTitle>
          <Badge variant="secondary">{originals.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {originals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              No Cash-Outs Today
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {originals.map((txn) => {
              const isVoided = voidedIds.has(txn.id);

              return (
                <div
                  key={txn.id}
                  className={`group relative flex items-center justify-between rounded-lg border-2 p-3 transition-all ${
                    isVoided
                      ? 'border-destructive/20 bg-destructive/5'
                      : 'border-border/30 bg-card/30 hover:border-accent/30'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <AmountDisplay
                        cents={txn.amount}
                        className={
                          isVoided
                            ? 'font-mono text-sm font-medium tabular-nums line-through text-muted-foreground'
                            : 'font-mono text-sm font-medium tabular-nums'
                        }
                      />
                      <Badge
                        variant="outline"
                        className={
                          isVoided
                            ? 'bg-red-500/10 text-destructive border-destructive/30'
                            : 'bg-green-500/10 text-green-400 border-green-500/30'
                        }
                      >
                        {isVoided ? 'Voided' : 'Confirmed'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono tabular-nums">
                      {new Date(txn.created_at).toLocaleTimeString()}
                      {txn.external_ref && ` — Ref: ${txn.external_ref}`}
                    </div>
                  </div>

                  {!isVoided && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider text-destructive hover:text-destructive"
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
