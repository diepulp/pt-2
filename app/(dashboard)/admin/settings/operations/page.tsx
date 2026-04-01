import { Clock } from 'lucide-react';

import { SettingsContentSection } from '@/components/admin/settings-content-section';
import { ShiftSettingsForm } from '@/components/admin/shift-settings-form';

export default function OperationsPage() {
  return (
    <SettingsContentSection
      title="Casino Operations"
      desc="Foundational parameters that define how the casino day operates."
      icon={Clock}
    >
      <ShiftSettingsForm />
    </SettingsContentSection>
  );
}
