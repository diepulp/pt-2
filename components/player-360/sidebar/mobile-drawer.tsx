/**
 * Mobile Drawer (WS6 - PRD-022-PATCH-OPTION-B)
 *
 * Sheet-based drawer for sidebar on mobile devices.
 * Contains same content as desktop sidebar (search + recent players).
 *
 * @see PRD-022-PATCH-OPTION-B-PLAYER-360-EMBEDDED-SEARCH.md
 * @see EXECUTION-SPEC-PRD-022-PATCH-OPTION-B.md WS6
 */

'use client';

import { Menu, Search, User } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface MobileDrawerProps {
  /** Currently selected player ID */
  playerId: string | null;
  /** Callback when a player is selected */
  onSelectPlayer: (id: string) => void;
  /** Whether the drawer is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Search section component */
  searchSection: React.ReactNode;
  /** Recent players list component */
  recentPlayersList: React.ReactNode;
  /** Additional class names for trigger button */
  className?: string;
}

/**
 * Mobile drawer that contains the search sidebar content.
 * Uses Sheet component from shadcn/ui.
 * Automatically closes when a player is selected.
 */
export function MobileDrawer({
  playerId,
  onSelectPlayer,
  open,
  onOpenChange,
  searchSection,
  recentPlayersList,
  className,
}: MobileDrawerProps) {
  /**
   * Wraps onSelectPlayer to close drawer after selection.
   */
  const handleSelectPlayer = React.useCallback(
    (id: string) => {
      onSelectPlayer(id);
      onOpenChange(false);
    },
    [onSelectPlayer, onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('lg:hidden h-9 w-9', className)}
          data-testid="mobile-menu-button"
          aria-label="Open player search"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-80 p-0 flex flex-col"
        data-testid="mobile-drawer"
      >
        <SheetHeader className="px-4 py-3 border-b border-border/40">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-accent" />
            Player Search
          </SheetTitle>
        </SheetHeader>

        {/* Drawer Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Section with wrapped handler */}
          <MobileDrawerSearchWrapper
            searchSection={searchSection}
            onSelectPlayer={handleSelectPlayer}
          />

          {/* Recent Players with wrapped handler */}
          <MobileDrawerRecentWrapper
            recentPlayersList={recentPlayersList}
            onSelectPlayer={handleSelectPlayer}
          />
        </div>

        {/* Current Selection Indicator */}
        {playerId && (
          <div className="p-4 border-t border-border/40 bg-accent/5">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-accent" />
              <span className="text-muted-foreground">Selected:</span>
              <span className="font-mono text-xs truncate">
                {playerId.slice(0, 8)}...
              </span>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Wrapper to inject close-on-select behavior into search section.
 * Uses React.cloneElement to pass the wrapped handler.
 */
function MobileDrawerSearchWrapper({
  searchSection,
  onSelectPlayer,
}: {
  searchSection: React.ReactNode;
  onSelectPlayer: (id: string) => void;
}) {
  if (!React.isValidElement(searchSection)) {
    return <>{searchSection}</>;
  }

  // Clone the element and override onSelectPlayer
  return React.cloneElement(
    searchSection as React.ReactElement<{
      onSelectPlayer: (id: string) => void;
    }>,
    { onSelectPlayer },
  );
}

/**
 * Wrapper to inject close-on-select behavior into recent players list.
 */
function MobileDrawerRecentWrapper({
  recentPlayersList,
  onSelectPlayer,
}: {
  recentPlayersList: React.ReactNode;
  onSelectPlayer: (id: string) => void;
}) {
  if (!React.isValidElement(recentPlayersList)) {
    return <>{recentPlayersList}</>;
  }

  return React.cloneElement(
    recentPlayersList as React.ReactElement<{
      onSelectPlayer: (id: string) => void;
    }>,
    { onSelectPlayer },
  );
}

/**
 * Hook to manage mobile drawer state.
 * Convenience wrapper around useState with named methods.
 */
export function useMobileDrawer() {
  const [isOpen, setIsOpen] = React.useState(false);

  const open = React.useCallback(() => setIsOpen(true), []);
  const close = React.useCallback(() => setIsOpen(false), []);
  const toggle = React.useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    setIsOpen,
    open,
    close,
    toggle,
  };
}
