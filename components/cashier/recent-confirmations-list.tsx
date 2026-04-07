'use client';

/**
 * Recent Confirmations List
 *
 * Shows recently confirmed fills/credits for the current gaming day.
 * Read-only display of completed confirmations.
 *
 * @see PRD-033 Cashier Workflow MVP
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  TableCreditDTO,
  TableFillDTO,
} from '@/services/table-context/dtos';

import { AmountDisplay } from './amount-display';

interface RecentConfirmationsListProps {
  fills: TableFillDTO[];
  credits: TableCreditDTO[];
}

export function RecentConfirmationsList({
  fills,
  credits,
}: RecentConfirmationsListProps) {
  const confirmedFills = fills.filter((f) => f.status === 'confirmed');
  const confirmedCredits = credits.filter((c) => c.status === 'confirmed');
  const total = confirmedFills.length + confirmedCredits.length;

  return (
    <Card className="border-2 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Recent Confirmations
          </CardTitle>
          <Badge variant="secondary">{total}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              No Confirmations Yet
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {confirmedFills.map((fill) => (
              <div
                key={fill.id}
                className="flex items-center justify-between rounded-lg border-2 border-border/30 bg-card/30 p-2.5 transition-all hover:border-accent/30"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium font-mono">
                      Table: {fill.table_id.slice(0, 8)}...
                    </span>
                    <Badge
                      variant="outline"
                      className="bg-green-500/10 text-green-400 border-green-500/30"
                    >
                      Fill Confirmed
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono tabular-nums">
                    <AmountDisplay
                      cents={fill.confirmed_amount_cents ?? fill.amount_cents}
                    />
                    {fill.confirmed_at &&
                      ` — ${new Date(fill.confirmed_at).toLocaleTimeString()}`}
                    {fill.discrepancy_note && (
                      <span className="text-amber-500">
                        {' '}
                        (Discrepancy noted)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {confirmedCredits.map((credit) => (
              <div
                key={credit.id}
                className="flex items-center justify-between rounded-lg border-2 border-border/30 bg-card/30 p-2.5 transition-all hover:border-accent/30"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium font-mono">
                      Table: {credit.table_id.slice(0, 8)}...
                    </span>
                    <Badge
                      variant="outline"
                      className="bg-blue-500/10 text-blue-400 border-blue-500/30"
                    >
                      Credit Confirmed
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono tabular-nums">
                    <AmountDisplay
                      cents={
                        credit.confirmed_amount_cents ?? credit.amount_cents
                      }
                    />
                    {credit.confirmed_at &&
                      ` — ${new Date(credit.confirmed_at).toLocaleTimeString()}`}
                    {credit.discrepancy_note && (
                      <span className="text-amber-500">
                        {' '}
                        (Discrepancy noted)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
