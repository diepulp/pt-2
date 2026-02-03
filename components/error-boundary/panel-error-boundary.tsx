/**
 * Panel Error Boundary
 *
 * Isolates panel-level failures so a single panel crash
 * (LeftRail, Center, RightRail) doesn't take down the entire page.
 * Integrates with TanStack Query's QueryErrorResetBoundary for
 * query-related error recovery.
 *
 * @see ADR-012 Error Handling Architecture
 * @see PERF-006 WS2 — Error Boundaries & Route Resilience
 */

'use client';

import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  getErrorMessage,
  isRetryableError,
  logError,
} from '@/lib/errors/error-utils';
import { cn } from '@/lib/utils';

// === Types ===

interface PanelErrorBoundaryProps {
  children: ReactNode;
  /** Panel name for error context (e.g., "Timeline", "Metrics", "Collaboration") */
  panelName: string;
  className?: string;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// === Fallback UI ===

function PanelErrorFallback({
  error,
  panelName,
  onReset,
  className,
}: {
  error: Error;
  panelName: string;
  onReset: () => void;
  className?: string;
}) {
  const message = getErrorMessage(error);
  const retryable = isRetryableError(error);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-6 min-h-[200px]',
        className,
      )}
      role="alert"
    >
      <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-3">
        <AlertCircle className="h-6 w-6 text-red-400/70" />
      </div>

      <h4 className="text-sm font-medium text-foreground mb-1">
        {panelName} unavailable
      </h4>

      <p className="text-xs text-muted-foreground max-w-[240px] mb-4">
        {message}
      </p>

      {retryable && (
        <Button variant="outline" size="sm" onClick={onReset} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

// === Error Boundary Class ===

class PanelErrorBoundaryInner extends Component<
  PanelErrorBoundaryProps & { onReset?: () => void },
  PanelErrorBoundaryState
> {
  constructor(props: PanelErrorBoundaryProps & { onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error): void {
    logError(error, {
      component: 'PanelErrorBoundary',
      action: 'componentDidCatch',
      metadata: { panelName: this.props.panelName },
    });
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <PanelErrorFallback
          error={this.state.error}
          panelName={this.props.panelName}
          onReset={this.handleReset}
          className={this.props.className}
        />
      );
    }

    return this.props.children;
  }
}

// === Public Wrapper with QueryErrorResetBoundary ===

/**
 * Panel-level error boundary that isolates failures and integrates
 * with TanStack Query for query error recovery.
 *
 * @example
 * ```tsx
 * <PanelErrorBoundary panelName="Timeline">
 *   <TimelinePanel />
 * </PanelErrorBoundary>
 * ```
 */
export function PanelErrorBoundary({
  children,
  panelName,
  className,
}: PanelErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <PanelErrorBoundaryInner
          panelName={panelName}
          className={className}
          onReset={reset}
        >
          {children}
        </PanelErrorBoundaryInner>
      )}
    </QueryErrorResetBoundary>
  );
}
