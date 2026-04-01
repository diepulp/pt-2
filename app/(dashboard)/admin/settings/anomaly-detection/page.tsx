import { ThresholdSettingsForm } from '@/components/admin/threshold-settings-form';

export default function AnomalyDetectionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Anomaly Detection</h3>
        <p className="text-sm text-muted-foreground">
          Statistical thresholds for automated anomaly detection and alerting.
        </p>
      </div>
      <ThresholdSettingsForm />
    </div>
  );
}
