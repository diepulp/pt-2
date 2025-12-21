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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RealtimeStatusIndicator } from "@/hooks/dashboard";
import type {
  DashboardTableDTO,
  DashboardStats,
} from "@/hooks/dashboard/types";
import { cn } from "@/lib/utils";
import type { RatingSlipDTO } from "@/services/rating-slip/dtos";

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
  selectedTableId: string | null;
  selectedTable: DashboardTableDTO | null;
  seats: (SeatOccupant | null)[];
  activeSlips: RatingSlipDTO[];
  stats: DashboardStats | null;
  isLoading: boolean;
  gamingDay: { date: string } | null;
  realtimeConnected: boolean;
  realtimeError: Error | null;

  // Callbacks
  onTableSelect: (tableId: string) => void;
  onSeatClick: (index: number, occupant: SeatOccupant | null) => void;
  onNewSlip: () => void;
  onSlipClick: (slipId: string) => void;

  /**
   * Mobile mode: Hides the vertical tab navigation sidebar.
   * Content fills the full width. Navigation handled by MobileTableOpsDrawer.
   */
  mobileMode?: boolean;
}

/**
 * Panel Container - Main container with vertical tab navigation
 * Tabbed interface for Tables, Inventory, and Analytics panels
 */
export function PanelContainer({
  casinoId,
  tableName,
  className,
  tables,
  selectedTableId,
  selectedTable,
  seats,
  activeSlips,
  stats,
  isLoading,
  gamingDay,
  realtimeConnected,
  realtimeError,
  onTableSelect,
  onSeatClick,
  onNewSlip,
  onSlipClick,
  mobileMode = false,
}: PanelContainerProps) {
  const [activePanel, setActivePanel] = React.useState("tables");
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const drawerRef = React.useRef<HTMLDivElement>(null);

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

  const panels = [
    {
      id: "tables",
      label: "Tables",
      icon: LayoutGrid,
      shortcut: "⌘1",
      notifications: notifications.tables,
    },
    {
      id: "activity",
      label: "Activity",
      icon: Activity,
      shortcut: "⌘2",
      notifications: notifications.activity,
    },
    {
      id: "inventory",
      label: "Inventory",
      icon: Package,
      shortcut: "⌘3",
      notifications: notifications.inventory,
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: TrendingUp,
      shortcut: "⌘4",
      notifications: notifications.analytics,
    },
  ];

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

  return (
    <div
      className={cn("relative h-full bg-background overflow-hidden", className)}
    >
      {/* Panel Content - Full width, with left padding for collapsed drawer on desktop */}
      <div
        className={cn(
          "h-full flex flex-col",
          !mobileMode && "pl-14", // Only add padding for sidebar on desktop
        )}
      >
        {renderActivePanel()}
      </div>

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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={cn(
                "h-7 w-7 text-muted-foreground hover:text-foreground",
                isCollapsed && "mx-auto",
              )}
              title={isCollapsed ? "Expand panel" : "Collapse panel"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Panel Tabs */}
          <Tabs
            value={activePanel}
            onValueChange={setActivePanel}
            orientation="vertical"
            className="flex-1"
          >
            <TabsList className="flex flex-col h-auto w-full bg-transparent p-2 space-y-1">
              {panels.map((panel) => {
                const Icon = panel.icon;
                const isActive = activePanel === panel.id;

                return (
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
                    title={
                      isCollapsed
                        ? `${panel.label} (${panel.shortcut})`
                        : undefined
                    }
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
                        <span className="text-xs text-muted-foreground font-mono">
                          {panel.shortcut}
                        </span>
                      </div>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
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
