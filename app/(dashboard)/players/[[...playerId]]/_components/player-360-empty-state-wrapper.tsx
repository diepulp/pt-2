/**
 * Player 360 Empty State Wrapper (PRD-022-PATCH-OPTION-B)
 *
 * Client component wrapper for the empty state that handles navigation.
 */

"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { Player360EmptyState } from "@/components/player-360";

/**
 * Wrapper that provides navigation callback to the empty state.
 */
export function Player360EmptyStateWrapper() {
  const router = useRouter();

  const handleSelectPlayer = useCallback(
    (playerId: string) => {
      router.replace(`/players/${playerId}`, { scroll: false });
    },
    [router],
  );

  return <Player360EmptyState onSelectPlayer={handleSelectPlayer} />;
}
