/**
 * Player 360 Dashboard Empty & Error States (WS-UX-D)
 *
 * Empty state and error state components for the Player 360 dashboard.
 * Provides clear feedback and actionable recovery options.
 *
 * @see player-360-crm-dashboard-ux-ui-baselines.md §7
 * @see EXEC-SPEC-029.md WS-UX-D
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  FileText,
  Filter,
  History,
  Loader2,
  RefreshCw,
  Search,
  Tag,
  User,
  UserX,
  X,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PlayerSearchResultDTO } from '@/services/player/dtos';
import { searchPlayers } from '@/services/player/http';

// === Base Empty State ===

interface EmptyStateProps {
  /** Icon to display */
  icon: React.ReactNode;
  /** Main heading */
  title: string;
  /** Description text */
  description: string;
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Base empty state component with icon, text, and optional actions.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8',
        className,
      )}
    >
      <div className="w-16 h-16 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h4 className="text-sm font-medium text-foreground mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground max-w-[280px] mb-4">
        {description}
      </p>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2">
          {action && (
            <Button variant="default" size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="outline"
              size="sm"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// === Error State ===

interface ErrorStateProps {
  /** Error message */
  message: string;
  /** Optional correlation ID for support */
  correlationId?: string;
  /** Retry callback */
  onRetry?: () => void;
  className?: string;
}

/**
 * Error state with retry action and correlation ID.
 * Per UX baseline §7: "Error states with retry + correlation id"
 */
export function ErrorState({
  message,
  correlationId,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8',
        className,
      )}
    >
      <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
        <AlertCircle className="h-8 w-8 text-red-400/70" />
      </div>
      <h4 className="text-sm font-medium text-red-400 mb-1">
        Something went wrong
      </h4>
      <p className="text-xs text-muted-foreground max-w-[280px] mb-2">
        {message}
      </p>
      {correlationId && (
        <p className="text-[10px] font-mono text-muted-foreground/60 mb-4">
          ID: {correlationId}
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

// === Timeline Empty States ===

interface TimelineEmptyProps {
  /** Type of empty state */
  type: 'no-events' | 'no-results' | 'no-player';
  /** Callback to widen date range */
  onWidenDateRange?: () => void;
  /** Callback to clear filters */
  onClearFilters?: () => void;
  /** Callback to select a player */
  onSelectPlayer?: () => void;
  className?: string;
}

/**
 * Timeline-specific empty states.
 * Per UX baseline §7: "Empty states with widen range button"
 */
export function TimelineEmpty({
  type,
  onWidenDateRange,
  onClearFilters,
  onSelectPlayer,
  className,
}: TimelineEmptyProps) {
  switch (type) {
    case 'no-events':
      return (
        <EmptyState
          icon={<History className="h-8 w-8 text-muted-foreground/50" />}
          title="No events in this period"
          description="This player has no activity recorded for the selected date range."
          action={
            onWidenDateRange
              ? { label: 'Widen date range', onClick: onWidenDateRange }
              : undefined
          }
          className={className}
        />
      );

    case 'no-results':
      return (
        <EmptyState
          icon={<Filter className="h-8 w-8 text-muted-foreground/50" />}
          title="No matching events"
          description="No events match your current filters. Try adjusting your selection."
          action={
            onClearFilters
              ? { label: 'Clear filters', onClick: onClearFilters }
              : undefined
          }
          className={className}
        />
      );

    case 'no-player':
      return (
        <EmptyState
          icon={<Search className="h-8 w-8 text-muted-foreground/50" />}
          title="No player selected"
          description="Search for and select a player to view their timeline."
          action={
            onSelectPlayer
              ? { label: 'Search players', onClick: onSelectPlayer }
              : undefined
          }
          className={className}
        />
      );

    default:
      return null;
  }
}

// === Metrics Empty States ===

interface MetricsEmptyProps {
  /** Reason for empty state */
  reason: 'no-player' | 'no-data' | 'insufficient-data';
  className?: string;
}

/**
 * Metrics rail empty states.
 */
export function MetricsEmpty({ reason, className }: MetricsEmptyProps) {
  switch (reason) {
    case 'no-player':
      return (
        <EmptyState
          icon={<UserX className="h-8 w-8 text-muted-foreground/50" />}
          title="No player selected"
          description="Select a player to view their performance metrics."
          className={className}
        />
      );

    case 'no-data':
      return (
        <EmptyState
          icon={<Calendar className="h-8 w-8 text-muted-foreground/50" />}
          title="No metrics available"
          description="This player doesn't have any recorded activity yet."
          className={className}
        />
      );

    case 'insufficient-data':
      return (
        <EmptyState
          icon={<History className="h-8 w-8 text-muted-foreground/50" />}
          title="Limited data"
          description="Not enough activity to calculate meaningful metrics. Check back after more visits."
          className={className}
        />
      );

    default:
      return null;
  }
}

// === Collaboration Empty States ===

interface NotesEmptyProps {
  /** Action to add first note */
  onAddNote?: () => void;
  className?: string;
}

/**
 * Notes section empty state.
 */
export function NotesEmpty({ onAddNote, className }: NotesEmptyProps) {
  return (
    <EmptyState
      icon={<FileText className="h-8 w-8 text-muted-foreground/50" />}
      title="No notes yet"
      description="Be the first to add a note about this player."
      action={onAddNote ? { label: 'Add note', onClick: onAddNote } : undefined}
      className={className}
    />
  );
}

interface TagsEmptyProps {
  /** Action to add first tag */
  onAddTag?: () => void;
  className?: string;
}

/**
 * Tags section empty state.
 */
export function TagsEmpty({ onAddTag, className }: TagsEmptyProps) {
  return (
    <EmptyState
      icon={<Tag className="h-8 w-8 text-muted-foreground/50" />}
      title="No tags applied"
      description="Apply tags to categorize and quickly identify this player."
      action={onAddTag ? { label: 'Add tag', onClick: onAddTag } : undefined}
      className={className}
    />
  );
}

// === Compact Empty States ===

interface CompactEmptyProps {
  /** Icon to display */
  icon: React.ReactNode;
  /** Short message */
  message: string;
  className?: string;
}

/**
 * Compact empty state for inline use.
 */
export function CompactEmpty({ icon, message, className }: CompactEmptyProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 py-3 px-4 text-muted-foreground',
        'rounded-lg border border-dashed border-border/50',
        className,
      )}
    >
      {icon}
      <span className="text-xs">{message}</span>
    </div>
  );
}

// === Timeline Error State ===

interface TimelineErrorProps {
  /** Error message */
  message: string;
  /** Correlation ID */
  correlationId?: string;
  /** Retry callback */
  onRetry?: () => void;
  className?: string;
}

/**
 * Timeline-specific error state.
 * Per UX baseline §7: "Timeline unavailable + retry + correlation id"
 */
export function TimelineError({
  message,
  correlationId,
  onRetry,
  className,
}: TimelineErrorProps) {
  return (
    <ErrorState
      message={message || 'Timeline unavailable'}
      correlationId={correlationId}
      onRetry={onRetry}
      className={className}
    />
  );
}

// === No Permission State ===

interface NoPermissionProps {
  /** Resource user doesn't have permission to view */
  resource: string;
  className?: string;
}

/**
 * No permission state for RLS-protected resources.
 */
export function NoPermission({ resource, className }: NoPermissionProps) {
  return (
    <EmptyState
      icon={<AlertCircle className="h-8 w-8 text-amber-400/70" />}
      title="Access restricted"
      description={`You don't have permission to view ${resource}. Contact your supervisor if you need access.`}
      className={className}
    />
  );
}

// === Recent Players Hook (for empty state and header) ===

const STORAGE_KEY = 'player-360-recent-players';
const MAX_RECENT = 10;

interface RecentPlayer {
  id: string;
  name: string;
  viewedAt: string;
}

/**
 * Hook to manage recent players in localStorage.
 */
export function useRecentPlayers() {
  const [recentPlayers, setRecentPlayers] = React.useState<RecentPlayer[]>([]);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const isInitialLoad = React.useRef(true);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRecentPlayers(JSON.parse(stored));
      }
    } catch {
      // Ignore parse errors
    }
    setIsLoaded(true);
  }, []);

  React.useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentPlayers));
    }
  }, [recentPlayers, isLoaded]);

  const addRecent = React.useCallback((id: string, name: string) => {
    setRecentPlayers((prev) => {
      if (prev[0]?.id === id) return prev; // Already first — skip
      const filtered = prev.filter((p) => p.id !== id);
      return [
        { id, name, viewedAt: new Date().toISOString() },
        ...filtered,
      ].slice(0, MAX_RECENT);
    });
  }, []);

  const removeRecent = React.useCallback((id: string) => {
    setRecentPlayers((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearAll = React.useCallback(() => {
    setRecentPlayers([]);
  }, []);

  return { recentPlayers, isLoaded, addRecent, removeRecent, clearAll };
}

function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// === Status Color Utility ===

const getStatusColor = (status: 'enrolled' | 'not_enrolled') =>
  status === 'enrolled'
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : 'bg-slate-400/20 text-slate-400 border-slate-400/30';

// === Player 360 Empty State with Search (PRD-022-PATCH-OPTION-B) ===

interface Player360EmptyStateProps {
  /** Callback when a player is selected */
  onSelectPlayer?: (playerId: string) => void;
  className?: string;
}

/**
 * Empty state for Player 360 when no player is selected.
 * Includes search input and recent players list.
 *
 * @see PRD-022-PATCH-OPTION-B - Refactored to include search in empty state
 */
export function Player360EmptyState({
  onSelectPlayer,
  className,
}: Player360EmptyStateProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const { recentPlayers, isLoaded, removeRecent, clearAll } =
    useRecentPlayers();

  // Detect OS for keyboard shortcut display (deferred to avoid hydration mismatch)
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    const ua = navigator.userAgentData;
    const mac =
      ua?.platform?.toLowerCase().includes('mac') ??
      navigator.userAgent.toLowerCase().includes('mac');
    setIsMac(mac);
  }, []);
  const modKey = isMac ? '⌘' : 'Ctrl';

  // Keyboard shortcut handler
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounce search term (300ms)
  React.useEffect(() => {
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

  // Fetch players from API
  const {
    data: searchResults = [],
    isLoading: isSearching,
    error,
  } = useQuery({
    queryKey: ['players', 'search', debouncedSearch],
    queryFn: () => searchPlayers(debouncedSearch, 20),
    enabled: debouncedSearch.length >= 2,
    staleTime: 30_000,
  });

  const handleSelect = (player: PlayerSearchResultDTO) => {
    onSelectPlayer?.(player.id);
    setSearchTerm('');
    setDebouncedSearch('');
  };

  const handleSelectRecent = (playerId: string) => {
    onSelectPlayer?.(playerId);
  };

  const handleClear = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    inputRef.current?.focus();
  };

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
        handleSelect(searchResults[selectedIndex]);
        setSelectedIndex(-1);
      }
    } else if (e.key === 'Escape') {
      handleClear();
      setSelectedIndex(-1);
    }
  };

  const showSearchResults = searchTerm.length >= 2;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-start h-full pt-16 px-4',
        'bg-gradient-to-b from-transparent via-accent/5 to-transparent',
        className,
      )}
      data-testid="player-360-empty-state"
    >
      {/* Header Section */}
      <div className="text-center mb-8">
        <div className="relative mb-4 inline-block">
          <div className="absolute inset-0 w-20 h-20 bg-accent/20 rounded-full blur-xl" />
          <div
            className={cn(
              'relative w-16 h-16 rounded-full',
              'bg-gradient-to-br from-accent/20 to-accent/5',
              'border border-accent/30',
              'flex items-center justify-center',
            )}
          >
            <Search className="h-8 w-8 text-accent/70" />
          </div>
        </div>
        <h2 className="text-xl font-semibold mb-1 tracking-tight">
          Player 360
        </h2>
        <p className="text-muted-foreground text-sm">
          Search for a player to view their profile
        </p>
      </div>

      {/* Search Section */}
      <div className="w-full max-w-md">
        {/* Search Input */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search by name, ID, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            role="combobox"
            aria-expanded={showSearchResults}
            aria-haspopup="listbox"
            aria-controls="empty-state-search-listbox"
            aria-autocomplete="list"
            aria-activedescendant={
              selectedIndex >= 0
                ? `empty-state-search-option-${selectedIndex}`
                : undefined
            }
            className={cn(
              'w-full pl-12 pr-24 py-3 text-base rounded-xl',
              'bg-background/80 border border-border/60',
              'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60',
              'placeholder:text-muted-foreground/50',
              'transition-colors duration-200',
              'shadow-sm',
            )}
            aria-label="Search players"
            data-testid="search-input"
          />
          {/* Keyboard shortcut hint or clear button */}
          {searchTerm ? (
            <button
              onClick={handleClear}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-muted/50 rounded"
              aria-label="Clear search"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-muted-foreground/60">
              <kbd className="px-1.5 py-0.5 rounded bg-muted/50 border border-border/50 font-mono">
                {modKey}
              </kbd>
              <span>+</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted/50 border border-border/50 font-mono">
                K
              </kbd>
            </div>
          )}
        </div>

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

        {/* Search Results */}
        {showSearchResults && (
          <div
            id="empty-state-search-listbox"
            role="listbox"
            aria-label="Search results"
            className="bg-card/90 backdrop-blur-sm rounded-xl border border-border/50 shadow-lg overflow-hidden mb-4"
          >
            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
                <span>Searching...</span>
              </div>
            ) : error ? (
              <div className="py-8 text-center text-sm text-destructive/70">
                Search failed. Please try again.
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground/70">
                No players found for &quot;{searchTerm}&quot;
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {searchResults.map((player, index) => (
                  <button
                    key={player.id}
                    id={`empty-state-search-option-${index}`}
                    role="option"
                    aria-selected={selectedIndex === index}
                    onClick={() => handleSelect(player)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3',
                      'hover:bg-muted/50 transition-colors text-left',
                      'border-b border-border/30 last:border-b-0',
                      selectedIndex === index && 'bg-muted/50',
                    )}
                    data-testid={`player-result-${player.id.slice(0, 8)}`}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full shrink-0',
                        'bg-gradient-to-br from-accent/20 to-accent/5',
                        'border border-accent/30',
                        'flex items-center justify-center',
                        'text-sm font-medium text-accent',
                      )}
                    >
                      {player.full_name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>

                    {/* Player info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {player.full_name}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] h-4 px-1.5 capitalize shrink-0',
                            getStatusColor(player.enrollment_status),
                          )}
                        >
                          {player.enrollment_status === 'enrolled'
                            ? 'Enrolled'
                            : 'Not Enrolled'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {player.birth_date
                          ? `DOB: ${player.birth_date}`
                          : `ID: ${player.id.slice(0, 8)}...`}
                      </div>
                    </div>

                    {/* Selection indicator */}
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0',
                        'border-accent/30 group-hover:border-accent',
                      )}
                    >
                      <Check className="h-3 w-3 text-accent opacity-0 group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recent Players Section */}
        {!showSearchResults && isLoaded && (
          <div className="mt-6">
            {recentPlayers.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    Recent Players
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </Button>
                </div>
                <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/40 overflow-hidden">
                  {recentPlayers.map((player) => (
                    <div
                      key={player.id}
                      className={cn(
                        'group flex items-center gap-3 px-4 py-3',
                        'hover:bg-muted/30 transition-colors',
                        'border-b border-border/30 last:border-b-0',
                      )}
                    >
                      <button
                        onClick={() => handleSelectRecent(player.id)}
                        className="flex-1 flex items-center gap-3 text-left min-w-0"
                      >
                        <div
                          className={cn(
                            'w-9 h-9 rounded-full shrink-0',
                            'bg-muted/50 border border-border/50',
                            'flex items-center justify-center',
                          )}
                        >
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {player.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground/60">
                            {formatTimeAgo(player.viewedAt)}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecent(player.id);
                        }}
                        className={cn(
                          'p-1.5 rounded-md hover:bg-muted/50',
                          'opacity-0 group-hover:opacity-100 transition-opacity',
                        )}
                        aria-label={`Remove ${player.name} from recent`}
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground/60">
                  Recently viewed players will appear here
                </p>
              </div>
            )}
          </div>
        )}

        {/* Search hint when empty */}
        {!showSearchResults && searchTerm.length === 0 && (
          <p className="text-center text-xs text-muted-foreground/60 mt-2">
            Type at least 2 characters to search
          </p>
        )}
      </div>
    </div>
  );
}
