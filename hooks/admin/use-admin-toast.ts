'use client';

import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Consumes the `?toast=admin_required` search param and shows a toast.
 * Strips the param from the URL to prevent re-trigger on refresh.
 */
export function useAdminToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get('toast') === 'admin_required') {
      toast.error('Admin access required', {
        description: 'You do not have permission to view that page.',
      });
      router.replace(pathname);
    }
  }, [searchParams, pathname, router]);
}
