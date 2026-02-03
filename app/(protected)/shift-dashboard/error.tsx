'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function ShiftDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-6">
      <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
        <AlertCircle className="h-8 w-8 text-red-400/70" />
      </div>

      <h2 className="text-lg font-semibold tracking-tight mb-2">
        Dashboard Error
      </h2>

      <p className="text-sm text-muted-foreground max-w-md mb-6">
        The shift dashboard encountered an unexpected error. This may be a
        temporary issue — try refreshing.
      </p>

      <Button variant="outline" onClick={reset} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
