import { Coins } from 'lucide-react';

import { SettingsContentSection } from '@/components/admin/settings-content-section';
import { ValuationSettingsForm } from '@/components/admin/valuation-settings-form';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoyaltyPage() {
  return (
    <SettingsContentSection
      title="Loyalty"
      desc="Point valuation, earning rates, and promotional economics."
      icon={Coins}
    >
      <div className="space-y-6">
        <div>
          <h4
            className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Point Redemption
          </h4>
          <ValuationSettingsForm />
        </div>

        <Card className="border-2 border-dashed border-border/50">
          <CardHeader>
            <CardTitle
              className="text-sm font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              Point Earning
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Earn rate configuration — available in a future release.
            </p>
          </CardHeader>
        </Card>

        <Card className="border-2 border-dashed border-border/50">
          <CardHeader>
            <CardTitle
              className="text-sm font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              Promo Rules
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Promotional rules — available in a future release.
            </p>
          </CardHeader>
        </Card>
      </div>
    </SettingsContentSection>
  );
}
