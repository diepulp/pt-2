"use client";

/**
 * PlayerList Component
 * Displays all players in a table with search/filter functionality
 *
 * Features:
 * - Real-time search with debouncing (300ms)
 * - Loading and error states
 * - Action buttons (view, edit, delete)
 * - Responsive design
 *
 * Wave 3: Player Management UI Components
 */

import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePlayerSearch } from "@/hooks/player/use-player-search";
import { usePlayers } from "@/hooks/player/use-players";

export interface PlayerListProps {
  onView?: (playerId: string) => void;
  onEdit?: (playerId: string) => void;
  onDelete?: (playerId: string) => void;
}

export function PlayerList({ onView, onEdit, onDelete }: PlayerListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Use search hook if query is long enough, otherwise use list hook
  const shouldSearch = debouncedQuery.length >= 2;
  const {
    data: searchResults,
    isLoading: isSearching,
    error: searchError,
  } = usePlayerSearch(debouncedQuery);
  const {
    data: allPlayers,
    isLoading: isLoadingAll,
    error: listError,
  } = usePlayers();

  // Determine which data to display
  const players = shouldSearch ? searchResults : allPlayers;
  const isLoading = shouldSearch ? isSearching : isLoadingAll;
  const error = shouldSearch ? searchError : listError;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Players</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Search Input */}
        <div className="mb-6">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search players by name or email..."
            className="max-w-md"
          />
          {searchQuery.length > 0 && searchQuery.length < 2 && (
            <p className="text-sm text-muted-foreground mt-1">
              Type at least 2 characters to search
            </p>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading players...</div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive p-4 text-destructive">
            <p className="font-semibold">Error loading players</p>
            <p className="text-sm mt-1">{error.message}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && (!players || players.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            {shouldSearch ? (
              <p>No players found matching &quot;{debouncedQuery}&quot;</p>
            ) : (
              <p>No players found. Create your first player to get started.</p>
            )}
          </div>
        )}

        {/* Players Table */}
        {!isLoading && !error && players && players.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Email
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    First Name
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Last Name
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-sm">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr
                    key={player.id}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    <td className="py-3 px-4 text-sm">{player.email}</td>
                    <td className="py-3 px-4 text-sm">{player.firstName}</td>
                    <td className="py-3 px-4 text-sm">{player.lastName}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onView && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onView(player.id)}
                            aria-label={`View ${player.firstName} ${player.lastName}`}
                          >
                            View
                          </Button>
                        )}
                        {onEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(player.id)}
                            aria-label={`Edit ${player.firstName} ${player.lastName}`}
                          >
                            Edit
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(player.id)}
                            aria-label={`Delete ${player.firstName} ${player.lastName}`}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Results Count */}
        {!isLoading && !error && players && players.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {players.length} player{players.length !== 1 ? "s" : ""}
            {shouldSearch && ` matching "${debouncedQuery}"`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
