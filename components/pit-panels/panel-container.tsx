"use client";

import {
  Activity,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Package,
  TrendingUp,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RealtimeStatusIndicator } from "@/hooks/dashboard";
import type {
  DashboardTableDTO,
  DashboardStats,
} from "@/hooks/dashboard/types";
import { usePitDashboardUI } from "@/hooks/ui";
import { useSwipe } from "@/hooks/utilities";
import { cn } from "@/lib/utils";
import type { RatingSlipDTO } from "@/services/rating-slip/dtos";
import type { PanelType } from "@/store/pit-dashboard-store";

import { ActivityPanel } from "./activity-panel";
import { AnalyticsPanel } from "./analytics-panel";
import { InventoryPanel } from "./inventory-panel";
import { TablesPanel } from "./tables-panel";

interface SeatOccupant {
  firstName: string;
  lastName: string;
  slipId?: string;
}

interface PanelContainerProps {
  casinoId: string;
  tableName: string;
  className?: string;

  // Tables data
  tables: DashboardTableDTO[];
  selectedTable: DashboardTableDTO | null;
  seats: (SeatOccupant | null)[];
  activeSlips: RatingSlipDTO[];
  stats: DashboardStats | null;
  isLoading: boolean;
  gamingDay: { date: string } | null;
  realtimeConnected: boolean;
  realtimeError: Error | null;

  // Callbacks
  onSeatClick: (index: number, occupant: SeatOccupant | null) => void;
  onNewSlip: () => void;
  onSlipClick: (slipId: string) => void;

  /**
   * Mobile mode: Hides the vertical tab navigation sidebar.
   * Content fills the full width. Navigation handled by MobileTableOpsDrawer.
   */
  mobileMode?: boolean;
  /**
   * Review mode: Adds resizable panels for supporting sections.
   */
  reviewMode?: boolean;
}

/**
 * Panel Container - Main container with vertical tab navigation
 * Tabbed interface for Tables, Inventory, and Analytics panels
 *
 * PRD-013: Refactored to consume activePanel state from Zustand store
 */
export function PanelContainer({
  casinoId,
  tableName,
  className,
  tables,
  selectedTable,
  seats,
  activeSlips,
  stats,
  isLoading,
  gamingDay,
  realtimeConnected,
  realtimeError,
  onSeatClick,
  onNewSlip,
  onSlipClick,
  mobileMode = false,
  reviewMode = false,
}: PanelContainerProps) {
  // PRD-013: Consume UI state from Zustand store
  const { activePanel, setActivePanel } = usePitDashboardUI();

  const [isCollapsed, setIsCollapsed] = React.useState(true);
  const drawerRef = React.useRef<HTMLDivElement>(null);

  // Detect platform for keyboard shortcuts
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf("MAC") >= 0);
  }, []);

  // Cross-platform modifier key display
  const modKey = isMac ? "⌘" : "Ctrl+";

  // Close drawer when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        !isCollapsed &&
        drawerRef.current &&
        !drawerRef.current.contains(event.target as Node)
      ) {
        setIsCollapsed(true);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCollapsed]);

  // Notification counts from real data
  const notifications = React.useMemo(
    () => ({
      tables: activeSlips.length,
      activity: activeSlips.length,
      inventory: 0, // TODO: Wire to inventory data when available
      analytics: 0,
    }),
    [activeSlips.length],
  );

  const panels = React.useMemo(
    () => [
      {
        id: "tables",
        label: "Tables",
        description: "",
        icon: LayoutGrid,
        shortcut: `${modKey}1`,
        notifications: notifications.tables,
      },
      {
        id: "activity",
        label: "Activity",
        description: "",
        icon: Activity,
        shortcut: `${modKey}2`,
        notifications: notifications.activity,
      },
      {
        id: "inventory",
        label: "Inventory",
        description: "",
        icon: Package,
        shortcut: `${modKey}3`,
        notifications: notifications.inventory,
      },
      {
        id: "analytics",
        label: "Analytics",
        description: "",
        icon: TrendingUp,
        shortcut: `${modKey}4`,
        notifications: notifications.analytics,
      },
    ],
    [modKey, notifications],
  );

  // Panel IDs for swipe navigation
  const panelIds = panels.map((p) => p.id);

  // Swipe handlers for horizontal panel navigation
  const { handlers: swipeHandlers } = useSwipe({
    threshold: 60,
    onSwipeLeft: () => {
      const currentIndex = panelIds.indexOf(activePanel);
      if (currentIndex < panelIds.length - 1) {
        setActivePanel(panelIds[currentIndex + 1] as typeof activePanel);
      }
    },
    onSwipeRight: () => {
      const currentIndex = panelIds.indexOf(activePanel);
      if (currentIndex > 0) {
        setActivePanel(panelIds[currentIndex - 1] as typeof activePanel);
      }
    },
  });

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "1":
            e.preventDefault();
            setActivePanel("tables");
            break;
          case "2":
            e.preventDefault();
            setActivePanel("activity");
            break;
          case "3":
            e.preventDefault();
            setActivePanel("inventory");
            break;
          case "4":
            e.preventDefault();
            setActivePanel("analytics");
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const renderActivePanel = () => {
    switch (activePanel) {
      case "tables":
        return (
          <TablesPanel
            tableName={tableName}
            selectedTable={selectedTable}
            seats={seats}
            activeSlips={activeSlips}
            isLoading={isLoading}
            onSeatClick={onSeatClick}
            onNewSlip={onNewSlip}
          />
        );
      case "activity":
        return (
          <ActivityPanel
            tableName={tableName}
            activeSlips={activeSlips}
            seats={seats}
            isLoading={isLoading}
            onSlipClick={onSlipClick}
          />
        );
      case "inventory":
        return <InventoryPanel tableName={tableName} />;
      case "analytics":
        return <AnalyticsPanel tableName={tableName} />;
      default:
        return (
          <TablesPanel
            tableName={tableName}
            selectedTable={selectedTable}
            seats={seats}
            activeSlips={activeSlips}
            isLoading={isLoading}
            onSeatClick={onSeatClick}
            onNewSlip={onNewSlip}
          />
        );
    }
  };

  const mainPanel = (
    <div
      className={cn(
        "h-full flex flex-col",
        !mobileMode && "pl-14", // Only add padding for sidebar on desktop
        mobileMode && "pb-16", // Add padding for bottom navigation tabs on mobile
      )}
    >
      {/* Panel content with swipe handlers for mobile */}
      <div className="flex-1 flex flex-col overflow-hidden" {...swipeHandlers}>
        {/* Swipe indicator for mobile */}
        <div className="md:hidden flex justify-center gap-1.5 py-2">
          {panelIds.map((id) => (
            <div
              key={id}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-200",
                activePanel === id ? "w-4 bg-accent" : "bg-muted-foreground/30",
              )}
            />
          ))}
        </div>
        {renderActivePanel()}
      </div>

      {/* Mobile Bottom Navigation Tabs */}
      {mobileMode && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-background/95 backdrop-blur-sm border-t border-border/40">
          <Tabs
            value={activePanel}
            onValueChange={(value) => setActivePanel(value as PanelType)}
            className="h-full"
          >
            <TabsList className="grid grid-cols-4 h-full bg-transparent p-0">
              {panels.map((panel) => {
                const Icon = panel.icon;
                const isActive = activePanel === panel.id;

                return (
                  <TabsTrigger
                    key={panel.id}
                    value={panel.id}
                    className={cn(
                      "flex flex-col items-center gap-0.5 h-full py-1.5",
                      "data-[state=active]:bg-accent/10 data-[state=active]:text-accent",
                      "hover:bg-muted/50 transition-colors",
                    )}
                  >
                    <div className="relative">
                      <Icon
                        className={cn(
                          "h-5 w-5",
                          isActive ? "text-accent" : "text-muted-foreground",
                        )}
                      />
                      {panel.notifications > 0 && (
                        <div
                          className={cn(
                            "absolute -top-2 -right-2 h-4 w-4 rounded-full bg-accent text-[10px] text-accent-foreground",
                            "flex items-center justify-center font-bold",
                          )}
                        >
                          {panel.notifications > 9 ? "9+" : panel.notifications}
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        isActive ? "text-accent" : "text-muted-foreground",
                      )}
                    >
                      {panel.label}
                    </span>
                    <kbd
                      className={cn(
                        "absolute top-1 right-2 text-[8px] font-mono text-muted-foreground/60",
                        isActive && "text-accent/60",
                      )}
                    >
                      {panel.shortcut}
                    </kbd>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn("relative h-full bg-background overflow-hidden", className)}
    >
      {/* Panel Content - Full width, with left padding for collapsed drawer on desktop and bottom padding for mobile tabs */}
      {reviewMode && !mobileMode ? (
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={62} minSize={42}>
            {mainPanel}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={38} minSize={22}>
            <ResizablePanelGroup direction="vertical" className="h-full">
              <ResizablePanel defaultSize={50} minSize={25}>
                <div className="h-full border-b border-border/40 bg-card/30 px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">
                        Review Section A
                      </p>
                      <h3 className="text-sm font-semibold text-foreground">
                        Under Construction
                      </h3>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Placeholder
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Dedicated review surface for the next pit ops module.
                  </p>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={25}>
                <div className="h-full bg-card/30 px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">
                        Review Section B
                      </p>
                      <h3 className="text-sm font-semibold text-foreground">
                        Under Construction
                      </h3>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Placeholder
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Reserve for compliance, alerts, or table insights.
                  </p>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        mainPanel
      )}

      {/* Vertical Tab Navigation - Overlay drawer on LEFT (desktop only) */}
      {!mobileMode && (
        <div
          ref={drawerRef}
          className={cn(
            "absolute inset-y-0 left-0 flex flex-col border-r border-border/40 bg-background transition-all duration-300 z-20 shadow-lg",
            isCollapsed ? "w-14" : "w-52",
          )}
        >
          {/* Collapse Toggle Header */}
          <div className="flex items-center justify-between p-2.5 border-b border-border/40 h-11">
            {!isCollapsed && (
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Table Ops
              </span>
            )}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className={cn(
                      "h-7 w-7 text-muted-foreground hover:text-foreground",
                      isCollapsed && "mx-auto",
                    )}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {isCollapsed ? "Expand panel" : "Collapse panel"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Panel Tabs */}
          <Tabs
            value={activePanel}
            onValueChange={(value) => setActivePanel(value as PanelType)}
            orientation="vertical"
            className="flex-1"
          >
            <TooltipProvider delayDuration={0} skipDelayDuration={0}>
              <TabsList className="flex flex-col h-auto w-full bg-transparent p-2 space-y-1">
                {panels.map((panel) => {
                  const Icon = panel.icon;
                  const isActive = activePanel === panel.id;

                  const trigger = (
                    <TabsTrigger
                      key={panel.id}
                      value={panel.id}
                      className={cn(
                        "w-full justify-start gap-3 px-3 py-2.5 rounded-lg",
                        "transition-all duration-200",
                        "data-[state=active]:bg-accent/10",
                        "data-[state=active]:text-accent",
                        "data-[state=active]:border-accent/30",
                        "data-[state=active]:shadow-sm",
                        "hover:bg-muted/50",
                        isCollapsed && "justify-center px-2",
                      )}
                    >
                      <div className="relative">
                        <Icon
                          className={cn(
                            "h-5 w-5",
                            isActive ? "text-accent" : "text-muted-foreground",
                          )}
                        />
                        {panel.notifications > 0 && (
                          <Badge
                            className={cn(
                              "absolute -top-2 -right-2 h-4 w-4 p-0 text-[10px]",
                              "bg-accent text-accent-foreground border-0",
                              "flex items-center justify-center",
                            )}
                          >
                            {panel.notifications}
                          </Badge>
                        )}
                      </div>
                      {!isCollapsed && (
                        <div className="flex flex-1 items-center justify-between">
                          <span className="text-sm font-medium">
                            {panel.label}
                          </span>
                          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-mono text-muted-foreground">
                            {panel.shortcut}
                          </kbd>
                        </div>
                      )}
                    </TabsTrigger>
                  );

                  // Only show tooltip when collapsed
                  if (isCollapsed) {
                    return (
                      <Tooltip key={panel.id}>
                        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                        <TooltipContent side="right" sideOffset={12}>
                          {panel.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return trigger;
                })}
              </TabsList>
            </TooltipProvider>
          </Tabs>

          {/* Bottom info - collapsed shows only status indicator */}
          <div
            className={cn(
              "border-t border-border/40",
              isCollapsed ? "p-2 flex justify-center" : "p-3 space-y-2",
            )}
          >
            {isCollapsed ? (
              <RealtimeStatusIndicator
                isConnected={realtimeConnected}
                error={realtimeError}
              />
            ) : (
              <>
                {/* Realtime status */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground/60 font-mono">
                    Realtime:
                  </span>
                  <RealtimeStatusIndicator
                    isConnected={realtimeConnected}
                    error={realtimeError}
                  />
                </div>
                {/* Gaming day */}
                {gamingDay && (
                  <div className="text-xs text-muted-foreground/60 font-mono">
                    Day: {gamingDay.date}
                  </div>
                )}
                {/* Active tables */}
                {stats && (
                  <div className="text-xs text-muted-foreground/60 font-mono">
                    Tables: {stats.activeTablesCount}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
