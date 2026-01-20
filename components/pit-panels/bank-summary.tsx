'use client';

import { TrendingUp, TrendingDown, Banknote, Layers } from 'lucide-react';

import { cn } from '@/lib/utils';

interface BankSummaryProps {
  totalValue: number;
  totalChips: number;
  variance: number;
}

/**
 * Bank summary card with LED-accent styling
 * Displays total bank value and chip count with variance indicator
 */
export function BankSummary({
  totalValue,
  totalChips,
  variance,
}: BankSummaryProps) {
  const isPositive = variance >= 0;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm">
      {/* Top LED accent strip */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-0.5',
          isPositive
            ? 'bg-gradient-to-r from-transparent via-cyan-500 to-transparent'
            : 'bg-gradient-to-r from-transparent via-red-500 to-transparent',
        )}
      />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Bank Summary
          </h3>
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono',
              isPositive
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                : 'bg-red-500/10 text-red-400 border border-red-500/30',
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>
              {isPositive ? '+' : ''}
              {variance.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Total Value */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Banknote className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">
                Total Value
              </span>
            </div>
            <div className="font-mono text-2xl font-bold tracking-tight text-foreground">
              ${totalValue.toLocaleString()}
            </div>
          </div>

          {/* Total Chips */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">
                Total Chips
              </span>
            </div>
            <div className="font-mono text-2xl font-bold tracking-tight text-foreground">
              {totalChips.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Subtle grid pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
    </div>
  );
}
