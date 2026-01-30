/**
 * Player Dashboard - DEPRECATED
 *
 * This component is deprecated. With PRD-022-PATCH-OPTION-B (embedded search),
 * player search is now integrated directly into the Player 360 view at /players.
 *
 * If you're importing this component, you should migrate to using the
 * catch-all route at /players/[[...playerId]] which includes embedded search.
 *
 * @deprecated Use /players route with embedded search instead.
 * @see PRD-022-PATCH-OPTION-B Embedded Search
 */

'use client';

import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { cn } from '@/lib/utils';

interface PlayerDashboardProps {
  className?: string;
}

/**
 * @deprecated This component is deprecated. The player search is now
 * embedded directly in the Player 360 view. This component will redirect
 * to /players automatically.
 */
export function PlayerDashboard({ className }: PlayerDashboardProps) {
  const router = useRouter();

  // Redirect to the new /players route after component mount
  useEffect(() => {
    // Small delay to allow the deprecation notice to be seen (dev only)
    const timer = setTimeout(() => {
      router.replace('/players');
    }, 100);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className={cn('space-y-4', className)} data-testid="player-dashboard">
      <DeprecationNotice />
    </div>
  );
}

/**
 * Notice shown briefly before redirect.
 */
function DeprecationNotice() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-amber-500/40 bg-amber-500/10 backdrop-blur-sm p-6">
      <div className="flex items-start gap-4">
        <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-amber-200 mb-2">
            Component Deprecated
          </h3>
          <p className="text-sm text-amber-100/80 mb-2">
            The PlayerDashboard component has been replaced with embedded search
            in Player 360. Redirecting to /players...
          </p>
          <p className="text-xs text-amber-100/60">
            See PRD-022-PATCH-OPTION-B for migration details.
          </p>
        </div>
      </div>
    </div>
  );
}
