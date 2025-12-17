import { Metadata } from "next";

import { PitPanelsStatic } from "@/components/pit-panels";

export const metadata: Metadata = {
  title: "Pit Panels UI Review | PT-2",
  description: "Review interface for pit panel components",
};

/**
 * Pit Panels Review Page
 * Dedicated route for reviewing the pit panels UI with system dark theme
 */
export default function PitPanelsReviewPage() {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Pit Panels UI Review
              </h1>
              <p className="text-sm text-muted-foreground">
                Static UI components for casino pit operations
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-xs font-mono text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                Table: BJ-01
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">
                  Live Preview
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto p-6">
          {/* Component Preview Container */}
          <div className="rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm overflow-hidden shadow-2xl shadow-black/20">
            {/* Preview Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/20">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
              </div>
              <span className="text-xs font-mono text-muted-foreground ml-2">
                pit-panels/panel-container.tsx
              </span>
            </div>

            {/* Panel Container */}
            <div className="h-[700px]">
              <PitPanelsStatic tableName="BJ-01" />
            </div>
          </div>

          {/* Component List */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <ComponentCard
              name="PanelContainer"
              description="Main container with vertical tab navigation"
              path="components/pit-panels/panel-container.tsx"
            />
            <ComponentCard
              name="TablesPanel"
              description="Table layout with seat positions and player info"
              path="components/pit-panels/tables-panel.tsx"
            />
            <ComponentCard
              name="InventoryPanel"
              description="Chip counts, drops, and fill slips management"
              path="components/pit-panels/inventory-panel.tsx"
            />
            <ComponentCard
              name="AnalyticsPanel"
              description="Table performance metrics and insights"
              path="components/pit-panels/analytics-panel.tsx"
            />
            <ComponentCard
              name="BankSummary"
              description="Total bank value and variance display"
              path="components/pit-panels/bank-summary.tsx"
            />
            <ComponentCard
              name="ChipCountsDisplay"
              description="Chip denomination breakdown with counts"
              path="components/pit-panels/chip-counts-display.tsx"
            />
            <ComponentCard
              name="ChipDenomination"
              description="Casino chip-styled denomination badge"
              path="components/pit-panels/chip-denomination.tsx"
            />
            <ComponentCard
              name="DropEventsDisplay"
              description="Scheduled and completed drop events"
              path="components/pit-panels/drop-events-display.tsx"
            />
            <ComponentCard
              name="FillSlipsDisplay"
              description="Fill slip documents with approvals"
              path="components/pit-panels/fill-slips-display.tsx"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-card/30 mt-8">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>PT-2 Pit Station • UI Review Mode</span>
            <span className="font-mono">Theme: Dark Industrial</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ComponentCard({
  name,
  description,
  path,
}: {
  name: string;
  description: string;
  path: string;
}) {
  return (
    <div className="group p-4 rounded-lg border border-border/40 bg-card/30 hover:border-accent/30 hover:bg-card/50 transition-all">
      <h3 className="font-mono text-sm font-medium text-foreground group-hover:text-accent transition-colors">
        {name}
      </h3>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
      <p className="text-xs font-mono text-muted-foreground/60 mt-2 truncate">
        {path}
      </p>
    </div>
  );
}
