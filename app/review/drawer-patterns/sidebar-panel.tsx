"use client";

import {
  Activity,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Package,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Option A: Sidebar-based Right Panel
 *
 * Uses the shadcn Sidebar component with side="right" and collapsible="icon"
 * Integrates with the existing Sidebar system for consistent behavior
 */
export function SidebarPanelDemo() {
  return (
    <SidebarProvider
      defaultOpen={false}
      style={
        {
          "--sidebar-width": "280px",
          "--sidebar-width-icon": "56px",
        } as React.CSSProperties
      }
    >
      <div className="flex h-full w-full">
        {/* Left Sidebar Panel */}
        <LeftSidebarPanel />

        {/* Main Content Area */}
        <SidebarInset className="flex-1 bg-zinc-950">
          <MainContent />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function MainContent() {
  return (
    <div className="h-full flex flex-col">
      {/* Content Header */}
      <div className="border-b border-zinc-800/40 px-6 py-4 bg-zinc-900/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-zinc-300">Table BJ-01</h2>
            <p className="text-xs text-zinc-600 mt-0.5">
              Blackjack • 6 seats • Active
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-zinc-500">Live</span>
          </div>
        </div>
      </div>

      {/* Table Visualization Placeholder */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="relative">
          {/* Table shape */}
          <div className="w-80 h-48 rounded-[100px] bg-emerald-900/20 border-4 border-emerald-800/40 relative">
            {/* Dealer position */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center">
                <span className="text-xs font-mono text-zinc-400">D</span>
              </div>
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
                Dealer
              </span>
            </div>

            {/* Player positions */}
            {[...Array(6)].map((_, i) => {
              const angle = (180 / 5) * i - 90;
              const x = Math.cos((angle * Math.PI) / 180) * 160 + 160;
              const y = Math.sin((angle * Math.PI) / 180) * 100 + 170;
              const isOccupied = [1, 2, 4].includes(i);

              return (
                <div
                  key={i}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
                  style={{ left: x, top: y }}
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all",
                      isOccupied
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                        : "bg-zinc-800/50 border-zinc-700/50 text-zinc-600",
                    )}
                  >
                    {isOccupied ? (
                      <Users className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-mono">{i + 1}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Table label */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl font-light text-emerald-600/60 tracking-widest">
                BJ-01
              </div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1">
                $25 minimum
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom stats */}
      <div className="border-t border-zinc-800/40 px-6 py-3 bg-zinc-900/30">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <StatBadge icon={Users} label="Players" value="3" />
            <StatBadge icon={Zap} label="Active Slips" value="3" accent />
          </div>
          <span className="text-zinc-600 font-mono">Session: 2h 34m</span>
        </div>
      </div>
    </div>
  );
}

function StatBadge({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        className={cn(
          "w-3.5 h-3.5",
          accent ? "text-amber-500" : "text-zinc-600",
        )}
      />
      <span className="text-zinc-500">{label}:</span>
      <span
        className={cn("font-mono", accent ? "text-amber-400" : "text-zinc-300")}
      >
        {value}
      </span>
    </div>
  );
}

function LeftSidebarPanel() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [activeTab, setActiveTab] = React.useState("tables");

  const tabs = [
    { id: "tables", label: "Tables", icon: LayoutGrid, notifications: 3 },
    { id: "activity", label: "Activity", icon: Activity, notifications: 2 },
    { id: "inventory", label: "Inventory", icon: Package, notifications: 0 },
    { id: "analytics", label: "Analytics", icon: TrendingUp, notifications: 0 },
  ];

  return (
    <Sidebar
      side="left"
      variant="sidebar"
      collapsible="icon"
      hoverExpand={true}
      className="border-r border-zinc-800/60 bg-zinc-900/80 backdrop-blur-sm"
    >
      {/* Header with toggle */}
      <SidebarHeader className="border-b border-zinc-800/40">
        <div className="flex items-center justify-between px-2">
          {!isCollapsed && (
            <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">
              Table Ops
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className={cn(
              "h-7 w-7 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50",
              isCollapsed && "mx-auto",
            )}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </SidebarHeader>

      {/* Tab Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <SidebarMenuItem key={tab.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setActiveTab(tab.id)}
                      tooltip={tab.label}
                      className={cn(
                        "transition-all duration-200",
                        isActive && "bg-amber-500/10 text-amber-400",
                      )}
                    >
                      <div className="relative">
                        <Icon
                          className={cn(
                            "h-4 w-4",
                            isActive ? "text-amber-400" : "text-zinc-500",
                          )}
                        />
                        {tab.notifications > 0 && (
                          <Badge
                            className={cn(
                              "absolute -top-1.5 -right-1.5 h-3.5 w-3.5 p-0 text-[9px]",
                              "bg-amber-500 text-zinc-900 border-0",
                              "flex items-center justify-center",
                            )}
                          >
                            {tab.notifications}
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm">{tab.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Tab Content */}
        {!isCollapsed && (
          <SidebarGroup className="flex-1">
            <SidebarGroupContent className="p-2">
              <TabContent activeTab={activeTab} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t border-zinc-800/40">
        <div
          className={cn(
            "flex items-center",
            isCollapsed ? "justify-center p-2" : "gap-2 px-3 py-2",
          )}
        >
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          {!isCollapsed && (
            <span className="text-[10px] text-zinc-600 font-mono">
              Realtime: Connected
            </span>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function TabContent({ activeTab }: { activeTab: string }) {
  const content: Record<string, React.ReactNode> = {
    tables: (
      <div className="space-y-3">
        <div className="text-[10px] text-zinc-600 uppercase tracking-wider">
          Active Players
        </div>
        {["John D.", "Sarah M.", "Mike R."].map((name, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/30 border border-zinc-800/40"
          >
            <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <span className="text-xs font-mono text-amber-400">
                {name[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-zinc-300 truncate">{name}</div>
              <div className="text-[10px] text-zinc-600">Seat {i + 2}</div>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
              Active
            </Badge>
          </div>
        ))}
      </div>
    ),
    activity: (
      <div className="space-y-2">
        <div className="text-[10px] text-zinc-600 uppercase tracking-wider">
          Recent Activity
        </div>
        {[
          { action: "Slip opened", time: "2m ago", player: "John D." },
          { action: "Bet increased", time: "5m ago", player: "Sarah M." },
          { action: "Player seated", time: "12m ago", player: "Mike R." },
        ].map((item, i) => (
          <div
            key={i}
            className="p-2 rounded-lg bg-zinc-800/20 border border-zinc-800/30 space-y-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{item.action}</span>
              <span className="text-[10px] text-zinc-600 font-mono">
                {item.time}
              </span>
            </div>
            <div className="text-[10px] text-zinc-500">{item.player}</div>
          </div>
        ))}
      </div>
    ),
    inventory: (
      <div className="space-y-3">
        <div className="text-[10px] text-zinc-600 uppercase tracking-wider">
          Chip Counts
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { denom: "$5", count: 48, color: "bg-red-500" },
            { denom: "$25", count: 32, color: "bg-emerald-500" },
            { denom: "$100", count: 16, color: "bg-zinc-900" },
            { denom: "$500", count: 8, color: "bg-violet-500" },
          ].map((chip) => (
            <div
              key={chip.denom}
              className="p-2 rounded-lg bg-zinc-800/30 border border-zinc-800/40 text-center"
            >
              <div
                className={cn("w-6 h-6 rounded-full mx-auto mb-1", chip.color)}
              />
              <div className="text-xs font-mono text-zinc-300">
                {chip.denom}
              </div>
              <div className="text-[10px] text-zinc-600">×{chip.count}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    analytics: (
      <div className="space-y-3">
        <div className="text-[10px] text-zinc-600 uppercase tracking-wider">
          Performance
        </div>
        {[
          { label: "Win Rate", value: "52%", trend: "+2%" },
          { label: "Avg Bet", value: "$125", trend: "+$15" },
          { label: "Hands/Hr", value: "42", trend: "-3" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/20"
          >
            <span className="text-xs text-zinc-500">{stat.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-zinc-300">
                {stat.value}
              </span>
              <span className="text-[10px] text-emerald-400">{stat.trend}</span>
            </div>
          </div>
        ))}
      </div>
    ),
  };

  return content[activeTab] || null;
}
