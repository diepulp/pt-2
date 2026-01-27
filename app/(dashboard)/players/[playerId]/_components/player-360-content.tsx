/**
 * Player 360 Content Component (Client)
 *
 * Handles anchor scroll behavior and wraps the timeline content.
 * Client component for useEffect-based scroll handling.
 *
 * @see PRD-022 WS1 Player 360 Canonical Route
 */

"use client";

import { useEffect } from "react";

import { TimelinePageContent } from "../timeline/_components/timeline-content";

interface Player360ContentProps {
  playerId: string;
  // returnTo is passed down for potential use by child components
  // Currently used by Player360Breadcrumb via searchParams
}

export function Player360Content({ playerId }: Player360ContentProps) {
  // Anchor scroll on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#timeline") {
      // Small delay to allow DOM to settle
      requestAnimationFrame(() => {
        const el = document.getElementById("timeline");
        el?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, []);

  return (
    <div data-testid="player-360-page">
      <TimelinePageContent playerId={playerId} />
    </div>
  );
}
