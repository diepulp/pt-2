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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recent Confirmations</CardTitle>
          <Badge variant="secondary">{total}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No confirmations yet today.
          </p>
        ) : (
          <div className="space-y-2">
            {confirmedFills.map((fill) => (
              <div
                key={fill.id}
                className="flex items-center justify-between border border-border rounded-lg p-2.5"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Table: {fill.table_id.slice(0, 8)}...
                    </span>
                    <Badge
                      variant="outline"
                      className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    >
                      Fill Confirmed
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <AmountDisplay
                      cents={fill.confirmed_amount_cents ?? fill.amount_cents}
                    />
                    {fill.confirmed_at &&
                      ` — ${new Date(fill.confirmed_at).toLocaleTimeString()}`}
                    {fill.discrepancy_note && (
                      <span className="text-amber-600">
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
                className="flex items-center justify-between border border-border rounded-lg p-2.5"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Table: {credit.table_id.slice(0, 8)}...
                    </span>
                    <Badge
                      variant="outline"
                      className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20"
                    >
                      Credit Confirmed
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <AmountDisplay
                      cents={
                        credit.confirmed_amount_cents ?? credit.amount_cents
                      }
                    />
                    {credit.confirmed_at &&
                      ` — ${new Date(credit.confirmed_at).toLocaleTimeString()}`}
                    {credit.discrepancy_note && (
                      <span className="text-amber-600">
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
