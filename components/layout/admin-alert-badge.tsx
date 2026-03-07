'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useAdminAlertBadge } from '@/hooks/admin/use-admin-alert-badge';

/**
 * Dynamic alert badge for sidebar nav.
 * Shows skeleton while loading, nothing for 0, count for N > 0.
 * Only fires queries for admin/pit_boss roles.
 */
export function AdminAlertBadge() {
  const { count, isLoading, isAuthorized } = useAdminAlertBadge();

  if (!isAuthorized) return null;

  if (isLoading) {
    return <Skeleton className="h-5 w-5 rounded-md" />;
  }

  if (count === 0) return null;

  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-sidebar-primary/10 px-1.5 text-[10px] font-medium text-sidebar-primary tabular-nums">
      {count}
    </span>
  );
}

/**
 * Collapsed sidebar badge variant.
 * Renders a small dot/count indicator positioned absolutely.
 */
export function AdminAlertBadgeCollapsed() {
  const { count, isLoading, isAuthorized } = useAdminAlertBadge();

  if (!isAuthorized) return null;

  if (isLoading) {
    return (
      <span className="absolute -top-0.5 -right-0.5">
        <Skeleton className="h-4 w-4 rounded-full" />
      </span>
    );
  }

  if (count === 0) return null;

  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sidebar-primary px-1 text-[9px] font-medium text-sidebar-primary-foreground">
      {count > 9 ? '9+' : count}
    </span>
  );
}
