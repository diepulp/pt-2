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
            title="Review Section A"
            description="Under construction. Reserved for pit workflow review."
          />
          <PendingSection
            title="Review Section B"
            description="Under construction. Placeholder for compliance or alerts."
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
              title="Review Section A"
              description="Under construction. Reserved for pit workflow review."
              className="border-b border-border/40"
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={25}>
            <PendingSection
              title="Review Section B"
              description="Under construction. Placeholder for compliance or alerts."
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
  className,
}: {
  title: string;
  description: string;
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
    </section>
  );
}
