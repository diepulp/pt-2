import { Clock, LayoutGrid } from 'lucide-react';

import { PitConfigurationPanel } from '@/components/admin/pit-configuration-panel';
import { SettingsContentSection } from '@/components/admin/settings-content-section';
import { ShiftSettingsForm } from '@/components/admin/shift-settings-form';
import { Separator } from '@/components/ui/separator';

export default function OperationsPage() {
  return (
    <SettingsContentSection
      title="Casino Operations"
      desc="Foundational parameters for the gaming day and pit configuration."
      icon={Clock}
    >
      <div className="space-y-10">
        <ShiftSettingsForm />

        <Separator />

        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <LayoutGrid className="h-5 w-5 text-accent" />
            <h4
              className="text-lg font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Pit Configuration
            </h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Assign, move, and clear gaming tables across pit slots in the active
            floor-layout version.
          </p>
          <PitConfigurationPanel />
        </section>
      </div>
    </SettingsContentSection>
  );
}
