"use client";

import { Activity, LayoutGrid, Menu, Package, TrendingUp } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RealtimeStatusIndicator } from "@/hooks/dashboard";
import type {
  DashboardTableDTO,
  DashboardStats,
} from "@/hooks/dashboard/types";
import { useSwipe } from "@/hooks/utilities";
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

interface MobileTableOpsDrawerProps {
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
}

const panels = [
  { id: "tables", label: "Tables", icon: LayoutGrid },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "analytics", label: "Analytics", icon: TrendingUp },
] as const;

type PanelId = (typeof panels)[number]["id"];

/**
 * Mobile Table Ops Drawer - Bottom sheet drawer for mobile devices
 * Uses vaul for native-feeling swipe gestures
 * Visible only on mobile (< 768px / md breakpoint)
 */
export function MobileTableOpsDrawer({
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
}: MobileTableOpsDrawerProps) {
  const [activePanel, setActivePanel] = React.useState<PanelId>("tables");
  const [isOpen, setIsOpen] = React.useState(false);

  // Panel IDs for swipe navigation
  const panelIds: PanelId[] = panels.map((p) => p.id);

  // Swipe handlers for horizontal panel navigation
  const { handlers: swipeHandlers } = useSwipe({
    threshold: 60,
    onSwipeLeft: () => {
      const currentIndex = panelIds.indexOf(activePanel);
      if (currentIndex < panelIds.length - 1) {
        setActivePanel(panelIds[currentIndex + 1]);
      }
    },
    onSwipeRight: () => {
      const currentIndex = panelIds.indexOf(activePanel);
      if (currentIndex > 0) {
        setActivePanel(panelIds[currentIndex - 1]);
      }
    },
  });

  // Notification counts
  const notifications = React.useMemo(
    () => ({
      tables: activeSlips.length,
      activity: activeSlips.length,
      inventory: 0,
      analytics: 0,
    }),
    [activeSlips.length],
  );

  const totalNotifications = React.useMemo(
    () => Object.values(notifications).reduce((a, b) => a + b, 0),
    [notifications],
  );

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
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      {/* Floating Action Button - Fixed at bottom right on mobile */}
      <DrawerTrigger asChild>
        <Button
          size="lg"
          className={cn(
            "fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg",
            "bg-accent text-accent-foreground hover:bg-accent/90",
            "md:hidden", // Only visible on mobile
            className,
          )}
        >
          <div className="relative">
            <Menu className="h-6 w-6" />
            {totalNotifications > 0 && (
              <Badge
                className={cn(
                  "absolute -top-2 -right-2 h-5 w-5 p-0",
                  "bg-destructive text-destructive-foreground border-2 border-background",
                  "flex items-center justify-center text-[10px] font-bold",
                )}
              >
                {totalNotifications > 9 ? "9+" : totalNotifications}
              </Badge>
            )}
          </div>
        </Button>
      </DrawerTrigger>

      <DrawerContent className="max-h-[85vh] min-h-[60vh]">
        {/* Drawer Header with Panel Tabs */}
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-base font-semibold">
              Table Ops
            </DrawerTitle>
            <div className="flex items-center gap-2">
              <RealtimeStatusIndicator
                isConnected={realtimeConnected}
                error={realtimeError}
              />
              {gamingDay && (
                <span className="text-xs text-muted-foreground font-mono">
                  {gamingDay.date}
                </span>
              )}
            </div>
          </div>

          {/* Horizontal Panel Tabs for Mobile */}
          <Tabs
            value={activePanel}
            onValueChange={(value) => setActivePanel(value as PanelId)}
            className="mt-3"
          >
            <TabsList className="grid w-full grid-cols-4 h-12">
              {panels.map((panel) => {
                const Icon = panel.icon;
                const isActive = activePanel === panel.id;
                const notificationCount =
                  notifications[panel.id as keyof typeof notifications];

                return (
                  <TabsTrigger
                    key={panel.id}
                    value={panel.id}
                    className={cn(
                      "flex flex-col items-center gap-0.5 py-1.5 h-full",
                      "data-[state=active]:bg-accent/10 data-[state=active]:text-accent",
                    )}
                  >
                    <div className="relative">
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          isActive ? "text-accent" : "text-muted-foreground",
                        )}
                      />
                      {notificationCount > 0 && (
                        <div
                          className={cn(
                            "absolute -top-1 -right-1.5 h-3 w-3 rounded-full",
                            "bg-accent text-[8px] text-accent-foreground",
                            "flex items-center justify-center font-bold",
                          )}
                        >
                          {notificationCount > 9 ? "+" : notificationCount}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-medium">
                      {panel.label}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </DrawerHeader>

        {/* Panel Content with touch-friendly scrolling and swipe navigation */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
          {...swipeHandlers}
        >
          {/* Swipe indicator */}
          <div className="flex justify-center gap-1.5 py-2 mb-2">
            {panelIds.map((id) => (
              <div
                key={id}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-200",
                  activePanel === id
                    ? "w-4 bg-accent"
                    : "bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
          {renderActivePanel()}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
