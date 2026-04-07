'use client';

/**
 * Player Visit Search
 *
 * Compact player search + active visit lookup for cashier cash-out flow.
 * Reuses searchPlayers from player service and getActiveVisit from visit service.
 * visit_id NOT NULL enforced — anonymous cash-outs disallowed per MVP decision.
 *
 * @see PRD-033 WS5 Patron Transactions
 * @see GAP-PRD033-PATRON-CASHOUT-UI
 */

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, Search, User, X } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PlayerSearchResultDTO } from '@/services/player/dtos';
import { searchPlayers } from '@/services/player/http';
import { getActiveVisit } from '@/services/visit/http';
import { visitKeys } from '@/services/visit/keys';

interface SelectedVisitContext {
  player_id: string;
  player_name: string;
  visit_id: string;
  visit_started_at: string;
}

interface PlayerVisitSearchProps {
  onSelect: (context: SelectedVisitContext | null) => void;
}

export type { SelectedVisitContext };

export function PlayerVisitSearch({ onSelect }: PlayerVisitSearchProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [selectedPlayer, setSelectedPlayer] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  // Debounce search term
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.length >= 2 ? searchTerm : '');
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Search players
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['players', 'search', 'cashier', debouncedSearch],
    queryFn: () => searchPlayers(debouncedSearch, 10),
    enabled: debouncedSearch.length >= 2 && !selectedPlayer,
    staleTime: 30_000,
  });

  // Fetch active visit for selected player
  const { data: activeVisitData, isLoading: isLoadingVisit } = useQuery({
    queryKey: visitKeys.activeByPlayer(selectedPlayer?.id ?? ''),
    queryFn: () => getActiveVisit(selectedPlayer!.id),
    enabled: !!selectedPlayer,
    staleTime: 10_000,
  });

  // Notify parent when visit context changes
  React.useEffect(() => {
    if (!selectedPlayer || !activeVisitData?.visit) {
      onSelect(null);
      return;
    }

    onSelect({
      player_id: selectedPlayer.id,
      player_name: selectedPlayer.name,
      visit_id: activeVisitData.visit.id,
      visit_started_at: activeVisitData.visit.started_at,
    });
  }, [selectedPlayer, activeVisitData, onSelect]);

  const handleSelectPlayer = (player: PlayerSearchResultDTO) => {
    setSelectedPlayer({
      id: player.id,
      name: player.full_name,
    });
    setSearchTerm('');
    setDebouncedSearch('');
  };

  const handleClear = () => {
    setSelectedPlayer(null);
    setSearchTerm('');
    setDebouncedSearch('');
    onSelect(null);
  };

  return (
    <Card className="border-2 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle
          className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest"
          style={{ fontFamily: 'monospace' }}
        >
          <User className="h-4 w-4 text-accent" />
          Player & Visit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {selectedPlayer ? (
          <SelectedPlayerDisplay
            name={selectedPlayer.name}
            activeVisit={activeVisitData}
            isLoadingVisit={isLoadingVisit}
            onClear={handleClear}
          />
        ) : (
          <SearchInput
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            isSearching={isSearching}
            results={searchResults}
            showResults={debouncedSearch.length >= 2}
            onSelectPlayer={handleSelectPlayer}
          />
        )}
      </CardContent>
    </Card>
  );
}

// === Sub-components ===

function SearchInput({
  searchTerm,
  onSearchChange,
  isSearching,
  results,
  showResults,
  onSelectPlayer,
}: {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  isSearching: boolean;
  results: PlayerSearchResultDTO[];
  showResults: boolean;
  onSelectPlayer: (player: PlayerSearchResultDTO) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search player by name..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className={cn(
            'w-full pl-9 pr-3 py-2 text-sm rounded-md font-mono',
            'border-2 border-border/50 bg-background',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-accent',
          )}
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showResults && !isSearching && (
        <div className="border-2 border-border/50 rounded-md max-h-48 overflow-auto">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">
              No players found
            </p>
          ) : (
            <div className="p-1">
              {results.map((player) => (
                <button
                  key={player.id}
                  onClick={() => onSelectPlayer(player)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded text-left text-sm hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium">{player.full_name}</span>
                  {player.birth_date && (
                    <span className="text-xs text-muted-foreground">
                      DOB: {player.birth_date}
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={cn(
                      'ml-auto text-[10px] h-4 px-1',
                      player.enrollment_status === 'enrolled'
                        ? 'text-emerald-500 border-emerald-500/30'
                        : 'text-muted-foreground',
                    )}
                  >
                    {player.enrollment_status === 'enrolled'
                      ? 'Enrolled'
                      : 'Not Enrolled'}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {searchTerm.length > 0 && searchTerm.length < 2 && (
        <p className="text-xs text-muted-foreground">
          Type at least 2 characters to search
        </p>
      )}
    </div>
  );
}

function SelectedPlayerDisplay({
  name,
  activeVisit,
  isLoadingVisit,
  onClear,
}: {
  name: string;
  activeVisit:
    | {
        has_active_visit: boolean;
        visit: { id: string; started_at: string } | null;
      }
    | undefined;
  isLoadingVisit: boolean;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          <span className="text-sm font-medium font-mono">{name}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          className="h-7 px-2"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoadingVisit ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking active visit...
        </div>
      ) : activeVisit?.has_active_visit && activeVisit.visit ? (
        <div className="rounded-md border-2 border-green-500/30 bg-green-500/5 p-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="bg-green-500/10 text-green-400 border-green-500/30"
            >
              Active Visit
            </Badge>
            <span className="text-xs text-muted-foreground">
              Since{' '}
              {new Date(activeVisit.visit.started_at).toLocaleTimeString()}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-md border-2 border-destructive/30 bg-destructive/5 p-2">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            No active visit — cash-out requires an active visit
          </div>
        </div>
      )}
    </div>
  );
}
