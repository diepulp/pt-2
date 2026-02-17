import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

/**
 * Patron Transactions Page
 *
 * Placeholder for cash-out confirmation (requires PRD-009 integration).
 *
 * @see PRD-033 Cashier Workflow MVP
 */
export default function PatronTransactionsPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle>Patron Cash-Out Confirmation</CardTitle>
          <Badge variant="secondary">Coming Soon</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Patron cash-out confirmation will be available once the financial
          transaction API is integrated. This screen will allow cashiers to
          confirm patron cash-out amounts and generate receipt references.
        </p>
      </CardContent>
    </Card>
  );
}
