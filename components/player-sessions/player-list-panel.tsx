'use client';

import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  History,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { GamingDayInfo, PlayerInfo } from './start-from-previous';

// ============================================================================
// Types
// ============================================================================

export interface PlayerListItem extends PlayerInfo {
  /** Most recent closed session (from gaming day) */
  last_session: {
    table_name: string;
    seat_number: number;
    ended_at: string;
    net: number;
  };
  /** Total closed sessions today (gaming day) */
  session_count: number;
  /** Total points earned today */
  total_points_today: number;
  /** Total net today */
  total_net_today: number;
}

export interface PlayerListPanelProps {
  players: PlayerListItem[];
  /** Gaming day context */
  gamingDay?: GamingDayInfo;
  /** Pagination */
  currentPage: number;
  totalPages: number;
  totalPlayers: number;
  pageSize: number;
  /** Search query */
  searchQuery: string;
  /** Loading states */
  isLoading?: boolean;
  isSearching?: boolean;
  /** Callbacks */
  onSearchChange: (query: string) => void;
  onPageChange: (page: number) => void;
  onPlayerSelect: (player: PlayerListItem) => void;
  className?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
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

function SearchHeader({
  searchQuery,
  onSearchChange,
  gamingDay,
  totalPlayers,
  isSearching,
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  gamingDay?: GamingDayInfo;
  totalPlayers: number;
  isSearching?: boolean;
}) {
  return (
    <div className="space-y-4 pb-4 border-b border-border/50">
      {/* Gaming Day Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
            <Users className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Closed Sessions
            </h2>
            <p className="text-xs text-muted-foreground">
              {totalPlayers} players with closed sessions today
            </p>
          </div>
        </div>
        {gamingDay && (
          <Badge variant="outline" className="gap-1.5 font-mono text-xs">
            <Calendar className="h-3 w-3" />
            {formatGamingDay(gamingDay.gaming_day)}
          </Badge>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search players by name or card number..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 pr-4 h-10 bg-muted/30 border-border/50 focus:border-accent focus:ring-accent/20"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  onSelect,
}: {
  player: PlayerListItem;
  onSelect: (player: PlayerListItem) => void;
}) {
  const isPositive = player.total_net_today >= 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(player)}
      className="group w-full text-left p-4 rounded-lg border border-border/40 bg-card/50 hover:bg-card hover:border-border/60 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-11 h-11 rounded-full flex items-center justify-center ring-2 bg-gradient-to-br from-accent/20 to-accent/5 ring-accent/20">
            <User className="w-5 h-5 text-accent" />
          </div>
          {player.tier && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
              <Sparkles className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>

        {/* Player Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium truncate">{player.name}</span>
            {player.tier && (
              <Badge
                variant="outline"
                className="text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
              >
                {player.tier}
              </Badge>
            )}
          </div>

          {/* Last Session Location */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <History className="w-3 h-3" />
            <span>
              {player.last_session.table_name} Seat{' '}
              {player.last_session.seat_number}
            </span>
            <span className="text-xs">
              • Left at {formatTime(player.last_session.ended_at)}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          {/* Session Count */}
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Sessions</div>
            <div className="font-medium tabular-nums">
              {player.session_count}
            </div>
          </div>

          {/* Net */}
          <div className="text-right min-w-[60px]">
            <div className="text-xs text-muted-foreground">Net</div>
            <div
              className={cn(
                'font-semibold tabular-nums flex items-center justify-end gap-1',
                isPositive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400',
              )}
            >
              {isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {formatCurrency(Math.abs(player.total_net_today))}
            </div>
          </div>

          {/* Points */}
          {player.total_points_today > 0 && (
            <Badge
              variant="outline"
              className="text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 tabular-nums"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              {player.total_points_today.toLocaleString()}
            </Badge>
          )}
        </div>

        {/* Hover indicator */}
        <ChevronRight className="w-5 h-5 text-muted-foreground/50 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  );
}

function Pagination({
  currentPage,
  totalPages,
  totalPlayers,
  pageSize,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalPlayers: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalPlayers);

  return (
    <div className="flex items-center justify-between pt-4 border-t border-border/50">
      <span className="text-sm text-muted-foreground tabular-nums">
        Showing {start}–{end} of {totalPlayers}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums px-2">
          {currentPage} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ searchQuery }: { searchQuery: string }) {
  const isSearching = searchQuery.length > 0;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        {isSearching ? (
          <Search className="w-8 h-8 text-muted-foreground/50" />
        ) : (
          <History className="w-8 h-8 text-muted-foreground/50" />
        )}
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">
        {isSearching ? 'No Players Found' : 'No Closed Sessions'}
      </h3>
      <p className="text-xs text-muted-foreground max-w-[220px]">
        {isSearching
          ? `No players match "${searchQuery}". Try a different search term.`
          : 'No players have closed sessions during the current gaming day.'}
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="space-y-4 pb-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
      </div>

      {/* List skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between pt-4 border-t border-border/50">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PlayerListPanel({
  players,
  gamingDay,
  currentPage,
  totalPages,
  totalPlayers,
  pageSize,
  searchQuery,
  isLoading = false,
  isSearching = false,
  onSearchChange,
  onPageChange,
  onPlayerSelect,
  className,
}: PlayerListPanelProps) {
  if (isLoading) {
    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="p-6">
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  const hasPlayers = players.length > 0;

  return (
    <Card className={cn('w-full', className)}>
      <CardContent className="p-6">
        {/* Search Header */}
        <SearchHeader
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          gamingDay={gamingDay}
          totalPlayers={totalPlayers}
          isSearching={isSearching}
        />

        {/* Player List */}
        {hasPlayers ? (
          <>
            <ScrollArea className="h-[480px] mt-4 -mx-1 px-1">
              <div className="space-y-3 pb-2">
                {players.map((player) => (
                  <PlayerRow
                    key={player.player_id}
                    player={player}
                    onSelect={onPlayerSelect}
                  />
                ))}
              </div>
            </ScrollArea>

            {/* Pagination */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalPlayers={totalPlayers}
              pageSize={pageSize}
              onPageChange={onPageChange}
            />
          </>
        ) : (
          <EmptyState searchQuery={searchQuery} />
        )}
      </CardContent>
    </Card>
  );
}
