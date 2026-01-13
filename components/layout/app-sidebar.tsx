"use client";

import {
  Bell,
  FileText,
  Gift,
  LayoutDashboard,
  Settings,
  Shield,
  Table2,
  Users,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { NavMain, type NavGroup } from "@/components/layout/nav-main";
import { NavUser } from "@/components/layout/nav-user";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Navigation structure organized by semantic groups:
 * - OPERATIONAL: Day-to-day pit operations (Pit, Players, Loyalty, Compliance)
 * - ADMINISTRATIVE: Management dashboards and reports (Shift Dashboard, Alerts, Reports)
 * - OTHER: Configuration and settings
 */
const navGroups: NavGroup[] = [
  {
    label: "Operational",
    items: [
      {
        title: "Pit",
        url: "/pit",
        icon: Table2,
        children: [
          { title: "Floor View", url: "/pit" },
          { title: "Table Status", url: "/pit/tables" },
          { title: "Active Sessions", url: "/pit/sessions" },
        ],
      },
      {
        title: "Players",
        url: "/players",
        icon: Users,
        children: [
          { title: "Player Lookup", url: "/players" },
          { title: "Session History", url: "/players/history" },
        ],
      },
      {
        title: "Loyalty",
        url: "/loyalty",
        icon: Gift,
        children: [
          { title: "Promo Programs", url: "/loyalty/promo" },
          { title: "Rewards Catalog", url: "/loyalty/rewards" },
          { title: "Player Tiers", url: "/loyalty/tiers" },
        ],
      },
      {
        title: "Compliance",
        url: "/compliance",
        icon: Shield,
        children: [
          { title: "MTL Tracking", url: "/compliance" },
          { title: "Reports", url: "/compliance/reports" },
        ],
      },
    ],
  },
  {
    label: "Administrative",
    items: [
      {
        title: "Shift Dashboard",
        url: "/admin/shift",
        icon: LayoutDashboard,
        children: [
          { title: "Overview", url: "/admin/shift" },
          { title: "Cash Observations", url: "/admin/shift?view=cash" },
          { title: "Staff Performance", url: "/admin/shift?view=staff" },
        ],
      },
      {
        title: "Alerts",
        url: "/admin/alerts",
        icon: Bell,
        badge: 0, // TODO: Connect to real alert count
      },
      {
        title: "Reports",
        url: "/admin/reports",
        icon: FileText,
      },
    ],
  },
  {
    label: "Other",
    items: [
      {
        title: "Settings",
        url: "/settings",
        icon: Settings,
        children: [
          { title: "General", url: "/settings" },
          { title: "Casino", url: "/settings/casino" },
          { title: "Staff", url: "/settings/staff" },
          { title: "Thresholds", url: "/admin/settings/thresholds" },
          { title: "Shifts", url: "/admin/settings/shifts" },
        ],
      },
    ],
  },
];

// Flatten nav items for collapsed icon view
const flatNavItems = navGroups.flatMap((group) => group.items);

const SIDEBAR_WIDTH_EXPANDED = "16rem"; // 256px
const SIDEBAR_WIDTH_COLLAPSED = "3.5rem"; // 56px (w-14)
const NAVBAR_HEIGHT = "4rem"; // 64px (h-16)

/**
 * AppSidebar using Option C: Sheet-based Hover Drawer pattern
 *
 * Key features:
 * - Pure CSS translate-x transitions (no width animations)
 * - Hover-triggered expansion with snappy 150ms close delay
 * - Positioned under navbar (top-16)
 * - Theme-aware using sidebar CSS variables
 * - Grouped navigation with collapsible tree structure
 */
export function AppSidebar() {
  const [isOpen, setIsOpen] = React.useState(false);
  const closeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = React.useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const handleMouseLeave = React.useCallback(() => {
    // Reduced from 300ms to 150ms for snappier feel
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      {/* Hover Trigger Zone - invisible strip on left edge, under navbar */}
      <div
        className="fixed left-0 bottom-0 w-4 z-40 pointer-events-auto"
        style={{ top: NAVBAR_HEIGHT }}
        onMouseEnter={handleMouseEnter}
        aria-hidden="true"
      />

      {/* Collapsed Icon Strip - visible when closed, under navbar */}
      <TooltipProvider delayDuration={0}>
        <div
          className={cn(
            "fixed left-0 bottom-0 bg-background border-r border-sidebar-border",
            "flex flex-col z-30",
            "transition-opacity duration-200",
            isOpen ? "opacity-0 pointer-events-none" : "opacity-100",
          )}
          style={{
            width: SIDEBAR_WIDTH_COLLAPSED,
            top: NAVBAR_HEIGHT,
          }}
          onMouseEnter={handleMouseEnter}
        >
          {/* Collapsed content - icon-only view */}
          <div className="flex flex-col h-full">
            <div className="p-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary/10 text-sidebar-primary border border-sidebar-primary/20 cursor-default">
                    <span className="font-mono text-sm font-bold">PT</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  PT-2 Pit Station
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex-1 flex flex-col items-center py-2 gap-1">
              {flatNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Tooltip key={item.title}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.url}
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-sidebar-primary hover:bg-sidebar-accent/50 transition-colors duration-75 relative"
                      >
                        <Icon className="w-4 h-4" />
                        {/* Badge indicator for collapsed view */}
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sidebar-primary px-1 text-[9px] font-medium text-sidebar-primary-foreground">
                            {item.badge > 9 ? "9+" : item.badge}
                          </span>
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.title}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            <div className="p-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-8 h-8 rounded-lg bg-sidebar-accent border border-sidebar-border flex items-center justify-center cursor-default">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      PB
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  Pit Boss
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </TooltipProvider>

      {/* Expanded Panel - slides in from left, under navbar */}
      <div
        className={cn(
          "fixed left-0 bottom-0 bg-background border-r border-sidebar-border",
          "flex flex-col z-50 shadow-2xl shadow-black/50",
          "transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{
          width: SIDEBAR_WIDTH_EXPANDED,
          top: NAVBAR_HEIGHT,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header */}
        <div className="p-2">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary/10 text-sidebar-primary border border-sidebar-primary/20">
              <span className="font-mono text-sm font-bold">PT</span>
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold text-sidebar-foreground">
                PT-2
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Pit Station
              </span>
            </div>
          </div>
        </div>

        {/* Main Navigation - Grouped with collapsible trees */}
        <div className="flex-1 overflow-auto py-2">
          <NavMain groups={navGroups} />
        </div>

        {/* Footer */}
        <div className="p-2">
          <NavUser />
        </div>
      </div>
    </>
  );
}
