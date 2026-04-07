'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePromoCouponInventory } from '@/hooks/loyalty/promo-instruments/use-promo-coupons';
import { formatCents } from '@/lib/format';
import type { CouponInventoryRow } from '@/services/loyalty/promo/dtos';

/** Badge variant per coupon status */
function statusBadgeVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'issued':
      return 'default';
    case 'voided':
      return 'destructive';
    case 'replaced':
      return 'secondary';
    case 'expired':
      return 'outline';
    case 'cleared':
      return 'secondary';
    default:
      return 'outline';
  }
}

interface InventorySummaryProps {
  promoProgramId: string;
}

/**
 * Displays coupon inventory breakdown by status for a given promo program.
 * Renders a card with a row per coupon status showing count and face value totals.
 */
export function InventorySummary({ promoProgramId }: InventorySummaryProps) {
  const { data, isLoading, isError, error } = usePromoCouponInventory({
    promoProgramId,
  });

  if (isLoading) {
    return (
      <Card data-testid="inventory-summary-loading">
        <CardHeader>
          <CardTitle>Coupon Inventory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card data-testid="inventory-summary-error">
        <CardHeader>
          <CardTitle>Coupon Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load inventory
            {error instanceof Error ? `: ${error.message}` : '.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const rows: CouponInventoryRow[] = data?.inventory ?? [];
  const totalCount = rows.reduce((sum, r) => sum + r.couponCount, 0);
  const totalFace = rows.reduce((sum, r) => sum + r.totalFaceValue, 0);

  return (
    <Card data-testid="inventory-summary">
      <CardHeader>
        <CardTitle>Coupon Inventory</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No coupons have been issued for this program yet.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.status}
                className="flex items-center justify-between"
                data-testid={`inventory-row-${row.status}`}
              >
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadgeVariant(row.status)}>
                    {row.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {row.couponCount} coupon{row.couponCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-right text-sm">
                  <span className="font-medium">
                    {formatCents(row.totalFaceValue)}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    / {formatCents(row.totalMatchWager)} match
                  </span>
                </div>
              </div>
            ))}
            <div className="border-t pt-3 flex items-center justify-between font-medium text-sm">
              <span>Total: {totalCount} coupons</span>
              <span>{formatCents(totalFace)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
