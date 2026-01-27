/**
 * Player 360 Shell (WS1 - PRD-022-PATCH-OPTION-B)
 *
 * Simplified layout wrapper without sidebar.
 * Search is now embedded in the header and empty state.
 *
 * @see PRD-022-PATCH-OPTION-B-PLAYER-360-EMBEDDED-SEARCH.md
 */

"use client";

import * as React from "react";

import { Player360Layout } from "@/components/player-360";
import { cn } from "@/lib/utils";

interface Player360ShellProps {
  /** Currently selected player ID (null if none) */
  playerId: string | null;
  /** Content to render in the main area */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * Shell component that wraps Player 360 content.
 * Simplified layout without sidebar - search is in header and empty state.
 */
export function Player360Shell({
  playerId,
  children,
  className,
}: Player360ShellProps) {
  return (
    <Player360Layout className={cn("h-[calc(100vh-4rem-3rem)]", className)}>
      {/* Main Content Area - Full width now that sidebar is removed */}
      <div
        className="flex-1 flex flex-col min-w-0 overflow-hidden"
        data-testid="player-360-shell"
        data-player-id={playerId ?? undefined}
      >
        {children}
      </div>
    </Player360Layout>
  );
}
