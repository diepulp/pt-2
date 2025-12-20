"use client";

import { User } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { ActivityVisualizationPanel } from "./activity-visualization-panel";
import { CompliancePanel } from "./compliance-panel";
import { LoyaltyPanel } from "./loyalty-panel";
import { MetricsPanel } from "./metrics-panel";
import { NotesPanel } from "./notes-panel";
import { PlayerProfilePanel } from "./player-profile-panel";
import { PlayerSearchCommand } from "./player-search-command";
import { SessionControlPanel } from "./session-control-panel";

interface PlayerDashboardProps {
  className?: string;
}

/**
 * Player Dashboard - Main dashboard for viewing player analytics
 *
 * Layout structure (matching PT-1 reference):
 * - Top: Player search/selector
 * - Row 1: Profile (2/3) + Session Controls (1/3)
 * - Row 2: Performance Metrics (1/2) + Compliance & Risk (1/2)
 * - Row 3: Real-time Activity (2/3) + Notes & Loyalty (1/3)
 *
 * Design: PT-2 dark industrial aesthetic with cyan accent
 */
export function PlayerDashboard({ className }: PlayerDashboardProps) {
  const [selectedPlayerId, setSelectedPlayerId] = React.useState<string | null>(
    null,
  );

  const handleSelectPlayer = (playerId: string) => {
    setSelectedPlayerId(playerId || null);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Player Search/Selector */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <PlayerSearchCommand
            onSelectPlayer={handleSelectPlayer}
            selectedPlayerId={selectedPlayerId}
          />
        </div>
      </div>

      {selectedPlayerId ? (
        <div className="space-y-4">
          {/* Row 1: Profile + Session Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <PlayerProfilePanel playerId={selectedPlayerId} />
            </div>
            <div className="lg:col-span-1">
              <SessionControlPanel
                playerId={selectedPlayerId}
                className="h-full"
              />
            </div>
          </div>

          {/* Row 2: Metrics + Compliance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MetricsPanel
              playerId={selectedPlayerId}
              className="min-h-[400px]"
            />
            <CompliancePanel
              playerId={selectedPlayerId}
              className="min-h-[400px]"
            />
          </div>

          {/* Row 3: Activity + Notes/Loyalty */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ActivityVisualizationPanel
                playerId={selectedPlayerId}
                className="min-h-[420px]"
              />
            </div>
            <div className="lg:col-span-1 space-y-4">
              <NotesPanel
                playerId={selectedPlayerId}
                className="min-h-[200px]"
              />
              <LoyaltyPanel
                playerId={selectedPlayerId}
                className="min-h-[200px]"
              />
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <EmptyState />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      {/* LED accent glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />

      {/* Content */}
      <div className="relative flex flex-col items-center justify-center py-24 px-8">
        {/* Icon container */}
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-accent/20 rounded-full blur-xl animate-pulse" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/30 flex items-center justify-center">
            <User className="h-10 w-10 text-accent/70" />
          </div>
        </div>

        {/* Text */}
        <h3 className="text-lg font-semibold tracking-tight mb-2">
          Select a Player
        </h3>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          Use the search above to find and select a player. You'll be able to
          view their profile, session activity, performance metrics, and loyalty
          status.
        </p>

        {/* Quick tips */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <QuickTip icon="🔍" text="Search by name" />
          <QuickTip icon="📊" text="View real-time metrics" />
          <QuickTip icon="🎯" text="Track session activity" />
        </div>
      </div>
    </div>
  );
}

function QuickTip({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30 border border-border/30 text-xs text-muted-foreground">
      <span>{icon}</span>
      <span>{text}</span>
    </div>
  );
}
