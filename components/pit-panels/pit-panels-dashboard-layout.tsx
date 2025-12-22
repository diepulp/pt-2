"use client";

import { Badge } from "@/components/ui/badge";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { PitPanelsClient } from "./pit-panels-client";

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
          <PendingSection
            title="Exceptions & Approvals"
            description="Under construction. Alerts, approvals, and compliance flags."
            items={[
              "Overdue drop pulls",
              "Fill slip approvals pending",
              "Closed tables with open slips",
            ]}
          />
          <PendingSection
            title="Shift Ops"
            description="Under construction. Dealer coverage, handoffs, and shift notes."
            items={[
              "Dealer assignments",
              "Break/relief schedule",
              "Shift handoff checklist",
            ]}
          />
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
            <PendingSection
              title="Exceptions & Approvals"
              description="Under construction. Alerts, approvals, and compliance flags."
              items={[
                "Overdue drop pulls",
                "Fill slip approvals pending",
                "Closed tables with open slips",
              ]}
              className="border-b border-border/40"
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={25}>
            <PendingSection
              title="Shift Ops"
              description="Under construction. Dealer coverage, handoffs, and shift notes."
              items={[
                "Dealer assignments",
                "Break/relief schedule",
                "Shift handoff checklist",
              ]}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function PendingSection({
  title,
  description,
  items,
  className,
}: {
  title: string;
  description: string;
  items?: string[];
  className?: string;
}) {
  return (
    <section className={cn("h-full bg-card/30 px-6 py-5 text-left", className)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono text-muted-foreground">{title}</p>
          <h3 className="text-sm font-semibold text-foreground">
            Under Construction
          </h3>
        </div>
        <Badge variant="outline" className="text-xs">
          Pending
        </Badge>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{description}</p>
      {items && items.length > 0 && (
        <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent/50" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
