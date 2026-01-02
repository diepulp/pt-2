"use client";

import { Check, ChevronDown, Layers, LayoutGrid, MapPin } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database.types";

type TableStatus = Database["public"]["Enums"]["table_status"];
type GameType = Database["public"]["Enums"]["game_type"];

export interface PitMapTable {
  id: string;
  label: string;
  status: TableStatus;
  gameType: GameType;
}

export interface PitMapPit {
  id: string;
  label: string;
  tables: PitMapTable[];
}

interface PitMapSelectorProps {
  pits: PitMapPit[];
  selectedPitId: string | null;
  selectedTableId: string | null;
  onSelectTable: (tableId: string, pitId: string) => void;
  onSelectPit: (pitId: string) => void;
  className?: string;
  compact?: boolean;
}

const STATUS_CONFIG: Record<
  TableStatus,
  { color: string; bg: string; ring: string; label: string }
> = {
  active: {
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/15 dark:bg-emerald-500/20",
    ring: "ring-emerald-500/50 dark:ring-emerald-500/40",
    label: "Open",
  },
  inactive: {
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/15 dark:bg-amber-500/20",
    ring: "ring-amber-500/50 dark:ring-amber-500/40",
    label: "Idle",
  },
  closed: {
    color: "text-zinc-500 dark:text-zinc-500",
    bg: "bg-zinc-500/15 dark:bg-zinc-500/20",
    ring: "ring-zinc-500/50 dark:ring-zinc-500/40",
    label: "Closed",
  },
};

const GAME_TYPE_LABELS: Record<GameType, string> = {
  blackjack: "BJ",
  poker: "PK",
  roulette: "RL",
  baccarat: "BA",
};

/**
 * Pit Map Selector - Hierarchical pit/table navigation for the toolbar
 *
 * Features:
 * - Searchable dropdown with pits as groups
 * - Status indicators for each table
 * - Compact trigger showing current selection
 * - Keyboard navigation support
 */
export function PitMapSelector({
  pits,
  selectedPitId,
  selectedTableId,
  onSelectTable,
  onSelectPit,
  className,
  compact = false,
}: PitMapSelectorProps) {
  const [open, setOpen] = React.useState(false);

  // Find current selection labels
  const currentPit = React.useMemo(
    () => pits.find((p) => p.id === selectedPitId),
    [pits, selectedPitId],
  );

  const currentTable = React.useMemo(() => {
    if (!selectedTableId) return null;
    for (const pit of pits) {
      const table = pit.tables.find((t) => t.id === selectedTableId);
      if (table) return { ...table, pitLabel: pit.label };
    }
    return null;
  }, [pits, selectedTableId]);

  // Handle table selection
  const handleTableSelect = React.useCallback(
    (tableId: string, pitId: string) => {
      onSelectTable(tableId, pitId);
      setOpen(false);
    },
    [onSelectTable],
  );

  // Handle pit selection (selects first table)
  const handlePitSelect = React.useCallback(
    (pitId: string) => {
      const pit = pits.find((p) => p.id === pitId);
      if (pit && pit.tables.length > 0) {
        onSelectTable(pit.tables[0].id, pitId);
      } else {
        onSelectPit(pitId);
      }
      setOpen(false);
    },
    [pits, onSelectTable, onSelectPit],
  );

  // Get pit stats
  const getPitStats = React.useCallback((pit: PitMapPit) => {
    const stats = { active: 0, inactive: 0, closed: 0 };
    for (const table of pit.tables) {
      stats[table.status]++;
    }
    return stats;
  }, []);

  // Total stats
  const totalStats = React.useMemo(() => {
    const stats = { tables: 0, active: 0 };
    for (const pit of pits) {
      stats.tables += pit.tables.length;
      stats.active += pit.tables.filter((t) => t.status === "active").length;
    }
    return stats;
  }, [pits]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label="Select pit and table"
          className={cn(
            "justify-between gap-2 px-2.5",
            "h-9 min-w-[140px] max-w-[200px]",
            "border border-border/50 bg-card/50",
            "hover:bg-accent/10 hover:border-accent/30",
            "transition-all duration-150",
            compact && "h-8 min-w-[120px] text-xs",
            className,
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <MapPin
              className={cn(
                "shrink-0",
                compact ? "size-3.5" : "size-4",
                currentTable
                  ? STATUS_CONFIG[currentTable.status].color
                  : currentPit
                    ? "text-accent"
                    : "text-muted-foreground",
              )}
            />
            <span className="truncate font-medium">
              {currentTable
                ? `${currentTable.pitLabel} / ${currentTable.label}`
                : currentPit
                  ? currentPit.label
                  : "Select location"}
            </span>
          </div>
          <ChevronDown
            className={cn(
              "shrink-0 opacity-50 transition-transform",
              compact ? "size-3" : "size-4",
              open && "rotate-180",
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className={cn(
          "w-[280px] p-0",
          "border-border/60 bg-popover/95 backdrop-blur-md",
          "shadow-xl shadow-black/20",
        )}
        align="start"
        sideOffset={8}
      >
        <Command className="bg-transparent">
          {/* Search Input */}
          <div className="relative border-b border-border/40">
            <CommandInput
              placeholder="Search pits or tables..."
              className="h-10 border-0"
            />
          </div>

          <CommandList className="max-h-[320px]">
            <CommandEmpty className="py-8 text-center">
              <Layers className="mx-auto mb-2 size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No results found</p>
            </CommandEmpty>

            {/* Pits with nested tables */}
            {pits.map((pit, index) => {
              const stats = getPitStats(pit);
              const isSelectedPit = pit.id === selectedPitId;

              return (
                <React.Fragment key={pit.id}>
                  {index > 0 && <CommandSeparator className="my-1" />}

                  <CommandGroup
                    heading={
                      <button
                        type="button"
                        onClick={() => handlePitSelect(pit.id)}
                        className={cn(
                          "flex w-full items-center justify-between",
                          "rounded px-1 py-0.5 -mx-1",
                          "hover:bg-accent/10 transition-colors",
                          "cursor-pointer",
                        )}
                      >
                        <span
                          className={cn(
                            "flex items-center gap-2 font-semibold tracking-wide",
                            isSelectedPit
                              ? "text-accent"
                              : "text-muted-foreground",
                          )}
                        >
                          <Layers className="size-3.5" />
                          {pit.label}
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] font-mono">
                          {stats.active > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {stats.active}
                            </span>
                          )}
                          {stats.inactive > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              {stats.inactive}
                            </span>
                          )}
                          {stats.closed > 0 && (
                            <span className="text-zinc-600 dark:text-zinc-500">
                              {stats.closed}
                            </span>
                          )}
                        </span>
                      </button>
                    }
                  >
                    {pit.tables.map((table) => {
                      const isSelected = table.id === selectedTableId;
                      const statusConfig = STATUS_CONFIG[table.status];

                      return (
                        <CommandItem
                          key={table.id}
                          value={`${pit.label} ${table.label}`}
                          onSelect={() => handleTableSelect(table.id, pit.id)}
                          className={cn(
                            "flex items-center gap-2 py-2 pl-6",
                            "cursor-pointer",
                            isSelected && "bg-accent/15",
                          )}
                        >
                          {/* Status indicator */}
                          <div
                            className={cn(
                              "size-2 rounded-full shrink-0",
                              statusConfig.bg,
                              "ring-1 ring-inset",
                              statusConfig.ring,
                            )}
                          />

                          {/* Table info */}
                          <div className="flex flex-1 items-center gap-2 min-w-0">
                            <LayoutGrid className="size-3.5 shrink-0 text-muted-foreground/60" />
                            <span
                              className={cn(
                                "font-medium truncate",
                                isSelected && "text-accent",
                              )}
                            >
                              {table.label}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
                              {GAME_TYPE_LABELS[table.gameType]}
                            </span>
                          </div>

                          {/* Status badge */}
                          <span
                            className={cn(
                              "text-[10px] font-medium shrink-0",
                              statusConfig.color,
                            )}
                          >
                            {statusConfig.label}
                          </span>

                          {/* Check mark for selected */}
                          {isSelected && (
                            <Check className="size-4 shrink-0 text-accent" />
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </React.Fragment>
              );
            })}
          </CommandList>

          {/* Footer stats */}
          <div className="flex items-center justify-between border-t border-border/40 px-3 py-2 bg-muted/30">
            <span className="text-[10px] text-muted-foreground">
              {pits.length} pits
            </span>
            <span className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-muted-foreground">
                {totalStats.tables} tables
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {totalStats.active} open
              </span>
            </span>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Compact variant for mobile/small viewports
 */
export function PitMapSelectorCompact(
  props: Omit<PitMapSelectorProps, "compact">,
) {
  return <PitMapSelector {...props} compact />;
}
