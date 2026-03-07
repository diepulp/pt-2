'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '@/hooks/use-auth';

const ADMIN_ROLES = new Set(['admin', 'pit_boss']);

/**
 * Client-side admin role guard (UX-only — NOT a security boundary).
 * Redirects non-admin users to shift-dashboard with a toast param.
 * Server-side enforcement is in app/(dashboard)/admin/layout.tsx.
 */
export function useAdminGuard() {
  const { staffRole, isLoading } = useAuth();
  const router = useRouter();

  const isAuthorized = staffRole !== null && ADMIN_ROLES.has(staffRole);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthorized) {
      router.replace('/shift-dashboard?toast=admin_required');
    }
  }, [isLoading, isAuthorized, router]);

  return { isLoading, isAuthorized };
}
