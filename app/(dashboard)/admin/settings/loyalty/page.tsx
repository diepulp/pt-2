import { ValuationSettingsForm } from '@/components/admin/valuation-settings-form';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoyaltyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Loyalty</h3>
        <p className="text-sm text-muted-foreground">
          Point valuation, earning rates, and promotional economics.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-medium mb-4">Point Redemption</h4>
          <ValuationSettingsForm />
        </div>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">
              Point Earning
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Earn rate configuration — available in a future release.
            </p>
          </CardHeader>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">
              Promo Rules
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Promotional rules — available in a future release.
            </p>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
