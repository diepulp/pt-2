'use client';

import {
  ArrowRight,
  CreditCard,
  History,
  Sparkles,
  TrendingDown,
  TrendingUp,
  User,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface SessionData {
  visit_id: string;
  visit_group_id: string;
  started_at: string;
  ended_at: string;
  last_table_id: string;
  last_table_name: string;
  last_seat_number: number;
  total_duration_seconds: number;
  total_buy_in: number;
  total_cash_out: number;
  net: number;
  points_earned: number;
  segment_count: number;
}

export interface PlayerInfo {
  player_id: string;
  name: string;
  tier?: string;
  card_number?: string;
}

export interface GamingDayInfo {
  /** ISO date string (YYYY-MM-DD) */
  gaming_day: string;
  /** Casino timezone used for computation */
  timezone: string;
}

export interface StartFromPreviousPanelProps {
  player: PlayerInfo;
  /** Closed sessions from the current gaming day */
  recentSessions: SessionData[];
  /** Gaming day context - sessions are scoped to this day */
  gamingDay?: GamingDayInfo;
  isLoading?: boolean;
  onStartFromPrevious?: (sourceVisitId: string) => void;
  /** Called when close/dismiss is triggered (for modal usage) */
  onClose?: () => void;
  className?: string;
  /** Render without Card wrapper (for embedding in dialogs) */
  embedded?: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatGamingDay(gamingDay: string): string {
  const date = new Date(gamingDay + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ============================================================================
// Sub-Components
// ============================================================================

function PlayerHeader({ player }: { player: PlayerInfo }) {
  return (
    <div className="flex items-center gap-4 pb-4 border-b border-border/50">
      <div className="relative">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center ring-2 ring-accent/20">
          <User className="w-6 h-6 text-accent" />
        </div>
        {player.tier && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold tracking-tight truncate">
          {player.name}
        </h2>
        <div className="flex items-center gap-2 mt-0.5">
          {player.tier && (
            <Badge
              variant="outline"
              className="text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
            >
              {player.tier}
            </Badge>
          )}
          {player.card_number && (
            <span className="text-xs text-muted-foreground font-mono">
              {player.card_number}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ClosedSessionRow({
  session,
  onStartFromPrevious,
}: {
  session: SessionData;
  onStartFromPrevious?: (visitId: string) => void;
}) {
  const isPositive = session.net >= 0;

  return (
    <div className="group relative p-4 rounded-lg border border-border/40 bg-card/50 hover:bg-card hover:border-border/60 hover:shadow-md transition-all duration-200">
      {/* Time & Duration */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="w-3.5 h-3.5" />
          <span>
            {formatDate(session.started_at)} {formatTime(session.started_at)} —{' '}
            {formatTime(session.ended_at)}
          </span>
        </div>
        <Badge variant="outline" className="text-xs font-mono tabular-nums">
          {formatDuration(session.total_duration_seconds)}
        </Badge>
      </div>

      {/* Location & Financials */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-md bg-muted/50 text-sm font-medium">
            {session.last_table_name}
          </div>
          <span className="text-xs text-muted-foreground">
            Seat {session.last_seat_number}
          </span>
          {session.segment_count > 1 && (
            <>
              <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground">
                +{session.segment_count - 1} moves
              </span>
            </>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">In:</span>
          <span className="font-medium tabular-nums">
            {formatCurrency(session.total_buy_in)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Out:</span>
          <span className="font-medium tabular-nums">
            {formatCurrency(session.total_cash_out)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isPositive ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-red-500" />
          )}
          <span
            className={cn(
              'font-semibold tabular-nums',
              isPositive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {isPositive ? '+' : ''}
            {formatCurrency(session.net)}
          </span>
        </div>
        <Badge
          variant="outline"
          className="ml-auto text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 tabular-nums"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          {session.points_earned.toLocaleString()} pts
        </Badge>
      </div>

      {/* Hover Action */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="outline"
          className="shadow-sm bg-background hover:bg-accent hover:text-accent-foreground hover:border-accent"
          onClick={() => onStartFromPrevious?.(session.visit_id)}
        >
          Start from previous
          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ gamingDay }: { gamingDay?: GamingDayInfo }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <History className="w-8 h-8 text-muted-foreground/50" />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">
        No Sessions Today
      </h3>
      <p className="text-xs text-muted-foreground max-w-[220px]">
        {gamingDay
          ? `No closed sessions for this player on ${formatGamingDay(gamingDay.gaming_day)}.`
          : 'This player has no closed sessions for the current gaming day.'}
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Player header skeleton */}
      <div className="flex items-center gap-4 pb-4 border-b border-border/50">
        <Skeleton className="w-12 h-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      {/* Sessions list skeleton */}
      <div className="space-y-2 pt-2">
        <Skeleton className="h-4 w-36" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function StartFromPreviousPanel({
  player,
  recentSessions,
  gamingDay,
  isLoading = false,
  onStartFromPrevious,
  onClose,
  className,
  embedded = false,
}: StartFromPreviousPanelProps) {
  const hasRecentSessions = recentSessions.length > 0;

  // Gaming day label for header
  const gamingDayLabel = gamingDay
    ? formatGamingDay(gamingDay.gaming_day)
    : 'Current Gaming Day';

  const content = (
    <>
      {/* Player Header */}
      <PlayerHeader player={player} />

      {/* Closed Sessions */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Today&apos;s Closed Sessions
          </h3>
          {hasRecentSessions && (
            <Badge variant="outline" className="text-xs font-mono tabular-nums">
              {gamingDayLabel}
            </Badge>
          )}
        </div>

        {hasRecentSessions ? (
          <ScrollArea className="h-[320px] -mx-1 px-1">
            <div className="space-y-3 pb-2">
              {recentSessions.map((session) => (
                <ClosedSessionRow
                  key={session.visit_id}
                  session={session}
                  onStartFromPrevious={onStartFromPrevious}
                />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <EmptyState gamingDay={gamingDay} />
        )}
      </div>
    </>
  );

  // Loading state
  if (isLoading) {
    if (embedded) {
      return (
        <div className={cn('p-6', className)}>
          <LoadingSkeleton />
        </div>
      );
    }
    return (
      <Card className={cn('w-full max-w-lg', className)}>
        <CardContent className="p-6">
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  // Embedded mode (no card wrapper)
  if (embedded) {
    return <div className={cn('p-6', className)}>{content}</div>;
  }

  // Standard card mode
  return (
    <Card className={cn('w-full max-w-lg', className)}>
      <CardContent className="p-6">{content}</CardContent>
    </Card>
  );
}

// ============================================================================
// Export Types
// ============================================================================

export type { SessionData as RecentSessionData };
