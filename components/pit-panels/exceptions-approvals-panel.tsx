"use client";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  DollarSign,
  Flag,
  ShieldAlert,
  TableProperties,
  Users,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Exceptions & Approvals Panel
 *
 * Tabbed interface for monitoring casino pit alerts, pending approvals,
 * and flagged items requiring attention. Command-center aesthetic with
 * urgent visual cues and data-dense information display.
 */
export function ExceptionsApprovalsPanel() {
  const [activeTab, setActiveTab] = React.useState("alerts");

  // Mock notification counts - will be wired to real data
  const notifications = {
    alerts: 3,
    approvals: 2,
    flags: 1,
  };

  const tabs = [
    {
      id: "alerts",
      label: "Alerts",
      icon: Bell,
      count: notifications.alerts,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/30",
    },
    {
      id: "approvals",
      label: "Approvals",
      icon: CheckCircle2,
      count: notifications.approvals,
      color: "text-accent",
      bgColor: "bg-accent/10",
      borderColor: "border-accent/30",
    },
    {
      id: "flags",
      label: "Flags",
      icon: Flag,
      count: notifications.flags,
      color: "text-rose-400",
      bgColor: "bg-rose-500/10",
      borderColor: "border-rose-500/30",
    },
  ];

  return (
    <section className="flex h-full flex-col bg-card/30">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
        <div className="h-5 w-1 rounded-full bg-accent" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Exceptions & Approvals
          </h3>
          <p className="text-[10px] font-mono text-muted-foreground/70">
            {notifications.alerts +
              notifications.approvals +
              notifications.flags}{" "}
            items pending
          </p>
        </div>
        <StatusPulse />
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-3 mt-3 mb-2 h-auto shrink-0 justify-start gap-1 rounded-lg border border-border/40 bg-muted/30 p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  "flex-1 gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all duration-150",
                  "data-[state=active]:shadow-sm",
                  isActive && tab.bgColor,
                  isActive && tab.color,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      "ml-1 h-4 min-w-4 px-1 text-[9px] font-bold",
                      isActive
                        ? cn(tab.bgColor, tab.color, tab.borderColor, "border")
                        : "bg-muted-foreground/20 text-muted-foreground",
                    )}
                  >
                    {tab.count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Content */}
        <div className="min-h-0 flex-1">
          <TabsContent value="alerts" className="mt-0 h-full">
            <AlertsTab />
          </TabsContent>

          <TabsContent value="approvals" className="mt-0 h-full">
            <ApprovalsTab />
          </TabsContent>

          <TabsContent value="flags" className="mt-0 h-full">
            <FlagsTab />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

function StatusPulse() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      <span className="text-[10px] font-medium text-amber-400">Active</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-2 pb-1">
      <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60">
        {children}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS TAB
// ─────────────────────────────────────────────────────────────────────────────

function AlertsTab() {
  const mockAlerts = [
    {
      id: "1",
      type: "drop" as const,
      title: "Overdue Drop Pull",
      description: "BJ-03 drop scheduled 2 hours ago",
      time: "14:30",
      severity: "high" as const,
    },
    {
      id: "2",
      type: "transaction" as const,
      title: "High-Value Transaction",
      description: "BJ-01 • $5,000 buy-in flagged",
      time: "15:45",
      severity: "medium" as const,
    },
    {
      id: "3",
      type: "compliance" as const,
      title: "Compliance Warning",
      description: "CTR threshold approaching on Table 7",
      time: "16:02",
      severity: "low" as const,
    },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 px-3 pb-3">
        <SectionLabel>Pending Alerts</SectionLabel>
        {mockAlerts.map((alert) => (
          <AlertCard key={alert.id} {...alert} />
        ))}
      </div>
    </ScrollArea>
  );
}

function AlertCard({
  type,
  title,
  description,
  time,
  severity,
}: {
  type: "drop" | "transaction" | "compliance";
  title: string;
  description: string;
  time: string;
  severity: "high" | "medium" | "low";
}) {
  const icons = {
    drop: Clock,
    transaction: DollarSign,
    compliance: ShieldAlert,
  };

  const severityStyles = {
    high: {
      bg: "bg-rose-500/10",
      border: "border-rose-500/30",
      text: "text-rose-400",
      indicator: "bg-rose-500",
    },
    medium: {
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-400",
      indicator: "bg-amber-500",
    },
    low: {
      bg: "bg-muted",
      border: "border-border",
      text: "text-muted-foreground",
      indicator: "bg-muted-foreground",
    },
  };

  const Icon = icons[type];
  const styles = severityStyles[severity];

  return (
    <button
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all duration-150",
        styles.border,
        styles.bg,
        "hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
      )}
    >
      {/* Severity indicator */}
      <div
        className={cn(
          "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
          styles.indicator,
        )}
      />

      {/* Icon */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
          styles.border,
          styles.bg,
          styles.text,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-xs font-medium", styles.text)}>
            {title}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {time}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {description}
        </p>
      </div>

      {/* Hover accent */}
      <div
        className={cn(
          "absolute bottom-0 left-0 top-0 w-0.5 rounded-full opacity-0 transition-opacity group-hover:opacity-100",
          styles.indicator,
        )}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVALS TAB
// ─────────────────────────────────────────────────────────────────────────────

function ApprovalsTab() {
  const mockApprovals = [
    {
      id: "1",
      type: "fill" as const,
      title: "Fill Slip Approval",
      description: "BJ-05 • $2,500 chip fill requested",
      requester: "J. Martinez",
      time: "15:22",
    },
    {
      id: "2",
      type: "buyin" as const,
      title: "High-Value Buy-In",
      description: "Roulette 2 • $10,000 cash transaction",
      requester: "S. Chen",
      time: "16:08",
    },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 px-3 pb-3">
        <SectionLabel>Awaiting Approval</SectionLabel>
        {mockApprovals.map((approval) => (
          <ApprovalCard key={approval.id} {...approval} />
        ))}
      </div>
    </ScrollArea>
  );
}

function ApprovalCard({
  type,
  title,
  description,
  requester,
  time,
}: {
  type: "fill" | "buyin";
  title: string;
  description: string;
  requester: string;
  time: string;
}) {
  const icons = {
    fill: TableProperties,
    buyin: DollarSign,
  };

  const Icon = icons[type];

  return (
    <button
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3 text-left transition-all duration-150",
        "hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
      )}
    >
      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">{title}</span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {time}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {description}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Users className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/70">
            {requester}
          </span>
        </div>
      </div>

      {/* Action hint */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge
          variant="outline"
          className="border-accent/40 bg-accent/10 px-1.5 py-0 text-[9px] font-medium text-accent"
        >
          Review
        </Badge>
      </div>

      {/* Hover accent */}
      <div className="absolute bottom-0 left-0 top-0 w-0.5 rounded-full bg-accent opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLAGS TAB
// ─────────────────────────────────────────────────────────────────────────────

function FlagsTab() {
  const mockFlags = [
    {
      id: "1",
      type: "open_slips" as const,
      title: "Open Slips on Closed Table",
      description: "BJ-02 has 2 unresolved rating slips",
      count: 2,
      time: "14:00",
    },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 px-3 pb-3">
        <SectionLabel>Flagged Items</SectionLabel>
        {mockFlags.map((flag) => (
          <FlagCard key={flag.id} {...flag} />
        ))}

        {/* Empty state hint */}
        {mockFlags.length === 1 && (
          <div className="mt-4 rounded-lg border border-dashed border-border/40 bg-muted/20 p-4 text-center">
            <AlertTriangle className="mx-auto h-5 w-5 text-muted-foreground/40" />
            <p className="mt-2 text-[11px] text-muted-foreground/60">
              Flags are auto-generated when tables have unresolved issues.
            </p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function FlagCard({
  title,
  description,
  count,
  time,
}: {
  type: "open_slips" | "attention";
  title: string;
  description: string;
  count: number;
  time: string;
}) {
  return (
    <button
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-left transition-all duration-150",
        "hover:bg-rose-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50",
      )}
    >
      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-400">
        <Flag className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-rose-400">{title}</span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {time}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {description}
        </p>
      </div>

      {/* Count badge */}
      <Badge
        variant="secondary"
        className="border border-rose-500/30 bg-rose-500/20 px-1.5 py-0 text-[10px] font-bold text-rose-400"
      >
        {count}
      </Badge>

      {/* Hover accent */}
      <div className="absolute bottom-0 left-0 top-0 w-0.5 rounded-full bg-rose-500 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
