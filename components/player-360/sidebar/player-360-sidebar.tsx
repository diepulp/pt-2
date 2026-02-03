/**
 * Player 360 Sidebar Component (WS2 - PRD-022-PATCH-OPTION-B)
 *
 * Collapsible sidebar with search and recent players for the embedded search architecture.
 * Desktop: persistent collapsible sidebar. Mobile: hidden (use MobileDrawer instead).
 */

'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

import { SidebarToggle } from './sidebar-toggle';

// === Sidebar State Hook ===

const SIDEBAR_STATE_KEY = 'player-360-sidebar-collapsed';

interface SidebarState {
  isCollapsed: boolean;
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
}

export function useSidebarState(): SidebarState {
  const [isCollapsed, setIsCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(SIDEBAR_STATE_KEY);
    return stored === 'true';
  });

  const toggle = React.useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STATE_KEY, String(next));
      return next;
    });
  }, []);

  const expand = React.useCallback(() => {
    setIsCollapsed(false);
    localStorage.setItem(SIDEBAR_STATE_KEY, 'false');
  }, []);

  const collapse = React.useCallback(() => {
    setIsCollapsed(true);
    localStorage.setItem(SIDEBAR_STATE_KEY, 'true');
  }, []);

  return { isCollapsed, toggle, expand, collapse };
}

// === Sidebar Context ===

interface SidebarContextValue {
  playerId: string | null;
  onSelectPlayer: (id: string) => void;
  onClearSelection: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebarContext(): SidebarContextValue {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebarContext must be used within Player360Sidebar');
  }
  return context;
}

// === Main Sidebar Component ===

interface Player360SidebarProps {
  /** Currently selected player ID */
  playerId: string | null;
  /** Callback when a player is selected */
  onSelectPlayer: (id: string) => void;
  /** Callback when selection is cleared */
  onClearSelection: () => void;
  /** External control for collapse state */
  isCollapsed?: boolean;
  /** External toggle function */
  onToggle?: () => void;
  /** Additional class names */
  className?: string;
  /** Children components (SearchSection, RecentPlayersList) */
  children?: React.ReactNode;
}

/**
 * Player 360 sidebar with collapsible behavior.
 * Hidden on mobile (< lg breakpoint) - use MobileDrawer instead.
 */
export function Player360Sidebar({
  playerId,
  onSelectPlayer,
  onClearSelection,
  isCollapsed: externalCollapsed,
  onToggle: externalToggle,
  className,
  children,
}: Player360SidebarProps) {
  const internalState = useSidebarState();
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  // Allow external control or use internal state
  const isCollapsed = externalCollapsed ?? internalState.isCollapsed;
  const toggle = externalToggle ?? internalState.toggle;

  const contextValue = React.useMemo(
    () => ({
      playerId,
      onSelectPlayer,
      onClearSelection,
      searchInputRef,
    }),
    [playerId, onSelectPlayer, onClearSelection],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <aside
        className={cn(
          'hidden lg:flex flex-col shrink-0',
          'border-r border-border/40 bg-card/30',
          'transition-[width] duration-200 ease-in-out',
          'overflow-hidden',
          isCollapsed ? 'w-14' : 'w-72 xl:w-80',
          className,
        )}
        data-testid="player-360-sidebar"
        data-collapsed={isCollapsed}
      >
        {/* Sidebar Header with Toggle */}
        <div
          className={cn(
            'flex items-center shrink-0 h-14 border-b border-border/40 bg-background/50',
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4',
          )}
        >
          {!isCollapsed && (
            <span className="text-sm font-medium text-muted-foreground">
              Player Search
            </span>
          )}
          <SidebarToggle isCollapsed={isCollapsed} onToggle={toggle} />
        </div>

        {/* Sidebar Content */}
        {!isCollapsed && (
          <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
        )}
      </aside>
    </SidebarContext.Provider>
  );
}
