/**
 * Timeline Page Content Component
 *
 * Main content component for the Player 360 timeline page.
 * Implements the 3-panel layout with timeline, metrics, and collaboration.
 *
 * @see ADR-029-player-360-interaction-event-taxonomy.md
 * @see EXEC-SPEC-029.md WS3-C
 */

"use client";

import {
  ChevronDown,
  Clock,
  FileText,
  Filter,
  Loader2,
  MessageSquare,
  Shield,
  Tag,
  User,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

import {
  MetricsGrid,
  PanelContent,
  PanelHeader,
  Player360Body,
  Player360Center,
  Player360Header,
  Player360LeftRail,
  Player360RightRail,
  TimelineCardSkeleton,
  TimelineEmpty,
  TimelineError,
  usePlayer360Layout,
} from "@/components/player-360";
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPES_BY_CATEGORY,
  getSourceCategory,
  getSourceCategoryStyle,
  SOURCE_CATEGORY_STYLES,
  toCollapsedCard,
  type SourceCategory,
  type TimelineCardCollapsed,
} from "@/components/player-360/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useInfinitePlayerTimeline } from "@/hooks/player-timeline";
import type { InteractionEventType } from "@/services/player-timeline/dtos";

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
          {(Object.keys(EVENT_TYPES_BY_CATEGORY) as SourceCategory[]).map(
            (category) => {
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
            },
          )}
        </div>
      )}
    </div>
  );
}

// === Metrics Tile Component ===

function MetricTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10 border border-accent/20">
            <Icon className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// === Main Content Component ===

export function TimelinePageContent({ playerId }: TimelinePageContentProps) {
  const { activeRightTab, setActiveRightTab } = usePlayer360Layout();
  const [filters, setFilters] = React.useState<FilterState>({
    eventTypes: [],
    fromDate: undefined,
    toDate: undefined,
  });

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

  return (
    <>
      {/* Header */}
      <Player360Header>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent/10 border border-accent/20">
              <User className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Player Timeline</h1>
              <p className="text-xs text-muted-foreground">
                ID: {playerId.slice(0, 8)}...
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Clock className="w-3 h-3" />
              Live
            </Badge>
          </div>
        </div>
      </Player360Header>

      {/* Body - Three Panel Layout */}
      <Player360Body>
        {/* Left Rail - Metrics */}
        <Player360LeftRail>
          <div className="p-4">
            <h2 className="text-sm font-semibold mb-4">Key Metrics</h2>
            <MetricsGrid>
              <MetricTile
                label="Total Events"
                value={allEvents.length.toString()}
                icon={Clock}
              />
              <MetricTile
                label="Session Events"
                value={allEvents
                  .filter((e) => getSourceCategory(e.eventType) === "session")
                  .length.toString()}
                icon={User}
              />
              <MetricTile
                label="Financial Events"
                value={allEvents
                  .filter((e) => getSourceCategory(e.eventType) === "financial")
                  .length.toString()}
                icon={LucideIcons.DollarSign}
              />
              <MetricTile
                label="Compliance Events"
                value={allEvents
                  .filter(
                    (e) => getSourceCategory(e.eventType) === "compliance",
                  )
                  .length.toString()}
                icon={Shield}
              />
            </MetricsGrid>
          </div>
        </Player360LeftRail>

        {/* Center - Timeline */}
        <Player360Center>
          {/* Filter Bar */}
          <FilterBar
            filters={filters}
            onFilterChange={setFilters}
            totalEvents={allEvents.length}
          />

          {/* Timeline Content */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
          >
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
      </Player360Body>
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
