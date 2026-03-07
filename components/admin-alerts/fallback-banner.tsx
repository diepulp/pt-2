import { ClockIcon } from 'lucide-react';

import type { AlertTimeSource } from '@/hooks/admin/use-alert-time-window';

interface FallbackBannerProps {
  source: AlertTimeSource;
}

export function FallbackBanner({ source }: FallbackBannerProps) {
  if (source !== 'fallback_8h') return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
      <ClockIcon className="h-3.5 w-3.5 shrink-0" />
      <span>
        Showing alerts from the last 8 hours. Shift-aware time window will be
        available when shift configuration is complete.
      </span>
    </div>
  );
}
