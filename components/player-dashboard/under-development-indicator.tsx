'use client';

import { Construction, Wrench } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

interface UnderDevelopmentIndicatorProps {
  /** What's being developed (e.g., "Analytics", "Compliance Tracking") */
  feature: string;
  /** Optional additional context */
  description?: string;
  /** Visual variant */
  variant?: 'overlay' | 'inline';
  className?: string;
}

/**
 * Under Development Indicator
 *
 * PT-2 dark industrial design component for features in development.
 * Subtle but clear indication without disrupting the UI structure.
 */
export function UnderDevelopmentIndicator({
  feature,
  description,
  variant = 'overlay',
  className,
}: UnderDevelopmentIndicatorProps) {
  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 border-border/50',
          className,
        )}
      >
        <Construction className="h-4 w-4 text-muted-foreground/70 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            {feature} in Development
          </p>
          {description && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Overlay variant - centered in container
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-8',
        className,
      )}
    >
      {/* Icon with subtle animation */}
      <div className="relative">
        <div className="absolute inset-0 bg-muted-foreground/10 rounded-full blur-xl animate-pulse" />
        <div className="relative w-16 h-16 rounded-full bg-muted/40 border border-border/40 flex items-center justify-center">
          <Wrench className="h-8 w-8 text-muted-foreground/50" />
        </div>
      </div>

      {/* Text */}
      <div className="text-center space-y-1">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Feature in Development
        </h4>
        <p className="text-xs text-muted-foreground/60 max-w-xs">
          {feature} is currently under development and will be available in a
          future release.
        </p>
        {description && (
          <p className="text-xs text-muted-foreground/50 mt-2">{description}</p>
        )}
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30 border border-border/30">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500/70 animate-pulse" />
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Coming Soon
        </span>
      </div>
    </div>
  );
}
