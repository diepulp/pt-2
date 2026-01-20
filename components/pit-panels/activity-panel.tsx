'use client';

import {
  Activity,
  ArrowDownAZ,
  ArrowUpAZ,
  Clock,
  Pause,
  Play,
  Search,
  SortDesc,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCasinoActivePlayers } from '@/hooks/dashboard';
import { cn } from '@/lib/utils';
import {
  usePitDashboardStore,
  type ActivitySortMode,
} from '@/store/pit-dashboard-store';

interface ActivityPanelProps {
  onSlipClick: (slipId: string) => void;
}

/**
 * Formats session duration from start time to now.
 */
function formatDuration(startTime: string): string {
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Formats birthdate as DD/MM/YYYY for clear player identification.
 */
function formatBirthday(birthDate: string | null): string {
  if (!birthDate) return '—';
  const date = new Date(birthDate);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Formats average bet as currency.
 */
function formatAvgBet(avgBet: number | null): string {
  if (avgBet === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(avgBet);
}

/**
 * Activity Panel - Casino-wide active players table
 *
 * Displays all active (open/paused) players across all pits and tables.
 * Features:
 * - Search by player name (debounced)
 * - Sort by recent, A→Z, Z→A
 * - Responsive columns (hide on smaller screens)
 * - Click row to open rating slip
 *
 * @see GAP-ACTIVITY-PANEL-CASINO-WIDE
 */
export function ActivityPanel({ onSlipClick }: ActivityPanelProps) {
  // Zustand store for search and sort state
  const activitySearchQuery = usePitDashboardStore(
    (state) => state.activitySearchQuery,
  );
  const activitySortMode = usePitDashboardStore(
    (state) => state.activitySortMode,
  );
  const setActivitySearchQuery = usePitDashboardStore(
    (state) => state.setActivitySearchQuery,
  );
  const setActivitySortMode = usePitDashboardStore(
    (state) => state.setActivitySortMode,
  );

  // Local state for debounced search input
  const [searchInput, setSearchInput] = React.useState(activitySearchQuery);

  // Debounce search input to Zustand store
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setActivitySearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setActivitySearchQuery]);

  // Fetch casino-wide active players
  const { data, isLoading, isError, error } = useCasinoActivePlayers({
    search: activitySearchQuery || undefined,
    limit: 200,
  });

  const players = data?.items ?? [];

  // Derive sorted data during render (no useEffect sync)
  const sortedPlayers = React.useMemo(() => {
    const sorted = [...players];

    switch (activitySortMode) {
      case 'recent':
        // Sort by start_time DESC (most recent first)
        sorted.sort(
          (a, b) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
        );
        break;
      case 'alpha-asc':
        // Sort by last name ASC
        sorted.sort((a, b) => {
          const aName = a.player?.lastName ?? '';
          const bName = b.player?.lastName ?? '';
          return aName.localeCompare(bName);
        });
        break;
      case 'alpha-desc':
        // Sort by last name DESC
        sorted.sort((a, b) => {
          const aName = a.player?.lastName ?? '';
          const bName = b.player?.lastName ?? '';
          return bName.localeCompare(aName);
        });
        break;
    }

    return sorted;
  }, [players, activitySortMode]);

  // Get sort icon based on current mode
  const getSortIcon = (mode: ActivitySortMode) => {
    switch (mode) {
      case 'recent':
        return <SortDesc className="h-4 w-4" />;
      case 'alpha-asc':
        return <ArrowDownAZ className="h-4 w-4" />;
      case 'alpha-desc':
        return <ArrowUpAZ className="h-4 w-4" />;
    }
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: 'open' | 'paused' }) => {
    if (status === 'open') {
      return (
        <Badge
          variant="outline"
          className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
        >
          <Play className="h-3 w-3 mr-1" />
          Open
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="bg-amber-500/10 text-amber-400 border-amber-500/30"
      >
        <Pause className="h-3 w-3 mr-1" />
        Paused
      </Badge>
    );
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
              <Activity className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
              <p className="text-sm text-muted-foreground">
                Loading players...
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg bg-muted/50"
            />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-destructive/10 border border-destructive/20">
              <Activity className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
              <p className="text-sm text-destructive">
                {error?.message ?? 'Failed to load players'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
            <Activity className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
            <p className="text-sm text-muted-foreground">
              {sortedPlayers.length} active player
              {sortedPlayers.length !== 1 ? 's' : ''} across all tables
            </p>
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-xs font-medium text-emerald-400">Live</span>
        </div>
      </div>

      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-border/40">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by player name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 bg-muted/30 border-border/50 focus:border-accent/50"
          />
        </div>

        {/* Sort Select */}
        <Select
          value={activitySortMode}
          onValueChange={(value) =>
            setActivitySortMode(value as ActivitySortMode)
          }
        >
          <SelectTrigger className="w-full sm:w-[160px] bg-muted/30 border-border/50">
            <div className="flex items-center gap-2">
              {getSortIcon(activitySortMode)}
              <SelectValue placeholder="Sort by..." />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">
              <div className="flex items-center gap-2">
                <SortDesc className="h-4 w-4" />
                Recent
              </div>
            </SelectItem>
            <SelectItem value="alpha-asc">
              <div className="flex items-center gap-2">
                <ArrowDownAZ className="h-4 w-4" />A → Z
              </div>
            </SelectItem>
            <SelectItem value="alpha-desc">
              <div className="flex items-center gap-2">
                <ArrowUpAZ className="h-4 w-4" />Z → A
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Data Table */}
      <ScrollArea className="flex-1">
        {sortedPlayers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/40">
                {/* Name - Always visible */}
                <TableHead className="font-semibold">Name</TableHead>
                {/* Birthday - Always visible */}
                <TableHead className="font-semibold">Birthday</TableHead>
                {/* Table/Pit - Hidden on mobile */}
                <TableHead className="font-semibold hidden md:table-cell">
                  Table / Pit
                </TableHead>
                {/* Seat - Hidden on tablet and mobile */}
                <TableHead className="font-semibold hidden lg:table-cell">
                  Seat
                </TableHead>
                {/* Duration - Hidden on mobile */}
                <TableHead className="font-semibold hidden md:table-cell">
                  Duration
                </TableHead>
                {/* Status - Hidden on tablet and mobile */}
                <TableHead className="font-semibold hidden lg:table-cell">
                  Status
                </TableHead>
                {/* Tier - Hidden on tablet and mobile */}
                <TableHead className="font-semibold hidden lg:table-cell">
                  Tier
                </TableHead>
                {/* Avg Bet - Hidden on tablet and mobile */}
                <TableHead className="font-semibold hidden lg:table-cell text-right">
                  Avg Bet
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlayers.map((player) => (
                <TableRow
                  key={player.slipId}
                  className={cn(
                    'cursor-pointer transition-colors',
                    'hover:bg-accent/5 focus-within:bg-accent/10',
                    'border-border/30',
                  )}
                  onClick={() => onSlipClick(player.slipId)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSlipClick(player.slipId);
                    }
                  }}
                >
                  {/* Name */}
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {player.player ? (
                        <span>
                          {player.player.firstName} {player.player.lastName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">
                          Guest
                        </span>
                      )}
                      {/* Mobile-only status indicator */}
                      <span className="lg:hidden">
                        {player.status === 'open' ? (
                          <Play className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Pause className="h-3 w-3 text-amber-400" />
                        )}
                      </span>
                    </div>
                  </TableCell>

                  {/* Birthday */}
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatBirthday(player.player?.birthDate ?? null)}
                  </TableCell>

                  {/* Table/Pit - Hidden on mobile */}
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-col">
                      <span className="font-medium">{player.tableName}</span>
                      {player.pitName && (
                        <span className="text-xs text-muted-foreground">
                          {player.pitName}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Seat - Hidden on tablet and mobile */}
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {player.seatNumber ?? '—'}
                  </TableCell>

                  {/* Duration - Hidden on mobile */}
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="tabular-nums font-mono text-sm">
                        {formatDuration(player.startTime)}
                      </span>
                    </div>
                  </TableCell>

                  {/* Status - Hidden on tablet and mobile */}
                  <TableCell className="hidden lg:table-cell">
                    <StatusBadge status={player.status} />
                  </TableCell>

                  {/* Tier - Hidden on tablet and mobile */}
                  <TableCell className="hidden lg:table-cell">
                    {player.player?.tier ? (
                      <Badge variant="secondary" className="text-xs">
                        {player.player.tier}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Avg Bet - Hidden on tablet and mobile */}
                  <TableCell className="hidden lg:table-cell text-right font-mono tabular-nums">
                    {formatAvgBet(player.averageBet)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted/50 border border-border/50 mb-4">
              <Clock className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {activitySearchQuery
                ? 'No players match your search'
                : 'No active players'}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {activitySearchQuery
                ? 'Try a different search term'
                : 'Players will appear here when sessions are started'}
            </p>
          </div>
        )}
      </ScrollArea>

      {/* Summary Footer */}
      {sortedPlayers.length > 0 && (
        <div className="p-4 border-t border-border/40 bg-muted/10">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-emerald-400">
                {sortedPlayers.filter((p) => p.status === 'open').length}
              </div>
              <div className="text-xs text-muted-foreground/60">Open</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-amber-400">
                {sortedPlayers.filter((p) => p.status === 'paused').length}
              </div>
              <div className="text-xs text-muted-foreground/60">Paused</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold text-foreground">
                {sortedPlayers.length}
              </div>
              <div className="text-xs text-muted-foreground/60">Total</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
