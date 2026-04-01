import { ShiftSettingsForm } from '@/components/admin/shift-settings-form';

export default function OperationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Casino Operations</h3>
        <p className="text-sm text-muted-foreground">
          Foundational parameters that define how the casino day operates.
        </p>
      </div>
      <ShiftSettingsForm />
    </div>
  );
}
