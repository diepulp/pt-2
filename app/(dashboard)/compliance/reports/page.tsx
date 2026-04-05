import { FileText } from 'lucide-react';

import { SettingsContentSection } from '@/components/admin/settings-content-section';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export default function ComplianceReportsPage() {
  return (
    <SettingsContentSection
      title="Reports"
      desc="Regulatory compliance reports, CTR filings, and audit exports."
      icon={FileText}
    >
      <Card className="border-2 border-dashed border-border/50 bg-muted/20">
        <CardHeader className="flex flex-col items-center justify-center py-12">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest text-muted-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Coming Soon
          </CardTitle>
          <p className="mt-2 text-xs text-muted-foreground">
            Compliance reporting and CTR export — available in a future release.
          </p>
        </CardHeader>
      </Card>
    </SettingsContentSection>
  );
}
