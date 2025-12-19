"use client";

import { Table2, Users, Gift, Shield, Settings } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { NavMain } from "@/components/layout/nav-main";
import { NavUser } from "@/components/layout/nav-user";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

const navItems = [
  {
    title: "Pit",
    url: "/pit",
    icon: Table2,
  },
  {
    title: "Players",
    url: "/players",
    icon: Users,
  },
  {
    title: "Loyalty",
    url: "/loyalty",
    icon: Gift,
  },
  {
    title: "Compliance",
    url: "/compliance",
    icon: Shield,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

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
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary/10 text-sidebar-primary border border-sidebar-primary/20">
              <span className="font-mono text-sm font-bold">PT</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center py-2 gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.title}
                  href={item.url}
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-sidebar-primary hover:bg-sidebar-accent/50 transition-colors duration-75"
                  title={item.title}
                >
                  <Icon className="w-4 h-4" />
                </Link>
              );
            })}
          </div>

          <div className="p-2">
            <div className="w-8 h-8 rounded-lg bg-sidebar-accent border border-sidebar-border flex items-center justify-center">
              <span className="text-[10px] font-mono text-muted-foreground">
                PB
              </span>
            </div>
          </div>
        </div>
      </div>

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

        {/* Main Navigation */}
        <div className="flex-1 overflow-auto px-2">
          <NavMain items={navItems} />
        </div>

        {/* Footer */}
        <div className="p-2">
          <NavUser />
        </div>
      </div>
    </>
  );
}
