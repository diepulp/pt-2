/**
 * Stats Bar Component
 *
 * Displays aggregate dashboard statistics:
 * - Active tables count
 * - Open slips count
 * - Checked-in players count
 * - Current gaming day
 *
 * Design: Brutalist aesthetic with monospace typography,
 * exposed structure, high contrast.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS2
 */

'use client';

import * as React from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatsBarProps {
  activeTablesCount: number;
  openSlipsCount: number;
  checkedInPlayersCount: number;
  gamingDay: string | null;
  isLoading?: boolean;
}

interface StatCardProps {
  label: string;
  value: number | string;
  isLoading?: boolean;
  variant?: 'default' | 'accent';
}

function StatCard({
  label,
  value,
  isLoading,
  variant = 'default',
}: StatCardProps) {
  return (
    <Card
      className={cn(
        'flex-1 border-2 transition-all duration-200',
        variant === 'accent'
          ? 'border-accent/50 bg-accent/5 hover:border-accent/70'
          : 'border-border hover:border-accent/30',
        isLoading && 'animate-pulse',
      )}
    >
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              'text-xs font-bold uppercase tracking-widest',
              variant === 'accent' ? 'text-accent' : 'text-muted-foreground',
            )}
            style={{ fontFamily: 'monospace' }}
          >
            {label}
          </div>
          <div
            className={cn(
              'text-3xl sm:text-4xl font-bold tabular-nums',
              variant === 'accent' ? 'text-accent' : 'text-foreground',
            )}
            style={{
              fontFamily: 'monospace',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {isLoading ? '—' : value}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function StatsBar({
  activeTablesCount,
  openSlipsCount,
  checkedInPlayersCount,
  gamingDay,
  isLoading = false,
}: StatsBarProps) {
  return (
    <div className="space-y-4">
      {/* Gaming Day Header */}
      {gamingDay && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="text-sm font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              Gaming Day
            </div>
            <div
              className="rounded-md border-2 border-accent/50 bg-accent/10 px-3 py-1 text-base font-bold text-accent"
              style={{ fontFamily: 'monospace' }}
            >
              {gamingDay}
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Active Tables"
          value={activeTablesCount}
          isLoading={isLoading}
          variant="accent"
        />
        <StatCard
          label="Open Slips"
          value={openSlipsCount}
          isLoading={isLoading}
        />
        <StatCard
          label="Players"
          value={checkedInPlayersCount}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
