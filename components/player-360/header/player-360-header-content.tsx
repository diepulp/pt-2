/**
 * Player 360 Header Content (WS4 - PRD-022-PATCH-OPTION-B)
 *
 * Header content with player identity, action buttons, and compact search.
 * The modal is mounted at this level to avoid lifecycle issues with timeline suspense.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Loader2,
  Search,
  Share2,
  Star,
  StarOff,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';

import { PlayerEditModal } from '@/components/player-dashboard/player-edit-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PlayerDTO, PlayerSearchResultDTO } from '@/services/player/dtos';
import { getPlayerEnrollment, searchPlayers } from '@/services/player/http';
import { playerKeys } from '@/services/player/keys';

import { AddNoteButton } from './add-note-button';
import { IssueRewardButton } from './issue-reward-button';
import { PlayerEditButton } from './player-edit-button';

interface Player360HeaderContentProps {
  /** Player ID to display */
  playerId: string;
  /** Player data from parent (eliminates duplicate usePlayer subscription) */
  player?: PlayerDTO | null;
  /** Whether player data is loading */
  playerLoading?: boolean;
  /** Error from player data fetch */
  playerError?: Error | null;
  /** Whether to show back navigation */
  showBack?: boolean;
  /** Callback when a different player is selected via search */
  onSelectPlayer?: (playerId: string) => void;
  /** Additional class names */
  className?: string;
}

// Status color utility
const getStatusColor = (status: 'enrolled' | 'not_enrolled' | string) =>
  status === 'enrolled'
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : 'bg-slate-400/20 text-slate-400 border-slate-400/30';

/**
 * Header content for Player 360 view.
 * Displays player identity, status, action buttons, and compact search.
 */
export function Player360HeaderContent({
  playerId,
  player = null,
  playerLoading = false,
  playerError = null,
  showBack = false,
  onSelectPlayer,
  className,
}: Player360HeaderContentProps) {
  const router = useRouter();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Use props from parent (single usePlayer subscription in ContentWrapper)
  const isLoading = playerLoading;
  const error = playerError;

  // Fetch enrollment status separately
  const { data: enrollment } = useQuery({
    queryKey: [...playerKeys.detail(playerId), 'enrollment'],
    queryFn: () => getPlayerEnrollment(playerId),
    enabled: !!playerId,
    staleTime: 60_000,
  });

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.length >= 2) {
        setDebouncedSearch(searchTerm);
      } else {
        setDebouncedSearch('');
      }
      setSelectedIndex(-1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch search results
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['players', 'search', debouncedSearch],
    queryFn: () => searchPlayers(debouncedSearch, 10),
    enabled: debouncedSearch.length >= 2,
    staleTime: 30_000,
  });

  // Keyboard shortcut handler (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchTerm('');
        setDebouncedSearch('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen]);

  // Click outside to close search
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
        setSearchTerm('');
        setDebouncedSearch('');
      }
    };
    if (searchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [searchOpen]);

  const handleBack = () => {
    router.replace('/players', { scroll: false });
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Clipboard API may not be available in all contexts
    }
  };

  const handleSelectPlayer = useCallback(
    (selectedPlayer: PlayerSearchResultDTO) => {
      if (onSelectPlayer) {
        onSelectPlayer(selectedPlayer.id);
      } else {
        router.replace(`/players/${selectedPlayer.id}`, { scroll: false });
      }
      setSearchOpen(false);
      setSearchTerm('');
      setDebouncedSearch('');
    },
    [onSelectPlayer, router],
  );

  const handleClearSearch = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    searchInputRef.current?.focus();
  };

  // Derive enrollment status
  const enrollmentStatus =
    enrollment?.status === 'active' ? 'enrolled' : 'not_enrolled';

  // Detect OS for keyboard hint (deferred to avoid hydration mismatch)
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgentData;
    const mac =
      ua?.platform?.toLowerCase().includes('mac') ??
      navigator.userAgent.toLowerCase().includes('mac');
    setIsMac(mac);
  }, []);
  const modKey = isMac ? '⌘' : 'Ctrl';

  // Keyboard navigation for combobox search results
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < searchResults.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      if (searchResults[selectedIndex]) {
        handleSelectPlayer(searchResults[selectedIndex]);
        setSelectedIndex(-1);
      }
    }
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-3',
        className,
      )}
      data-testid="player-360-header-content"
    >
      {/* Left side: Back + Identity */}
      <div className="flex items-center gap-3 min-w-0">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="shrink-0 h-8 w-8"
            aria-label="Go back"
            data-testid="header-back-button"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        {/* Player Identity */}
        {isLoading ? (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted motion-safe:animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-5 w-32 bg-muted motion-safe:animate-pulse rounded" />
              <div className="h-3 w-20 bg-muted motion-safe:animate-pulse rounded" />
            </div>
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">Failed to load player</div>
        ) : player ? (
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar with initials */}
            <div
              className={cn(
                'h-10 w-10 shrink-0 rounded-full',
                'bg-gradient-to-br from-accent/30 to-accent/10',
                'border border-accent/30',
                'flex items-center justify-center',
                'text-sm font-semibold text-accent',
              )}
            >
              {player.first_name?.[0]}
              {player.last_name?.[0]}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight truncate">
                  {player.first_name} {player.last_name}
                </h1>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] h-5 px-1.5 capitalize shrink-0',
                    getStatusColor(enrollmentStatus),
                  )}
                >
                  {enrollmentStatus === 'enrolled'
                    ? 'Enrolled'
                    : 'Not Enrolled'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {player.birth_date && (
                  <span>
                    DOB:{' '}
                    {new Date(player.birth_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                )}
                <span className="font-mono text-muted-foreground/60">
                  ID: {playerId.slice(0, 8)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Right side: Search + Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Compact Search */}
        <div className="relative" ref={searchContainerRef}>
          {searchOpen ? (
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search players..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                role="combobox"
                aria-expanded={searchTerm.length >= 2}
                aria-haspopup="listbox"
                aria-controls="header-search-listbox"
                aria-autocomplete="list"
                aria-activedescendant={
                  selectedIndex >= 0
                    ? `header-search-option-${selectedIndex}`
                    : undefined
                }
                className={cn(
                  'w-64 pl-9 pr-8 py-1.5 text-sm rounded-lg',
                  'bg-background/80 border border-border/60',
                  'focus:outline-none focus:ring-2 focus:ring-accent/40',
                  'placeholder:text-muted-foreground/50',
                )}
                aria-label="Search players"
                data-testid="header-search-input"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              {searchTerm && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-muted/50 rounded"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}

              {/* aria-live region for search status */}
              <div role="status" aria-live="polite" className="sr-only">
                {isSearching
                  ? 'Searching...'
                  : debouncedSearch.length >= 2
                    ? searchResults.length > 0
                      ? `${searchResults.length} results found`
                      : 'No results found'
                    : ''}
              </div>

              {/* Search Results Dropdown */}
              {searchTerm.length >= 2 && (
                <div
                  id="header-search-listbox"
                  role="listbox"
                  aria-label="Search results"
                  className={cn(
                    'absolute top-full left-0 right-0 mt-1 z-50',
                    'bg-card/95 backdrop-blur-sm rounded-lg border border-border/50',
                    'shadow-lg overflow-hidden max-h-64 overflow-y-auto',
                  )}
                >
                  {isSearching ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                      <span>Searching...</span>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="py-4 text-center text-sm text-muted-foreground/70">
                      No players found
                    </div>
                  ) : (
                    searchResults.map((result, index) => (
                      <button
                        key={result.id}
                        id={`header-search-option-${index}`}
                        role="option"
                        aria-selected={selectedIndex === index}
                        onClick={() => handleSelectPlayer(result)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2',
                          'hover:bg-muted/50 transition-colors text-left',
                          'border-b border-border/30 last:border-b-0',
                          result.id === playerId && 'bg-accent/10',
                          selectedIndex === index && 'bg-muted/50',
                        )}
                      >
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full shrink-0',
                            'bg-gradient-to-br from-accent/20 to-accent/5',
                            'border border-accent/30',
                            'flex items-center justify-center',
                            'text-xs font-medium text-accent',
                          )}
                        >
                          {result.full_name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {result.full_name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {result.birth_date ||
                              `ID: ${result.id.slice(0, 8)}`}
                          </div>
                        </div>
                        {result.id === playerId && (
                          <Check className="h-4 w-4 text-accent shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchOpen(true);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                  className="gap-2 h-8 px-3"
                  data-testid="header-search-button"
                >
                  <Search className="h-4 w-4" />
                  <span className="text-muted-foreground text-xs hidden sm:inline">
                    Search
                  </span>
                  <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                    {modKey}K
                  </kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Search for another player</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Favorite toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFavorite(!isFavorite)}
              className="h-8 w-8"
              aria-label={
                isFavorite ? 'Remove from favorites' : 'Add to favorites'
              }
              data-testid="favorite-button"
            >
              {isFavorite ? (
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              ) : (
                <StarOff className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          </TooltipContent>
        </Tooltip>

        {/* Share link */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShare}
              className="h-8 w-8"
              aria-label="Share player link"
              data-testid="share-button"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy link to clipboard</TooltipContent>
        </Tooltip>

        {/* Add Note */}
        <AddNoteButton onClick={() => setNoteComposerOpen(true)} compact />

        {/* Issue Reward (stub) */}
        <IssueRewardButton compact />

        {/* Edit Profile */}
        <PlayerEditButton
          onClick={() => setEditModalOpen(true)}
          disabled={isLoading || !!error}
        />
      </div>

      {/* Edit Modal — conditionally rendered to avoid idle subscriptions */}
      {editModalOpen && (
        <PlayerEditModal
          playerId={playerId}
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
        />
      )}
    </div>
  );
}
