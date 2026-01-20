'use client';

import { BarChart3, TrendingUp } from 'lucide-react';
import * as React from 'react';

import { usePlayerDashboard } from '@/hooks/ui/use-player-dashboard';
import { cn } from '@/lib/utils';

import { UnderDevelopmentIndicator } from './under-development-indicator';

interface MetricsPanelProps {
  className?: string;
}

export function MetricsPanel({ className }: MetricsPanelProps) {
  const { selectedPlayerId } = usePlayerDashboard();

  if (!selectedPlayerId) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full',
          className,
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        <div className="flex flex-col items-center justify-center h-full p-8">
          <div className="w-16 h-16 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center mb-4">
            <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            No metrics available
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Select a player to view performance
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm flex flex-col',
        className,
      )}
    >
      {/* LED accent strip */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/20">
            <TrendingUp className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">
            Performance Metrics
          </h3>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        <UnderDevelopmentIndicator
          feature="Player Analytics"
          description="Historical performance, session trends, and statistical analysis"
        />
      </div>
    </div>
  );
}
