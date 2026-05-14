'use client';

import { Activity, CalendarClock, ClipboardList, Users } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOpenSlip } from '@/hooks/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

import { ActivityPanel } from './activity-panel';
import { ExceptionsApprovalsPanel } from './exceptions-approvals-panel';
import { PitPanelsClient } from './pit-panels-client';

interface PitPanelsDashboardLayoutProps {
  casinoId: string;
}

export function PitPanelsDashboardLayout({
  casinoId,
}: PitPanelsDashboardLayoutProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="grid min-h-full grid-rows-[minmax(0,1fr)_auto_auto] gap-4">
          <div className="min-h-[420px]">
            <PitPanelsClient casinoId={casinoId} />
          </div>
          <div className="min-h-[280px] rounded-lg border border-border/40 overflow-hidden">
            <ExceptionsApprovalsPanel casinoId={casinoId} />
          </div>
          <div className="min-h-[400px] rounded-lg border border-border/40 overflow-hidden">
            <ShiftOpsPanel />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={64} minSize={45}>
        <PitPanelsClient casinoId={casinoId} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={36} minSize={24}>
        <ResizablePanelGroup direction="vertical" className="h-full">
          <ResizablePanel defaultSize={50} minSize={25}>
            <div className="h-full border-b border-border/40">
              <ExceptionsApprovalsPanel casinoId={casinoId} />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={25}>
            <ShiftOpsPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

// === Shift Ops Panel ===

type ShiftOpsTab = 'activity' | 'assignments' | 'handoff';

function ShiftOpsPanel() {
  const [activeTab, setActiveTab] = React.useState<ShiftOpsTab>('activity');
  const openSlip = useOpenSlip();

  const tabs: {
    id: ShiftOpsTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    borderColor: string;
    pending?: boolean;
  }[] = [
    {
      id: 'activity',
      label: 'Activity',
      icon: Activity,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      borderColor: 'border-accent/30',
    },
    {
      id: 'assignments',
      label: 'Assignments',
      icon: Users,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/20',
      borderColor: 'border-border/30',
      pending: true,
    },
    {
      id: 'handoff',
      label: 'Handoff',
      icon: ClipboardList,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/20',
      borderColor: 'border-border/30',
      pending: true,
    },
  ];

  return (
    <section className="flex h-full flex-col bg-card/30">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
        <div className="h-5 w-1 rounded-full bg-accent" />
        <div className="flex-1">
          <h3
            className="text-sm font-bold uppercase tracking-widest text-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Shift Ops
          </h3>
        </div>
        <CalendarClock className="h-4 w-4 text-muted-foreground/50" />
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ShiftOpsTab)}
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
                {tab.pending && !isActive && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4 px-1 text-[9px] font-medium bg-muted-foreground/10 text-muted-foreground/50"
                  >
                    soon
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Content */}
        <div className="min-h-0 flex-1">
          <TabsContent value="activity" className="mt-0 h-full">
            <ActivityPanel onSlipClick={openSlip} />
          </TabsContent>

          <TabsContent value="assignments" className="mt-0 h-full">
            <PendingTabContent
              icon={Users}
              title="Dealer Assignments"
              items={['Dealer assignments', 'Break / relief schedule']}
            />
          </TabsContent>

          <TabsContent value="handoff" className="mt-0 h-full">
            <PendingTabContent
              icon={ClipboardList}
              title="Shift Handoff"
              items={['Handoff checklist', 'Shift notes']}
            />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

function PendingTabContent({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: string[];
}) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
        <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 border border-border/50 mb-4">
          <Icon className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <p
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          {title}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground/60">
          Under construction
        </p>
        <ul className="mt-5 space-y-2 text-left w-full max-w-[200px]">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 text-xs text-muted-foreground/50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent/40 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </ScrollArea>
  );
}
