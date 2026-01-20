'use client';

import {
  LayoutGrid,
  List,
  Search,
  ChevronRight,
  Layers,
  Circle,
  Pause,
  XCircle,
  User,
} from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import type { PitData, TableData, ViewMode, GameType } from '../types';

import { TableCard } from './table-card';

interface TableGridProps {
  pit: PitData | null;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSelectTable?: (tableId: string) => void;
  className?: string;
}

// Sort tables by status: active first, then inactive (paused), then closed
function sortTablesByStatus(tables: TableData[]): TableData[] {
  const statusOrder = { active: 0, inactive: 1, closed: 2 };
  return [...tables].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status],
  );
}

const gameTypeLabels: Record<GameType, string> = {
  blackjack: 'Blackjack',
  poker: 'Poker',
  roulette: 'Roulette',
  baccarat: 'Baccarat',
};

const statusConfig = {
  active: { icon: Circle, color: 'text-emerald-400', fill: 'fill-emerald-400' },
  inactive: { icon: Pause, color: 'text-amber-400', fill: '' },
  closed: { icon: XCircle, color: 'text-zinc-500', fill: '' },
};

export function TableGrid({
  pit,
  viewMode,
  onViewModeChange,
  onSelectTable,
  className,
}: TableGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  // Filter and sort tables
  const filteredTables = useMemo(() => {
    if (!pit) return [];
    const query = searchQuery.toLowerCase().trim();
    const filtered = pit.tables.filter(
      (table) =>
        table.label.toLowerCase().includes(query) ||
        table.dealerName?.toLowerCase().includes(query) ||
        table.gameType.toLowerCase().includes(query),
    );
    return sortTablesByStatus(filtered);
  }, [pit, searchQuery]);

  // Stats for the header
  const stats = useMemo(() => {
    if (!pit) return { active: 0, inactive: 0, closed: 0, total: 0 };
    return {
      active: pit.tables.filter((t) => t.status === 'active').length,
      inactive: pit.tables.filter((t) => t.status === 'inactive').length,
      closed: pit.tables.filter((t) => t.status === 'closed').length,
      total: pit.tables.length,
    };
  }, [pit]);

  if (!pit) {
    return (
      <div
        className={cn(
          'flex-1 flex flex-col items-center justify-center',
          className,
        )}
      >
        <div className="flex flex-col items-center gap-4 text-center max-w-md p-8">
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/50">
            <Layers className="w-12 h-12 text-muted-foreground/40" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Select a Pit
            </h3>
            <p className="text-sm text-muted-foreground">
              Choose a pit from the left panel to view its tables
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
            <kbd className="px-2 py-1 rounded border border-border bg-muted/50 font-mono">
              ⌘K
            </kbd>
            <span>to jump to any table</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex-1 flex flex-col min-h-0', className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 px-6 pt-4 pb-2 text-sm text-muted-foreground">
          <span className="hover:text-foreground cursor-pointer transition-colors">
            Casino
          </span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">{pit.label}</span>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between gap-4 px-6 pb-4">
          <div className="flex items-center gap-4">
            {/* Stats */}
            <div className="flex items-center gap-3 text-sm">
              <StatBadge count={stats.active} label="open" color="emerald" />
              {stats.inactive > 0 && (
                <StatBadge
                  count={stats.inactive}
                  label="paused"
                  color="amber"
                />
              )}
              {stats.closed > 0 && (
                <StatBadge count={stats.closed} label="closed" color="zinc" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Filter tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-muted/30"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-border rounded-lg p-0.5 bg-muted/30">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onViewModeChange('grid')}
                className={cn(
                  'rounded-md',
                  viewMode === 'grid' && 'bg-background shadow-sm',
                )}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onViewModeChange('list')}
                className={cn(
                  'rounded-md',
                  viewMode === 'list' && 'bg-background shadow-sm',
                )}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {viewMode === 'grid' ? (
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredTables.map((table, index) => (
                <div
                  key={table.id}
                  className="animate-in fade-in slide-in-from-bottom-2"
                  style={{ animationDelay: `${Math.min(index * 30, 200)}ms` }}
                >
                  <TableCard table={table} onSelect={onSelectTable} />
                </div>
              ))}
            </div>

            {filteredTables.length === 0 && (
              <EmptyState searchQuery={searchQuery} />
            )}
          </div>
        ) : (
          <div className="p-6">
            <TableListView
              tables={filteredTables}
              onSelectTable={onSelectTable}
            />
            {filteredTables.length === 0 && (
              <EmptyState searchQuery={searchQuery} />
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// Stat badge component
function StatBadge({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: 'emerald' | 'amber' | 'zinc';
}) {
  const colors = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    zinc: 'text-zinc-500 bg-zinc-500/10',
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md',
        colors[color],
      )}
    >
      <span className="font-mono font-semibold">{count}</span>
      <span className="text-xs opacity-80">{label}</span>
    </div>
  );
}

// Empty state component
function EmptyState({ searchQuery }: { searchQuery: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Search className="w-10 h-10 text-muted-foreground/30 mb-4" />
      <p className="text-sm text-muted-foreground">
        {searchQuery
          ? `No tables matching "${searchQuery}"`
          : 'No tables in this pit'}
      </p>
    </div>
  );
}

// List view component
function TableListView({
  tables,
  onSelectTable,
}: {
  tables: TableData[];
  onSelectTable?: (tableId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-[140px] font-semibold">Table</TableHead>
            <TableHead className="font-semibold">Game</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">Limits</TableHead>
            <TableHead className="font-semibold">Dealer</TableHead>
            <TableHead className="text-right font-semibold">
              Occupancy
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tables.map((table) => {
            const status = statusConfig[table.status];
            const StatusIcon = status.icon;

            return (
              <TableRow
                key={table.id}
                onClick={() => onSelectTable?.(table.id)}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <TableCell className="font-mono font-bold text-foreground">
                  {table.label}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {gameTypeLabels[table.gameType]}
                </TableCell>
                <TableCell>
                  <div
                    className={cn('flex items-center gap-1.5', status.color)}
                  >
                    <StatusIcon className={cn('w-3.5 h-3.5', status.fill)} />
                    <span className="capitalize">{table.status}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  ${table.minBet ?? '—'} - ${table.maxBet ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    {table.dealerName || '—'}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {table.occupancy ?? 0}/{table.maxOccupancy ?? 7}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
