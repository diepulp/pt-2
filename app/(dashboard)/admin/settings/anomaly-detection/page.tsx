import { ShieldAlert } from 'lucide-react';

import { ThresholdSettingsForm } from '@/components/admin/threshold-settings-form';

export default function AnomalyDetectionPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="h-5 w-5 text-accent" />
          <h3
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Anomaly Detection
          </h3>
        </div>
        <p className="pl-[30px] text-xs text-muted-foreground">
          Statistical thresholds for automated anomaly detection and alerting.
        </p>
      </div>
      <ThresholdSettingsForm />
    </div>
  );
}
