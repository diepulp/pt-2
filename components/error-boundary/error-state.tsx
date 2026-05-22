'use client';

import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  getErrorCode,
  getErrorMessage,
  isAuthError,
  isRetryableError,
  logError,
} from '@/lib/errors/error-utils';

interface ErrorStateProps {
  error: Error;
  reset?: () => void;
  variant: 'full-page' | 'panel' | 'inline';
  panelName?: string;
}

export function ErrorState({
  error,
  reset,
  variant,
  panelName,
}: ErrorStateProps) {
  const router = useRouter();
  const message = getErrorMessage(error);
  const code = getErrorCode(error);
  const retryable = isRetryableError(error);

  useEffect(() => {
    logError(error, {
      component: 'ErrorState',
      action: 'render',
      metadata: { variant, panelName },
    });
  }, [error, variant, panelName]);

  useEffect(() => {
    if (isAuthError(error)) {
      router.push('/auth/login');
    }
  }, [error, router]);

  if (isAuthError(error)) {
    return null;
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 py-1" role="alert">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        <span className="text-xs text-destructive">{message}</span>
        {retryable && reset && (
          <button
            onClick={reset}
            className="text-xs text-accent underline hover:no-underline"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (variant === 'panel') {
    return (
      <div
        className="flex flex-col items-center justify-center text-center p-6 min-h-[200px]"
        role="alert"
      >
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-3">
          <AlertCircle className="h-6 w-6 text-red-400/70" />
        </div>
        <h4
          className="text-sm font-bold uppercase tracking-widest text-foreground mb-1"
          style={{ fontFamily: 'monospace' }}
        >
          {panelName ? `${panelName} unavailable` : 'Section unavailable'}
        </h4>
        <p className="text-xs text-muted-foreground max-w-[240px] mb-4">
          {message}
        </p>
        {retryable && reset && (
          <Button variant="outline" size="sm" onClick={reset} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  // full-page
  return (
    <div
      className="flex min-h-screen items-center justify-center p-8 bg-background"
      role="alert"
    >
      <Card className="w-full max-w-md border-2 border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-col items-center pt-8 pb-6 text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
            <AlertCircle className="h-7 w-7 text-red-400/70" />
          </div>
          <h2
            className="text-sm font-bold uppercase tracking-widest text-foreground mb-2"
            style={{ fontFamily: 'monospace' }}
          >
            Something went wrong
          </h2>
          <p className="text-xs text-muted-foreground max-w-[320px] mb-2">
            {message}
          </p>
          {code && (
            <p
              className="text-[10px] text-muted-foreground/60 mb-5"
              style={{ fontFamily: 'monospace' }}
            >
              Error code: {code}
            </p>
          )}
          <div className="flex items-center gap-2">
            {retryable && reset && (
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
            >
              <ArrowLeft className="h-3 w-3" />
              Go back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
