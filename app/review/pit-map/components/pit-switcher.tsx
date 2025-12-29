"use client";

import { Search, Star, Clock, ChevronRight, Layers } from "lucide-react";
import { useState, useMemo, useRef, useCallback, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import type { PitData } from "../types";
import { getPitStats } from "../mock-data";

interface PitSwitcherProps {
  pits: PitData[];
  selectedPitId: string | null;
  onSelectPit: (pitId: string) => void;
  pinnedPitIds: string[];
  recentPitIds: string[];
  className?: string;
}

export function PitSwitcher({
  pits,
  selectedPitId,
  onSelectPit,
  pinnedPitIds,
  recentPitIds,
  className,
}: PitSwitcherProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSelectPit = useCallback(
    (pitId: string) => {
      startTransition(() => {
        onSelectPit(pitId);
      });
    },
    [onSelectPit]
  );

  // Filter and organize pits
  const { pinnedPits, recentPits, otherPits } = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = pits.filter(
      (pit) =>
        pit.label.toLowerCase().includes(query) ||
        pit.tables.some((t) => t.label.toLowerCase().includes(query))
    );

    const pinned = filtered.filter((p) => pinnedPitIds.includes(p.id));
    const recent = filtered.filter(
      (p) => recentPitIds.includes(p.id) && !pinnedPitIds.includes(p.id)
    );
    const others = filtered.filter(
      (p) => !pinnedPitIds.includes(p.id) && !recentPitIds.includes(p.id)
    );

    return {
      pinnedPits: pinned,
      recentPits: recent,
      otherPits: others,
    };
  }, [pits, searchQuery, pinnedPitIds, recentPitIds]);

  const allFilteredPits = [...pinnedPits, ...recentPits, ...otherPits];

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-sidebar-background border-r border-sidebar-border",
        className
      )}
    >
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-sidebar-border/50">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-md bg-sidebar-accent">
            <Layers className="w-4 h-4 text-sidebar-primary" />
          </div>
          <h2 className="text-sm font-semibold text-sidebar-foreground tracking-tight">
            Pit Selection
          </h2>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search pits or tables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm bg-sidebar-accent/50 border-sidebar-border placeholder:text-muted-foreground/60"
          />
          {/* Keyboard hint */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar-accent px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              /
            </kbd>
          </div>
        </div>
      </div>

      {/* Pit List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {/* Pinned Section */}
          {pinnedPits.length > 0 && (
            <PitSection icon={Star} label="Pinned" iconClassName="text-amber-500">
              {pinnedPits.map((pit) => (
                <PitRow
                  key={pit.id}
                  pit={pit}
                  isSelected={selectedPitId === pit.id}
                  isPending={isPending}
                  onSelect={handleSelectPit}
                />
              ))}
            </PitSection>
          )}

          {/* Recent Section */}
          {recentPits.length > 0 && (
            <PitSection icon={Clock} label="Recent" iconClassName="text-blue-400">
              {recentPits.map((pit) => (
                <PitRow
                  key={pit.id}
                  pit={pit}
                  isSelected={selectedPitId === pit.id}
                  isPending={isPending}
                  onSelect={handleSelectPit}
                />
              ))}
            </PitSection>
          )}

          {/* All Pits Section */}
          {otherPits.length > 0 && (
            <PitSection icon={Layers} label="All Pits" iconClassName="text-muted-foreground">
              {otherPits.map((pit) => (
                <PitRow
                  key={pit.id}
                  pit={pit}
                  isSelected={selectedPitId === pit.id}
                  isPending={isPending}
                  onSelect={handleSelectPit}
                />
              ))}
            </PitSection>
          )}

          {/* Empty State */}
          {allFilteredPits.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No pits found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Try a different search term
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer Stats */}
      <div className="flex-shrink-0 p-3 border-t border-sidebar-border/50 bg-sidebar-accent/30">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {allFilteredPits.length} of {pits.length} pits
          </span>
          <span className="font-mono text-muted-foreground/60">
            {pits.reduce((acc, p) => acc + p.tables.length, 0)} tables
          </span>
        </div>
      </div>
    </div>
  );
}

// Section component
interface PitSectionProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconClassName?: string;
  children: React.ReactNode;
}

function PitSection({ icon: Icon, label, iconClassName, children }: PitSectionProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-2 py-1">
        <Icon className={cn("w-3.5 h-3.5", iconClassName)} />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// Pit Row component
interface PitRowProps {
  pit: PitData;
  isSelected: boolean;
  isPending: boolean;
  onSelect: (pitId: string) => void;
}

function PitRow({ pit, isSelected, isPending, onSelect }: PitRowProps) {
  const stats = getPitStats(pit);

  return (
    <button
      onClick={() => onSelect(pit.id)}
      disabled={isPending}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150",
        "hover:bg-sidebar-accent/80 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1",
        isSelected && [
          "bg-sidebar-accent",
          "border border-sidebar-primary/20",
          "shadow-sm shadow-sidebar-primary/10",
        ],
        isPending && "opacity-70 cursor-wait"
      )}
    >
      {/* Pit indicator */}
      <div
        className={cn(
          "w-2 h-8 rounded-full flex-shrink-0 transition-colors",
          stats.active > 0 ? "bg-emerald-500" : stats.inactive > 0 ? "bg-amber-500" : "bg-zinc-600"
        )}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium truncate",
              isSelected ? "text-sidebar-foreground" : "text-sidebar-foreground/80"
            )}
          >
            {pit.label}
          </span>
          {pit.isPinned && (
            <Star className="w-3 h-3 text-amber-500 fill-amber-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <StatusBadge count={stats.active} status="active" />
          {stats.inactive > 0 && <StatusBadge count={stats.inactive} status="inactive" />}
          {stats.closed > 0 && <StatusBadge count={stats.closed} status="closed" />}
        </div>
      </div>

      {/* Chevron */}
      <ChevronRight
        className={cn(
          "w-4 h-4 flex-shrink-0 transition-transform",
          isSelected ? "text-sidebar-primary" : "text-muted-foreground/40",
          isSelected && "translate-x-0.5"
        )}
      />
    </button>
  );
}

// Status badge component
function StatusBadge({
  count,
  status,
}: {
  count: number;
  status: "active" | "inactive" | "closed";
}) {
  const colors = {
    active: "text-emerald-400",
    inactive: "text-amber-400",
    closed: "text-zinc-500",
  };

  const labels = {
    active: "open",
    inactive: "idle",
    closed: "closed",
  };

  return (
    <span className={cn("text-xs font-mono", colors[status])}>
      {count} {labels[status]}
    </span>
  );
}
