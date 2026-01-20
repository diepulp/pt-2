'use client';

import { ChevronDown, Check, Star, Layers } from 'lucide-react';
import { useState, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { getPitStats } from '../mock-data';
import type { PitData } from '../types';

interface MobilePitSelectorProps {
  pits: PitData[];
  selectedPitId: string | null;
  onSelectPit: (pitId: string) => void;
  pinnedPitIds: string[];
  className?: string;
}

export function MobilePitSelector({
  pits,
  selectedPitId,
  onSelectPit,
  pinnedPitIds,
  className,
}: MobilePitSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedPit = useMemo(
    () => pits.find((p) => p.id === selectedPitId),
    [pits, selectedPitId],
  );

  const { pinnedPits, otherPits } = useMemo(() => {
    const pinned = pits.filter((p) => pinnedPitIds.includes(p.id));
    const others = pits.filter((p) => !pinnedPitIds.includes(p.id));
    return { pinnedPits: pinned, otherPits: others };
  }, [pits, pinnedPitIds]);

  const handleSelect = (pitId: string) => {
    onSelectPit(pitId);
    setOpen(false);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-between gap-2 h-11 px-4 w-full',
            'bg-card/60 border-border/50 hover:bg-card/80',
            className,
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium truncate">
              {selectedPit?.label ?? 'Select a pit'}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </Button>
      </DrawerTrigger>

      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="border-b border-border/50 pb-4">
          <DrawerTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-muted-foreground" />
            Select Pit
          </DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="p-4 space-y-4">
            {/* Pinned Section */}
            {pinnedPits.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Pinned
                  </span>
                </div>
                <div className="space-y-1">
                  {pinnedPits.map((pit) => (
                    <PitOption
                      key={pit.id}
                      pit={pit}
                      isSelected={selectedPitId === pit.id}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All Pits Section */}
            {otherPits.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    All Pits
                  </span>
                </div>
                <div className="space-y-1">
                  {otherPits.map((pit) => (
                    <PitOption
                      key={pit.id}
                      pit={pit}
                      isSelected={selectedPitId === pit.id}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

// Pit option component
function PitOption({
  pit,
  isSelected,
  onSelect,
}: {
  pit: PitData;
  isSelected: boolean;
  onSelect: (pitId: string) => void;
}) {
  const stats = getPitStats(pit);

  return (
    <button
      onClick={() => onSelect(pit.id)}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all',
        'hover:bg-muted/50 active:scale-[0.98]',
        isSelected && 'bg-muted border border-border/50',
      )}
    >
      {/* Status indicator */}
      <div
        className={cn(
          'w-2 h-10 rounded-full flex-shrink-0',
          stats.active > 0
            ? 'bg-emerald-500'
            : stats.inactive > 0
              ? 'bg-amber-500'
              : 'bg-zinc-600',
        )}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground truncate">
            {pit.label}
          </span>
          {pit.isPinned && (
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-sm">
          <span className="text-emerald-400 font-mono">
            {stats.active} open
          </span>
          {stats.inactive > 0 && (
            <span className="text-amber-400 font-mono">
              {stats.inactive} paused
            </span>
          )}
          {stats.closed > 0 && (
            <span className="text-zinc-500 font-mono">
              {stats.closed} closed
            </span>
          )}
        </div>
      </div>

      {/* Check mark */}
      {isSelected && (
        <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
      )}
    </button>
  );
}
