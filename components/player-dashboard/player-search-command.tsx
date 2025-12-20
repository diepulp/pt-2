"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Search, User, X } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchPlayers, type PlayerSearchResultDTO } from "@/services/player";

// Transform API response to component format
interface PlayerDisplay {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  status: "active" | "inactive";
}

function toPlayerDisplay(dto: PlayerSearchResultDTO): PlayerDisplay {
  return {
    id: dto.id,
    firstName: dto.first_name,
    lastName: dto.last_name,
    fullName: dto.full_name,
    status: dto.enrollment_status === "enrolled" ? "active" : "inactive",
  };
}

interface PlayerSearchCommandProps {
  onSelectPlayer: (playerId: string) => void;
  selectedPlayerId?: string | null;
}

export function PlayerSearchCommand({
  onSelectPlayer,
  selectedPlayerId,
}: PlayerSearchCommandProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  // Debounce search term
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.length >= 2) {
        setDebouncedSearch(searchTerm);
      } else {
        setDebouncedSearch("");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch players from API using React Query
  const {
    data: searchResults = [],
    isLoading: isSearching,
    error,
  } = useQuery({
    queryKey: ["players", "search", debouncedSearch],
    queryFn: () => searchPlayers(debouncedSearch, 20),
    enabled: debouncedSearch.length >= 2,
    staleTime: 30_000, // 30 seconds
  });

  // Transform API results to display format
  const filteredPlayers = React.useMemo(
    () => searchResults.map(toPlayerDisplay),
    [searchResults],
  );

  // Find selected player from search results
  const selectedPlayer = filteredPlayers.find((p) => p.id === selectedPlayerId);

  const handleSearch = React.useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  // Status badge styling
  const getStatusColor = (status: "active" | "inactive") =>
    status === "active"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : "bg-slate-400/20 text-slate-400 border-slate-400/30";

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm">
      {/* LED accent strip */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      <div className="relative p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
              <User className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Player Dashboard
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedPlayer
                  ? `Viewing ${selectedPlayer.firstName} ${selectedPlayer.lastName}`
                  : "Select a player to view details"}
              </p>
            </div>
          </div>

          {/* Search Command */}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn(
                  "w-[320px] justify-between h-10",
                  "bg-background/50 border-border/50",
                  "hover:bg-muted/50 hover:border-accent/30",
                  "transition-all duration-200",
                )}
              >
                {selectedPlayer ? (
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        selectedPlayer.status === "active"
                          ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                          : "bg-slate-500",
                      )}
                    />
                    <span className="font-medium">
                      {selectedPlayer.fullName}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] h-5 px-1.5 capitalize",
                        getStatusColor(selectedPlayer.status),
                      )}
                    >
                      {selectedPlayer.status === "active"
                        ? "Enrolled"
                        : "Not Enrolled"}
                    </Badge>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Search className="h-4 w-4" />
                    <span>Search players...</span>
                  </div>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0 bg-card border-border/50">
              {/* Search Input */}
              <div className="flex items-center border-b border-border/40 px-3">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="flex-1 px-3 py-3 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/50"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="p-1 hover:bg-muted/50 rounded"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>

              {/* Results */}
              <div className="max-h-64 overflow-auto">
                {isSearching ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Searching...</span>
                  </div>
                ) : searchTerm.length < 2 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground/70">
                    Type at least 2 characters to search
                  </div>
                ) : filteredPlayers.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground/70">
                    No players found for "{searchTerm}"
                  </div>
                ) : (
                  <div className="p-1">
                    {filteredPlayers.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => {
                          onSelectPlayer(
                            player.id === selectedPlayerId ? "" : player.id,
                          );
                          setOpen(false);
                          setSearchTerm("");
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-md",
                          "hover:bg-muted/50 transition-colors text-left group",
                          selectedPlayerId === player.id && "bg-accent/10",
                        )}
                      >
                        {/* Selection indicator */}
                        <div
                          className={cn(
                            "w-5 h-5 rounded border flex items-center justify-center shrink-0",
                            selectedPlayerId === player.id
                              ? "bg-accent border-accent"
                              : "border-border/50",
                          )}
                        >
                          {selectedPlayerId === player.id && (
                            <Check className="h-3 w-3 text-accent-foreground" />
                          )}
                        </div>

                        {/* Player info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium group-hover:text-accent transition-colors">
                              {player.fullName}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] h-4 px-1 capitalize",
                                getStatusColor(player.status),
                              )}
                            >
                              {player.status === "active"
                                ? "Enrolled"
                                : "Not Enrolled"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ID: {player.id.slice(0, 8)}...
                          </div>
                        </div>

                        {/* Status dot */}
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            player.status === "active"
                              ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                              : "bg-slate-500",
                          )}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Currently viewing indicator */}
        {selectedPlayer && (
          <div className="mt-4 flex items-center gap-4 pt-4 border-t border-border/30">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Currently viewing:</span>
              <span className="font-mono text-foreground">
                {selectedPlayer.fullName}
              </span>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] capitalize",
                getStatusColor(selectedPlayer.status),
              )}
            >
              {selectedPlayer.status === "active" ? "Enrolled" : "Not Enrolled"}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
