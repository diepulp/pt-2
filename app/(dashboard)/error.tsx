'use client';

import { useEffect } from 'react';

import { ErrorState } from '@/components/error-boundary';
import { logError } from '@/lib/errors/error-utils';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, {
      component: 'route-error-boundary',
      action: 'render-error',
      metadata: { digest: error.digest, route: 'dashboard' },
    });
  }, [error]);

  return <ErrorState error={error} reset={reset} variant="full-page" />;
}
