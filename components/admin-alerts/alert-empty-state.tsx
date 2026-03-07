import { BellOffIcon } from 'lucide-react';

export function AlertEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted/50 p-4 mb-4">
        <BellOffIcon className="h-8 w-8 text-muted-foreground/50" />
      </div>
      <h3 className="text-sm font-medium text-foreground">No alerts</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
        No spike alerts in this time window. Alerts trigger when observed totals
        exceed configured thresholds.
      </p>
    </div>
  );
}
