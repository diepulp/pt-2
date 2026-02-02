/**
 * Timeline Page Content Component
 *
 * Main content component for the Player 360 timeline page.
 * Implements the 3-panel layout with:
 * - Left Rail: Filter tiles, rewards eligibility, jump-to navigation
 * - Center Panel: Summary band, activity chart, recent events, timeline
 * - Right Rail: Collaboration (notes/tags), compliance
 *
 * NOTE: This component is rendered inside Player360ContentWrapper which provides
 * the header (Player360HeaderContent) and body wrapper (Player360Body).
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import {
  ChevronDown,
  FileText,
  MessageSquare,
  Shield,
  Tag,
} from 'lucide-react';
import * as React from 'react';

import {
  ActivityChart,
  FilterTileStack,
  JumpToNav,
  PanelContent,
  PanelHeader,
  Player360Center,
  Player360LeftRail,
  Player360RightRail,
  RecentEventsStrip,
  RewardsEligibilityCard,
  RewardsHistoryList,
  SummaryBand,
  TimeLensControl,
  usePlayer360Layout,
} from '@/components/player-360';
import {
  CompliancePanel,
  type CtrStatus,
} from '@/components/player-360/compliance/panel';
import {
  GroupedTimeline,
  toCollapsedCard,
} from '@/components/player-360/timeline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useGamingDay } from '@/hooks/casino';
import { useGamingDaySummary } from '@/hooks/mtl';
import {
  usePlayerSummary,
  usePlayerWeeklySeries,
  useRecentEvents,
  useTimelineFilter,
  type SourceCategory,
} from '@/hooks/player-360';
import { useInfinitePlayerTimeline } from '@/hooks/player-timeline';
import { useAuth } from '@/hooks/use-auth';
import type { InteractionEventType } from '@/services/player-timeline/dtos';
import type { RewardHistoryItemDTO } from '@/services/player360-dashboard/dtos';
import { getCurrentGamingDay } from '@/services/player360-dashboard/mappers';

// === Types ===

interface TimelinePageContentProps {
  playerId: string;
}

// === Category to Event Types Mapping ===

const CATEGORY_EVENT_TYPE_MAP: Record<SourceCategory, InteractionEventType[]> =
  {
    session: ['visit_start', 'visit_end', 'visit_resume'],
    gaming: ['rating_start', 'rating_pause', 'rating_resume', 'rating_close'],
    financial: [
      'cash_in',
      'cash_out',
      'cash_observation',
      'financial_adjustment',
    ],
    loyalty: [
      'points_earned',
      'points_redeemed',
      'points_adjusted',
      'promo_issued',
      'promo_redeemed',
    ],
    staff: ['note_added', 'tag_applied', 'tag_removed'],
    compliance: ['mtl_recorded'],
    identity: ['player_enrolled', 'identity_verified'],
  };

// === Main Content Component ===

export function TimelinePageContent({ playerId }: TimelinePageContentProps) {
  const { activeRightTab, setActiveRightTab } = usePlayer360Layout();

  // Shared filter state via Zustand store
  const { activeCategory, setCategory, timeLens, setTimeLens } =
    useTimelineFilter();

  // Derive event type filters from active category for server-side filtering
  const eventTypeFilters = React.useMemo(() => {
    if (!activeCategory) return undefined;
    return CATEGORY_EVENT_TYPE_MAP[activeCategory] ?? undefined;
  }, [activeCategory]);

  // Compute casino-aware gaming day (falls back to UTC calendar date while loading)
  const { data: gamingDayData } = useGamingDay();
  const gamingDay = gamingDayData?.gaming_day ?? getCurrentGamingDay();

  // Chart collapsed state
  const [isChartCollapsed, setIsChartCollapsed] = React.useState(false);

  // Section ref for timeline scrolling (used by category changes)
  const timelineRef = React.useRef<HTMLDivElement>(null);

  // Fetch player summary for tiles
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    error: summaryError,
  } = usePlayerSummary(playerId, { gamingDay });

  // Fetch weekly series for chart
  const { data: weeklyData, isLoading: isWeeklyLoading } =
    usePlayerWeeklySeries(playerId, { timeLens });

  // Fetch timeline data with infinite scroll
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfinitePlayerTimeline(playerId, {
    filters: {
      eventTypes: eventTypeFilters,
      limit: 50,
    },
  });

  // Flatten pages to get all events
  const allEvents = React.useMemo(
    () => data?.pages.flatMap((page) => page.events) ?? [],
    [data],
  );

  // Map to card format
  const cards = React.useMemo(
    () => allEvents.map(toCollapsedCard),
    [allEvents],
  );

  // Handle category change from tiles
  const handleCategoryChange = React.useCallback(
    (category: SourceCategory | null) => {
      setCategory(category);
    },
    [setCategory],
  );

  // Handle rewards card "show related events"
  const handleShowLoyaltyEvents = React.useCallback(() => {
    setCategory('loyalty');
    timelineRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [setCategory]);

  // === WS4: Recent Events Hook ===
  const { data: recentEventsData } = useRecentEvents(playerId);
  const recentEvents = recentEventsData ?? {
    lastBuyIn: null,
    lastReward: null,
    lastNote: null,
  };

  // === WS2: Compliance Panel Hooks ===
  const { casinoId } = useAuth();
  const { data: complianceData, isLoading: isComplianceLoading } =
    useGamingDaySummary({
      casinoId: casinoId ?? '',
      gamingDay: summaryData?.gamingDay ?? gamingDay,
      patronId: playerId,
    });

  // Transform compliance data to panel props
  const ctrStatus: CtrStatus | null = React.useMemo(() => {
    if (!complianceData?.items?.[0]) return null;
    const item = complianceData.items[0];
    return {
      todayTotal: (item.total_in ?? 0) + (item.total_out ?? 0),
      threshold: 10000,
      isTriggered:
        item.agg_badge_in === 'agg_ctr_met' ||
        item.agg_badge_out === 'agg_ctr_met',
      isFiled: false, // CTR filing status not tracked yet
      gamingDay: item.gaming_day,
    };
  }, [complianceData]);

  // Mock rewards history (would come from hook in production)
  const mockRewardsHistory: RewardHistoryItemDTO[] = [];

  return (
    <>
      {/* Left Rail - Filter Tiles & Rewards */}
      <Player360LeftRail>
        <div className="flex flex-col h-full p-4 space-y-4">
          {/* Filter Tiles */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Quick Filters
            </h3>
            {isSummaryLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 bg-muted/30 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : summaryData ? (
              <FilterTileStack
                data={summaryData}
                activeCategory={activeCategory}
                onCategoryChange={handleCategoryChange}
              />
            ) : null}
          </div>

          {/* Rewards Eligibility */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Rewards
            </h3>
            {isSummaryLoading ? (
              <div className="h-24 bg-muted/30 rounded-lg animate-pulse" />
            ) : summaryData ? (
              <RewardsEligibilityCard
                data={summaryData.rewardsEligibility}
                onShowRelatedEvents={handleShowLoyaltyEvents}
              />
            ) : null}
          </div>

          {/* Rewards History */}
          {mockRewardsHistory.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Recent Rewards
              </h3>
              <RewardsHistoryList
                items={mockRewardsHistory}
                onItemClick={() => {}}
              />
            </div>
          )}

          {/* Jump To Navigation */}
          <div className="mt-auto">
            <JumpToNav
              targets={[
                { id: 'summary', label: 'Summary' },
                { id: 'chart', label: 'Activity Chart' },
                { id: 'timeline', label: 'Timeline' },
              ]}
            />
          </div>
        </div>
      </Player360LeftRail>

      {/* Center - Summary, Chart, Timeline */}
      <Player360Center>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Summary Section */}
          <div id="summary" className="p-4 space-y-4">
            {/* Time Lens Control */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Session Summary</h2>
              <TimeLensControl value={timeLens} onChange={setTimeLens} />
            </div>

            {/* Summary Band */}
            {isSummaryLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 bg-muted/30 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : summaryError ? (
              <Card className="bg-destructive/10 border-destructive/20">
                <CardContent className="p-4 text-sm text-destructive">
                  Failed to load summary: {summaryError.message}
                </CardContent>
              </Card>
            ) : summaryData ? (
              <SummaryBand
                data={summaryData}
                activeCategory={activeCategory}
                onCategoryChange={handleCategoryChange}
              />
            ) : null}
          </div>

          {/* Activity Chart Section */}
          <div id="chart" className="px-4 pb-4">
            <Collapsible
              open={!isChartCollapsed}
              onOpenChange={(open) => setIsChartCollapsed(!open)}
            >
              <Card>
                <CardHeader className="py-3 px-4">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <CardTitle className="text-sm font-semibold">
                      Activity
                    </CardTitle>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${isChartCollapsed ? '' : 'rotate-180'}`}
                    />
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4">
                    {isWeeklyLoading ? (
                      <div className="h-48 bg-muted/30 rounded-lg animate-pulse" />
                    ) : weeklyData ? (
                      <ActivityChart
                        data={weeklyData}
                        height={180}
                        onBucketClick={(_weekStart) => {
                          // TODO: Implement date range filtering using weekStart
                          // For now, scroll to timeline section
                          timelineRef.current?.scrollIntoView({
                            behavior: 'smooth',
                          });
                        }}
                      />
                    ) : null}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>

          {/* Recent Events Strip */}
          <RecentEventsStrip
            data={recentEvents}
            onEventClick={(type) => {
              // Scroll to timeline and filter by type
              if (type === 'buyIn') setCategory('financial');
              if (type === 'reward') setCategory('loyalty');
              if (type === 'note') setCategory('staff');
              timelineRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
          />

          {/* Timeline Section - Grouped View */}
          <div ref={timelineRef} id="timeline" className="flex-1 min-h-0">
            <GroupedTimeline
              cards={cards}
              isLoading={isLoading}
              isError={isError}
              errorMessage={error?.message}
              hasNextPage={hasNextPage ?? false}
              isFetchingNextPage={isFetchingNextPage}
              onFetchNextPage={fetchNextPage}
              onRetry={() => {
                void refetch();
              }}
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              onEventClick={(_event) => {
                // TODO: Open event detail panel
              }}
              groupIntervalMinutes={30}
            />
          </div>
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
            <CompliancePanel
              ctrStatus={ctrStatus}
              mtlEntries={[]}
              isLoading={isComplianceLoading}
            />
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
