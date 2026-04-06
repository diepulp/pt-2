import { ShieldAlert } from 'lucide-react';

import { SettingsContentSection } from '@/components/admin/settings-content-section';
import { ThresholdSettingsForm } from '@/components/admin/threshold-settings-form';

export default function AnomalyDetectionSettingsPage() {
  return (
    <SettingsContentSection
      title="Detection Settings"
      desc="Statistical thresholds for automated anomaly detection and alerting."
      icon={ShieldAlert}
    >
      <ThresholdSettingsForm />
    </SettingsContentSection>
  );
}
