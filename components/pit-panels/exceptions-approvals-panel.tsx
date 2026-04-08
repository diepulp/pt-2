'use client';

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
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useExceptionsData,
  type AlertItem,
  type ApprovalItem,
  type FlagItem,
} from '@/hooks/dashboard/use-exceptions-data';
import { cn } from '@/lib/utils';

// === Formatters ===

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDollars(cents: number): string {
  const dollars = Math.abs(cents / 100);
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// === Component ===

interface ExceptionsApprovalsPanelProps {
  casinoId: string;
}

/**
 * Exceptions & Approvals Panel
 *
 * Tabbed interface for monitoring casino pit alerts, pending approvals,
 * and flagged items. Wired to live data via useExceptionsData.
 *
 * - Alerts: cash obs spike alerts + missing snapshot flags
 * - Approvals: pending fills/credits awaiting cashier confirmation
 * - Flags: tables with no telemetry coverage
 */
export function ExceptionsApprovalsPanel({
  casinoId,
}: ExceptionsApprovalsPanelProps) {
  const [activeTab, setActiveTab] = React.useState('alerts');
  const { alerts, approvals, flags, isLoading } = useExceptionsData(casinoId);

  const tabs = [
    {
      id: 'alerts',
      label: 'Alerts',
      icon: Bell,
      count: alerts.length,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
    },
    {
      id: 'approvals',
      label: 'Approvals',
      icon: CheckCircle2,
      count: approvals.length,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      borderColor: 'border-accent/30',
    },
    {
      id: 'flags',
      label: 'Flags',
      icon: Flag,
      count: flags.length,
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/30',
    },
  ];

  const totalCount = alerts.length + approvals.length + flags.length;

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
            {isLoading ? 'Loading...' : `${totalCount} items pending`}
          </p>
        </div>
        {alerts.length > 0 && <StatusPulse />}
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
                  'flex-1 gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all duration-150',
                  'data-[state=active]:shadow-sm',
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
                      'ml-1 h-4 min-w-4 px-1 text-[9px] font-bold',
                      isActive
                        ? cn(tab.bgColor, tab.color, tab.borderColor, 'border')
                        : 'bg-muted-foreground/20 text-muted-foreground',
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
            <AlertsTab alerts={alerts} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="approvals" className="mt-0 h-full">
            <ApprovalsTab approvals={approvals} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="flags" className="mt-0 h-full">
            <FlagsTab flags={flags} isLoading={isLoading} />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

// === Shared Sub-Components ===

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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border/40 bg-muted/20 p-4 text-center">
      <AlertTriangle className="mx-auto h-5 w-5 text-muted-foreground/40" />
      <p className="mt-2 text-[11px] text-muted-foreground/60">{message}</p>
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-2 px-3 pt-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

// === Alerts Tab ===

function AlertsTab({
  alerts,
  isLoading,
}: {
  alerts: AlertItem[];
  isLoading: boolean;
}) {
  if (isLoading) return <TabSkeleton />;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 px-3 pb-3">
        <SectionLabel>
          {alerts.length > 0 ? 'Pending Alerts' : 'Alerts'}
        </SectionLabel>
        {alerts.length === 0 ? (
          <EmptyState message="No active alerts this shift." />
        ) : (
          alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
        )}
      </div>
    </ScrollArea>
  );
}

function AlertCard({ alert }: { alert: AlertItem }) {
  const icons = {
    spike: DollarSign,
    snapshot: Clock,
  };

  const severityStyles = {
    high: {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/30',
      text: 'text-rose-400',
      indicator: 'bg-rose-500',
    },
    medium: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-400',
      indicator: 'bg-amber-500',
    },
    low: {
      bg: 'bg-muted',
      border: 'border-border',
      text: 'text-muted-foreground',
      indicator: 'bg-muted-foreground',
    },
  };

  const Icon = icons[alert.type];
  const styles = severityStyles[alert.severity];

  return (
    <button
      className={cn(
        'group relative flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all duration-150',
        styles.border,
        styles.bg,
        'hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
      )}
    >
      {/* Severity indicator */}
      <div
        className={cn(
          'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
          styles.indicator,
        )}
      />

      {/* Icon */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
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
          <span className={cn('text-xs font-medium', styles.text)}>
            {alert.title}
          </span>
          {alert.time && (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
              {formatTime(alert.time)}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {alert.description}
        </p>
      </div>

      {/* Hover accent */}
      <div
        className={cn(
          'absolute bottom-0 left-0 top-0 w-0.5 rounded-full opacity-0 transition-opacity group-hover:opacity-100',
          styles.indicator,
        )}
      />
    </button>
  );
}

// === Approvals Tab ===

function ApprovalsTab({
  approvals,
  isLoading,
}: {
  approvals: ApprovalItem[];
  isLoading: boolean;
}) {
  if (isLoading) return <TabSkeleton />;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 px-3 pb-3">
        <SectionLabel>
          {approvals.length > 0 ? 'Awaiting Confirmation' : 'Approvals'}
        </SectionLabel>
        {approvals.length === 0 ? (
          <EmptyState message="No pending fills or credits." />
        ) : (
          approvals.map((item) => (
            <ApprovalCard key={item.id} approval={item} />
          ))
        )}
      </div>
    </ScrollArea>
  );
}

function ApprovalCard({ approval }: { approval: ApprovalItem }) {
  const icons = {
    fill: TableProperties,
    credit: DollarSign,
  };

  const Icon = icons[approval.type];
  const label = approval.type === 'fill' ? 'Chip Fill' : 'Chip Credit';

  return (
    <button
      className={cn(
        'group relative flex w-full items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3 text-left transition-all duration-150',
        'hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
      )}
    >
      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">{label}</span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {formatTime(approval.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {approval.tableName} &bull; {formatDollars(approval.amountCents)}{' '}
          {approval.type === 'fill' ? 'fill' : 'credit'} requested
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Users className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/70">
            Pending cashier confirmation
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

// === Flags Tab ===

function FlagsTab({
  flags,
  isLoading,
}: {
  flags: FlagItem[];
  isLoading: boolean;
}) {
  if (isLoading) return <TabSkeleton />;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 px-3 pb-3">
        <SectionLabel>
          {flags.length > 0 ? 'Flagged Items' : 'Flags'}
        </SectionLabel>
        {flags.length === 0 ? (
          <EmptyState message="No flagged tables this shift." />
        ) : (
          flags.map((flag) => <FlagCard key={flag.id} flag={flag} />)
        )}

        {flags.length > 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-border/40 bg-muted/20 p-4 text-center">
            <ShieldAlert className="mx-auto h-5 w-5 text-muted-foreground/40" />
            <p className="mt-2 text-[11px] text-muted-foreground/60">
              Flags are auto-generated from shift metrics and telemetry
              coverage.
            </p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function FlagCard({ flag }: { flag: FlagItem }) {
  return (
    <button
      className={cn(
        'group relative flex w-full items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-left transition-all duration-150',
        'hover:bg-rose-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50',
      )}
    >
      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-400">
        <Flag className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-rose-400">
            {flag.title}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {flag.description}
        </p>
      </div>

      {/* Hover accent */}
      <div className="absolute bottom-0 left-0 top-0 w-0.5 rounded-full bg-rose-500 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
