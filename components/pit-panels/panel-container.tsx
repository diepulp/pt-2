"use client";

import { ChevronLeft, ChevronRight, Package, TrendingUp } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { AnalyticsPanel } from "./analytics-panel";
import { InventoryPanel } from "./inventory-panel";

interface PanelContainerProps {
  tableName?: string;
  className?: string;
}

/**
 * Panel Container - Main container with vertical tab navigation
 * Static UI for review, with collapsible sidebar navigation
 */
export function PanelContainer({
  tableName = "BJ-01",
  className,
}: PanelContainerProps) {
  const [activePanel, setActivePanel] = useState("inventory");
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Static notification counts for demo
  const notifications = {
    inventory: 2,
    analytics: 0,
  };

  const panels = [
    {
      id: "inventory",
      label: "Inventory",
      icon: Package,
      shortcut: "⌘2",
      notifications: notifications.inventory,
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: TrendingUp,
      shortcut: "⌘3",
      notifications: notifications.analytics,
    },
  ];

  const renderActivePanel = () => {
    switch (activePanel) {
      case "analytics":
        return <AnalyticsPanel tableName={tableName} />;
      default:
        return <InventoryPanel tableName={tableName} />;
    }
  };

  return (
    <div
      className={cn(
        "flex h-full bg-background border-l border-border/40",
        className,
      )}
    >
      {/* Vertical Tab Navigation */}
      <div
        className={cn(
          "flex flex-col border-r border-border/40 bg-muted/20 transition-all duration-300",
          isCollapsed ? "w-16" : "w-52",
        )}
      >
        {/* Collapse Toggle Header */}
        <div className="flex items-center justify-between p-3 border-b border-border/40">
          {!isCollapsed && (
            <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Table Ops
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
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
                      <span className="text-sm font-medium">{panel.label}</span>
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

        {/* Bottom info when expanded */}
        {!isCollapsed && (
          <div className="p-3 border-t border-border/40">
            <div className="text-xs text-muted-foreground/60 font-mono">
              Shift: Day
            </div>
            <div className="text-xs text-muted-foreground/60 font-mono">
              Pit: Main Floor
            </div>
          </div>
        )}
      </div>

      {/* Panel Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {renderActivePanel()}
      </div>
    </div>
  );
}
