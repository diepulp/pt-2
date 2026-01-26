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

"use client";

import {
  ChevronDown,
  FileText,
  Filter,
  Loader2,
  MessageSquare,
  Shield,
  Tag,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

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
  TimelineCardSkeleton,
  TimelineEmpty,
  TimelineError,
  TimeLensControl,
  usePlayer360Layout,
} from "@/components/player-360";
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPES_BY_CATEGORY,
  getSourceCategoryStyle,
  SOURCE_CATEGORY_STYLES,
  toCollapsedCard,
  type SourceCategory as TimelineSourceCategory,
  type TimelineCardCollapsed,
} from "@/components/player-360/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  usePlayerSummary,
  usePlayerWeeklySeries,
  useTimelineFilter,
  type SourceCategory,
} from "@/hooks/player-360";
import { useInfinitePlayerTimeline } from "@/hooks/player-timeline";
import type { InteractionEventType } from "@/services/player-timeline/dtos";
import type {
  RecentEventsDTO,
  RewardHistoryItemDTO,
} from "@/services/player360-dashboard/dtos";

// === Lucide Icon Components (dynamic icons) ===

const ICON_MAP: Record<string, LucideIcon> = {
  "log-in": LucideIcons.LogIn,
  "log-out": LucideIcons.LogOut,
  "refresh-cw": LucideIcons.RefreshCw,
  play: LucideIcons.Play,
  pause: LucideIcons.Pause,
  square: LucideIcons.Square,
  "arrow-down-circle": LucideIcons.ArrowDownCircle,
  "arrow-up-circle": LucideIcons.ArrowUpCircle,
  eye: LucideIcons.Eye,
  edit: LucideIcons.Edit,
  "plus-circle": LucideIcons.PlusCircle,
  gift: LucideIcons.Gift,
  settings: LucideIcons.Settings,
  ticket: LucideIcons.Ticket,
  "file-text": LucideIcons.FileText,
  tag: LucideIcons.Tag,
  "tag-x": LucideIcons.Tags,
  shield: LucideIcons.Shield,
  "user-plus": LucideIcons.UserPlus,
  "badge-check": LucideIcons.BadgeCheck,
};

function getIconComponent(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? LucideIcons.Circle;
}

// === Types ===

interface TimelinePageContentProps {
  playerId: string;
}

// === Filter State ===

interface FilterState {
  eventTypes: InteractionEventType[];
  fromDate: string | undefined;
  toDate: string | undefined;
}

// === Category to Event Types Mapping ===

const CATEGORY_EVENT_TYPE_MAP: Record<SourceCategory, InteractionEventType[]> =
  {
    session: ["visit_start", "visit_end", "visit_resume"],
    gaming: ["rating_start", "rating_pause", "rating_resume", "rating_close"],
    financial: [
      "cash_in",
      "cash_out",
      "cash_observation",
      "financial_adjustment",
    ],
    loyalty: [
      "points_earned",
      "points_redeemed",
      "points_adjusted",
      "promo_issued",
      "promo_redeemed",
    ],
    compliance: ["mtl_recorded", "identity_verified"],
    note: ["note_added", "tag_applied", "tag_removed"],
  };

// === Timeline Card Component ===

function TimelineCard({ card }: { card: TimelineCardCollapsed }) {
  const style = getSourceCategoryStyle(card.sourceCategory);
  const IconComponent = getIconComponent(card.icon);

  const formatTime = (isoDate: string) => {
    const date = new Date(isoDate);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="flex items-start gap-3 p-3 border-b border-border/40 hover:bg-accent/5 transition-colors">
      {/* Icon */}
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${style.bg} ${style.border} border`}
      >
        <IconComponent className={`w-4 h-4 ${style.text}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-xs font-medium ${style.text}`}>
            {EVENT_TYPE_LABELS[card.eventType]}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatTime(card.occurredAt)}
          </span>
        </div>
        <p className="text-sm text-foreground truncate">{card.summary}</p>
        {card.amount !== null && card.amount !== undefined && (
          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
            ${card.amount.toLocaleString()}
          </span>
        )}
      </div>

      {/* Date */}
      <div className="text-xs text-muted-foreground shrink-0">
        {formatDate(card.occurredAt)}
      </div>
    </div>
  );
}

// === Filter Bar Component ===

function FilterBar({
  filters,
  onFilterChange,
  totalEvents,
}: {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  totalEvents: number;
}) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const activeFilterCount = filters.eventTypes.length;

  const toggleEventType = (eventType: InteractionEventType) => {
    const newTypes = filters.eventTypes.includes(eventType)
      ? filters.eventTypes.filter((t) => t !== eventType)
      : [...filters.eventTypes, eventType];
    onFilterChange({ ...filters, eventTypes: newTypes });
  };

  const clearFilters = () => {
    onFilterChange({ eventTypes: [], fromDate: undefined, toDate: undefined });
  };

  return (
    <div className="border-b border-border/40 bg-background/95 backdrop-blur-sm">
      {/* Filter Bar Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="gap-1.5"
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0">
                {activeFilterCount}
              </Badge>
            )}
            <ChevronDown
              className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {totalEvents} event{totalEvents !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filter Chips */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-3">
          {(
            Object.keys(EVENT_TYPES_BY_CATEGORY) as TimelineSourceCategory[]
          ).map((category) => {
            const categoryStyle = SOURCE_CATEGORY_STYLES[category];
            const eventTypes = EVENT_TYPES_BY_CATEGORY[category];

            return (
              <div key={category}>
                <span className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  {categoryStyle.label}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {eventTypes.map((eventType) => {
                    const isSelected = filters.eventTypes.includes(eventType);
                    return (
                      <button
                        key={eventType}
                        onClick={() => toggleEventType(eventType)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                          isSelected
                            ? `${categoryStyle.bg} ${categoryStyle.text} ${categoryStyle.border}`
                            : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                        }`}
                      >
                        {EVENT_TYPE_LABELS[eventType]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// === Main Content Component ===

export function TimelinePageContent({ playerId }: TimelinePageContentProps) {
  const { activeRightTab, setActiveRightTab } = usePlayer360Layout();

  // Shared filter state via Zustand store
  const { activeCategory, setCategory, timeLens, setTimeLens, clearFilter } =
    useTimelineFilter();

  // Local filter state for timeline (synced with shared state)
  const [filters, setFilters] = React.useState<FilterState>({
    eventTypes: [],
    fromDate: undefined,
    toDate: undefined,
  });

  // Sync local filters with shared category filter
  React.useEffect(() => {
    if (activeCategory) {
      const categoryEventTypes = CATEGORY_EVENT_TYPE_MAP[activeCategory] ?? [];
      setFilters((prev) => ({
        ...prev,
        eventTypes: categoryEventTypes,
      }));
    } else {
      setFilters((prev) => ({
        ...prev,
        eventTypes: [],
      }));
    }
  }, [activeCategory]);

  // Chart collapsed state
  const [isChartCollapsed, setIsChartCollapsed] = React.useState(false);

  // Section ref for timeline scrolling (used by category changes)
  const timelineRef = React.useRef<HTMLDivElement>(null);

  // Fetch player summary for tiles
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    error: summaryError,
  } = usePlayerSummary(playerId);

  // Fetch weekly series for chart
  const { data: weeklyData, isLoading: isWeeklyLoading } =
    usePlayerWeeklySeries(playerId, { timeLens });

  // Fetch timeline data with infinite scroll
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfinitePlayerTimeline(playerId, {
    filters: {
      eventTypes:
        filters.eventTypes.length > 0 ? filters.eventTypes : undefined,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
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

  // Scroll ref for infinite scroll
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Handle scroll for infinite loading
  const handleScroll = React.useCallback(() => {
    if (!scrollContainerRef.current || isFetchingNextPage || !hasNextPage)
      return;

    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    const scrollThreshold = 200; // pixels from bottom to trigger load

    if (scrollHeight - scrollTop - clientHeight < scrollThreshold) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Handle local filter change (also update shared state)
  const handleFilterChange = React.useCallback(
    (newFilters: FilterState) => {
      setFilters(newFilters);
      // Clear shared category filter if custom event types are selected
      if (newFilters.eventTypes.length > 0) {
        // Don't clear if it matches a category
        const matchesCategory = Object.entries(CATEGORY_EVENT_TYPE_MAP).some(
          ([, eventTypes]) =>
            eventTypes.length === newFilters.eventTypes.length &&
            eventTypes.every((et) => newFilters.eventTypes.includes(et)),
        );
        if (!matchesCategory) {
          clearFilter();
        }
      }
    },
    [clearFilter],
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
    setCategory("loyalty");
    timelineRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [setCategory]);

  // Mock recent events data (would come from hook in production)
  const mockRecentEvents: RecentEventsDTO = React.useMemo(
    () => ({
      lastBuyIn: summaryData?.cashVelocity.lastBuyInAt
        ? {
            at: summaryData.cashVelocity.lastBuyInAt,
            amount: summaryData.cashVelocity.sessionTotal,
          }
        : null,
      lastReward:
        summaryData?.rewardsEligibility.status === "available"
          ? null
          : { at: new Date().toISOString(), type: "Matchplay" },
      lastNote: null,
    }),
    [summaryData],
  );

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
                { id: "summary", label: "Summary" },
                { id: "chart", label: "Activity Chart" },
                { id: "timeline", label: "Timeline" },
              ]}
            />
          </div>
        </div>
      </Player360LeftRail>

      {/* Center - Summary, Chart, Timeline */}
      <Player360Center>
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
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
                      className={`w-4 h-4 transition-transform ${isChartCollapsed ? "" : "rotate-180"}`}
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
                        onBucketClick={(weekStart) => {
                          // Apply date filter to timeline
                          const weekEnd = new Date(weekStart);
                          weekEnd.setDate(weekEnd.getDate() + 7);
                          setFilters((prev) => ({
                            ...prev,
                            fromDate: weekStart,
                            toDate: weekEnd.toISOString().split("T")[0],
                          }));
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
            data={mockRecentEvents}
            onEventClick={(type) => {
              // Scroll to timeline and filter by type
              if (type === "buyIn") setCategory("financial");
              if (type === "reward") setCategory("loyalty");
              if (type === "note") setCategory("note");
              timelineRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          />

          {/* Timeline Section */}
          <div ref={timelineRef} id="timeline">
            {/* Filter Bar */}
            <FilterBar
              filters={filters}
              onFilterChange={handleFilterChange}
              totalEvents={allEvents.length}
            />

            {/* Timeline Content */}
            <div>
              {isLoading && (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TimelineCardSkeleton key={i} />
                  ))}
                </div>
              )}

              {isError && (
                <div className="p-4">
                  <TimelineError
                    message={error?.message ?? "Failed to load timeline"}
                    onRetry={() => window.location.reload()}
                  />
                </div>
              )}

              {!isLoading && !isError && cards.length === 0 && (
                <div className="p-4">
                  <TimelineEmpty type="no-events" />
                </div>
              )}

              {!isLoading && !isError && cards.length > 0 && (
                <>
                  {cards.map((card) => (
                    <TimelineCard key={card.eventId} card={card} />
                  ))}

                  {/* Load More Indicator */}
                  {isFetchingNextPage && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">
                        Loading more...
                      </span>
                    </div>
                  )}

                  {hasNextPage && !isFetchingNextPage && (
                    <div className="flex justify-center py-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchNextPage()}
                      >
                        Load More
                      </Button>
                    </div>
                  )}

                  {!hasNextPage && cards.length > 0 && (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      End of timeline
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </Player360Center>

      {/* Right Rail - Collaboration/Compliance */}
      <Player360RightRail>
        {/* Tab Switcher */}
        <div className="flex border-b border-border/40">
          <button
            onClick={() => setActiveRightTab("collaboration")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeRightTab === "collaboration"
                ? "text-foreground border-b-2 border-accent"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="w-4 h-4 inline-block mr-1.5" />
            Notes
          </button>
          <button
            onClick={() => setActiveRightTab("compliance")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeRightTab === "compliance"
                ? "text-foreground border-b-2 border-accent"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Shield className="w-4 h-4 inline-block mr-1.5" />
            Compliance
          </button>
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeRightTab === "collaboration" && <CollaborationPlaceholder />}
          {activeRightTab === "compliance" && <CompliancePlaceholder />}
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

function CompliancePlaceholder() {
  return (
    <div className="space-y-4">
      <PanelHeader
        icon={<Shield className="h-4 w-4 text-accent" />}
        title="Compliance Status"
      />
      <PanelContent padding={false}>
        <div className="text-center py-8 text-muted-foreground">
          <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">CTR & MTL data will appear here</p>
          <p className="text-xs mt-1">Coming in Phase 4</p>
        </div>
      </PanelContent>
    </div>
  );
}
