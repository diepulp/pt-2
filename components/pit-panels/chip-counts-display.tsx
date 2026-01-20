'use client';

import { Calculator, TrendingUp, TrendingDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { ChipDenomination } from './chip-denomination';

interface ChipCount {
  denomination: number;
  quantity: number;
  value: number;
  variance?: number;
}

interface ChipCountsDisplayProps {
  chips: ChipCount[];
}

/**
 * Chip counts display with casino-inspired styling
 * Each row shows denomination chip, count, value, and variance
 */
export function ChipCountsDisplay({ chips }: ChipCountsDisplayProps) {
  return (
    <div className="space-y-3">
      {chips.map((chip) => (
        <div
          key={chip.denomination}
          className={cn(
            'group relative overflow-hidden',
            'flex items-center gap-4 p-4',
            'rounded-lg border border-border/40',
            'bg-gradient-to-r from-card/80 to-card/40',
            'backdrop-blur-sm',
            'transition-all duration-300',
            'hover:border-accent/30 hover:bg-card/60',
          )}
        >
          {/* Left accent line */}
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          {/* Chip denomination badge */}
          <ChipDenomination value={chip.denomination} />

          {/* Chip info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-lg font-semibold text-foreground">
                {chip.quantity.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">chips</span>
            </div>
            <div className="font-mono text-sm text-muted-foreground">
              ${chip.value.toLocaleString()}
            </div>
          </div>

          {/* Variance indicator */}
          {chip.variance !== undefined && chip.variance !== 0 && (
            <div
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded',
                'font-mono text-sm font-medium',
                chip.variance > 0
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-red-400 bg-red-500/10',
              )}
            >
              {chip.variance > 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              <span>{Math.abs(chip.variance)}%</span>
            </div>
          )}

          {/* Count button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-accent hover:bg-accent/10"
          >
            <Calculator className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
