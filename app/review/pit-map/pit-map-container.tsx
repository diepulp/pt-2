"use client";

import {
  Command,
  Layers,
  LayoutGrid,
  List,
  Search,
  Settings2,
} from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  PitSwitcher,
  TableGrid,
  CommandPalette,
  MobilePitSelector,
} from "./components";
import { mockPits } from "./mock-data";
import type { ViewMode, PitData } from "./types";

export function PitMapContainer() {
  // State
  const [selectedPitId, setSelectedPitId] = useState<string | null>(
    mockPits[0]?.id ?? null
  );
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Derived state
  const pinnedPitIds = useMemo(
    () => mockPits.filter((p) => p.isPinned).map((p) => p.id),
    []
  );

  const recentPitIds = useMemo(
    () => mockPits.filter((p) => p.isRecent).map((p) => p.id),
    []
  );

  const selectedPit = useMemo(
    () => mockPits.find((p) => p.id === selectedPitId) ?? null,
    [selectedPitId]
  );

  // Handlers
  const handleSelectPit = useCallback((pitId: string) => {
    startTransition(() => {
      setSelectedPitId(pitId);
    });
  }, []);

  const handleSelectTable = useCallback(
    (tableId: string, pitId?: string) => {
      if (pitId) {
        setSelectedPitId(pitId);
      }
      // In a real app, this would navigate to the table detail view
      console.log("Selected table:", tableId);
    },
    []
  );

  const handleTableFromPalette = useCallback(
    (tableId: string, pitId: string) => {
      setSelectedPitId(pitId);
      // Navigate to table
      console.log("Jump to table:", tableId);
    },
    []
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Bar - Desktop */}
      <header className="flex-shrink-0 border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center justify-between h-14 px-4 lg:px-6">
          {/* Left: Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20">
              <Layers className="w-5 h-5 text-accent" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-semibold tracking-tight">
                Pit Operations
              </h1>
              <p className="text-xs text-muted-foreground">
                Floor Navigation
              </p>
            </div>
          </div>

          {/* Center: Global Search (Desktop) */}
          <div className="hidden md:flex items-center gap-2 flex-1 max-w-md mx-8">
            <Button
              variant="outline"
              onClick={() => setCommandPaletteOpen(true)}
              className="w-full justify-start gap-2 h-9 px-3 text-muted-foreground bg-muted/30 hover:bg-muted/50"
            >
              <Search className="w-4 h-4" />
              <span className="flex-1 text-left text-sm">
                Jump to pit or table...
              </span>
              <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
                <Command className="w-3 h-3" />K
              </kbd>
            </Button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Mobile Search Button */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setCommandPaletteOpen(true)}
            >
              <Search className="w-4 h-4" />
            </Button>

            {/* View Mode Toggle (Mobile) */}
            <div className="flex items-center border border-border rounded-lg p-0.5 bg-muted/30 lg:hidden">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "rounded-md h-7 w-7",
                  viewMode === "grid" && "bg-background shadow-sm"
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setViewMode("list")}
                className={cn(
                  "rounded-md h-7 w-7",
                  viewMode === "list" && "bg-background shadow-sm"
                )}
              >
                <List className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Settings */}
            <Button variant="ghost" size="icon-sm">
              <Settings2 className="w-4 h-4" />
            </Button>

            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-border/50">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          </div>
        </div>

        {/* Mobile Pit Selector */}
        <div className="lg:hidden px-4 pb-3">
          <MobilePitSelector
            pits={mockPits}
            selectedPitId={selectedPitId}
            onSelectPit={handleSelectPit}
            pinnedPitIds={pinnedPitIds}
          />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left Rail - Desktop */}
        <aside className="hidden lg:flex w-72 xl:w-80 flex-shrink-0">
          <PitSwitcher
            pits={mockPits}
            selectedPitId={selectedPitId}
            onSelectPit={handleSelectPit}
            pinnedPitIds={pinnedPitIds}
            recentPitIds={recentPitIds}
            className="w-full"
          />
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0">
          <TableGrid
            pit={selectedPit}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onSelectTable={handleSelectTable}
          />
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        pits={mockPits}
        onSelectPit={(pitId) => {
          handleSelectPit(pitId);
          setCommandPaletteOpen(false);
        }}
        onSelectTable={handleTableFromPalette}
      />

      {/* Footer - Review Mode Badge */}
      <footer className="flex-shrink-0 border-t border-border/40 bg-card/30 py-2 px-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">UI Review Mode</span>
          <div className="flex items-center gap-4">
            <span>
              {mockPits.length} pits •{" "}
              {mockPits.reduce((acc, p) => acc + p.tables.length, 0)} tables
            </span>
            <span className="font-mono">
              Theme: {typeof window !== "undefined" && document.documentElement.classList.contains("dark") ? "Dark" : "Light"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
