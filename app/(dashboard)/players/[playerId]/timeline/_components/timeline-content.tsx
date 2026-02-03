/**
 * Timeline Page Content — Thin Orchestrator
 *
 * Composes isolated panel components, each with independent hook subscriptions.
 * This eliminates the render cascade where 9 hooks in a single component caused
 * 10-12 re-renders on cold mount.
 *
 * Layout: 3-panel (Left Rail, Center, Right Rail)
 * - Left Rail: FilterPanel (owns usePlayerSummary + useTimelineFilter)
 * - Center: SummaryPanel, ChartPanel, TimelinePanel (each own their hooks)
 * - Right Rail: CollaborationPlaceholder, CompliancePanelWrapper (owns useAuth + useGamingDaySummary)
 *
 * @see PERF-006 WS4 — Component Architecture Refactor
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import { FileText, MessageSquare, Shield, Tag } from 'lucide-react';
import * as React from 'react';

import {
  PanelContent,
  PanelHeader,
  Player360Center,
  Player360LeftRail,
  Player360RightRail,
  usePlayer360Layout,
} from '@/components/player-360';

import { ChartPanel } from './chart-panel';
import { CompliancePanelWrapper } from './compliance-panel-wrapper';
import { FilterPanel } from './filter-panel';
import { SummaryPanel } from './summary-panel';
import { TimelinePanel } from './timeline-panel';

// === Types ===

interface TimelinePageContentProps {
  playerId: string;
  /** Server-computed gaming day (PERF-006 WS5) */
  gamingDay: string;
}

// === Main Content Component ===

export function TimelinePageContent({
  playerId,
  gamingDay,
}: TimelinePageContentProps) {
  const { activeRightTab, setActiveRightTab } = usePlayer360Layout();

  // Section ref for timeline scrolling (used by category changes)
  const timelineRef = React.useRef<HTMLDivElement>(null);

  const scrollToTimeline = React.useCallback(() => {
    timelineRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <>
      {/* Left Rail - Filter Tiles & Rewards */}
      <Player360LeftRail>
        <FilterPanel
          playerId={playerId}
          gamingDay={gamingDay}
          onScrollToTimeline={scrollToTimeline}
        />
      </Player360LeftRail>

      {/* Center - Summary, Chart, Timeline */}
      <Player360Center>
        <div className="flex flex-col h-full overflow-hidden">
          <SummaryPanel
            playerId={playerId}
            gamingDay={gamingDay}
            onScrollToTimeline={scrollToTimeline}
          />

          <ChartPanel
            playerId={playerId}
            onBucketClick={() => scrollToTimeline()}
          />

          <TimelinePanel playerId={playerId} timelineRef={timelineRef} />
        </div>
      </Player360Center>

      {/* Right Rail - Collaboration/Compliance */}
      <Player360RightRail>
        {/* Tab Switcher */}
        <div className="flex border-b border-border/40">
          <button
            onClick={() => setActiveRightTab('collaboration')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeRightTab === 'collaboration'
                ? 'text-foreground border-b-2 border-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageSquare className="w-4 h-4 inline-block mr-1.5" />
            Notes
          </button>
          <button
            onClick={() => setActiveRightTab('compliance')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeRightTab === 'compliance'
                ? 'text-foreground border-b-2 border-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Shield className="w-4 h-4 inline-block mr-1.5" />
            Compliance
          </button>
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeRightTab === 'collaboration' && <CollaborationPlaceholder />}
          {activeRightTab === 'compliance' && (
            <CompliancePanelWrapper playerId={playerId} gamingDay={gamingDay} />
          )}
        </div>
      </Player360RightRail>
    </>
  );
}

// === Placeholder Components for Right Rail ===
// These will be replaced with real data-connected components in Phase 4

function CollaborationPlaceholder() {
  return (
    <div className="space-y-4">
      <PanelHeader
        icon={<FileText className="h-4 w-4 text-accent" />}
        title="Notes"
      />
      <PanelContent padding={false}>
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Notes will appear here</p>
          <p className="text-xs mt-1">Coming in Phase 4</p>
        </div>
      </PanelContent>

      <PanelHeader
        icon={<Tag className="h-4 w-4 text-accent" />}
        title="Tags"
      />
      <PanelContent padding={false}>
        <div className="text-center py-8 text-muted-foreground">
          <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Tags will appear here</p>
          <p className="text-xs mt-1">Coming in Phase 4</p>
        </div>
      </PanelContent>
    </div>
  );
}
