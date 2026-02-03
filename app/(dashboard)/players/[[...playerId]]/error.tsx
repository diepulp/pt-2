/**
 * Player 360 Route Error Boundary
 *
 * Next.js App Router error boundary for the Player 360 route.
 * Catches uncaught exceptions and provides recovery UI.
 *
 * @see ADR-012 Error Handling Architecture
 * @see PERF-006 WS2 — Error Boundaries & Route Resilience
 */

'use client';

import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  getErrorMessage,
  isRetryableError,
  logError,
} from '@/lib/errors/error-utils';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Player360Error({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    logError(error, { component: 'Player360Error', action: 'render' });
  }, [error]);

  const message = getErrorMessage(error);
  const retryable = isRetryableError(error);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8">
      <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-6">
        <AlertCircle className="h-8 w-8 text-red-400/70" />
      </div>

      <h2 className="text-lg font-semibold text-foreground mb-2">
        Something went wrong
      </h2>

      <p className="text-sm text-muted-foreground max-w-md text-center mb-2">
        {message}
      </p>

      {error.digest && (
        <p className="text-[10px] font-mono text-muted-foreground/60 mb-6">
          Error ID: {error.digest}
        </p>
      )}

      <div className="flex items-center gap-3">
        {retryable && (
          <Button variant="default" size="sm" onClick={reset} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        )}

        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/players">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to players
          </Link>
        </Button>
      </div>
    </div>
  );
}
