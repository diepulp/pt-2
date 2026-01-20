'use client';

import {
  Search,
  Layers,
  Table2,
  ArrowRight,
  Command,
  Circle,
  Pause,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import type { PitData, TableData, TableStatus } from '../types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pits: PitData[];
  onSelectPit: (pitId: string) => void;
  onSelectTable: (tableId: string, pitId: string) => void;
}

interface SearchResult {
  type: 'pit' | 'table';
  id: string;
  label: string;
  sublabel?: string;
  pitId?: string;
  status?: TableStatus;
}

const statusIcons = {
  active: Circle,
  inactive: Pause,
  closed: XCircle,
};

const statusColors = {
  active: 'text-emerald-400',
  inactive: 'text-amber-400',
  closed: 'text-zinc-500',
};

export function CommandPalette({
  open,
  onOpenChange,
  pits,
  onSelectPit,
  onSelectTable,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Generate search results
  const results = useMemo((): SearchResult[] => {
    const q = query.toLowerCase().trim();
    const items: SearchResult[] = [];

    // Add pits
    pits.forEach((pit) => {
      if (!q || pit.label.toLowerCase().includes(q)) {
        items.push({
          type: 'pit',
          id: pit.id,
          label: pit.label,
          sublabel: `${pit.tables.length} tables`,
        });
      }

      // Add tables
      pit.tables.forEach((table) => {
        if (
          !q ||
          table.label.toLowerCase().includes(q) ||
          table.dealerName?.toLowerCase().includes(q)
        ) {
          items.push({
            type: 'table',
            id: table.id,
            label: table.label,
            sublabel: `${pit.label}`,
            pitId: pit.id,
            status: table.status,
          });
        }
      });
    });

    // Sort: pits first (if query is empty), then by relevance
    if (!q) {
      return items.sort((a, b) => {
        if (a.type === 'pit' && b.type !== 'pit') return -1;
        if (a.type !== 'pit' && b.type === 'pit') return 1;
        return a.label.localeCompare(b.label);
      });
    }

    // When searching, prioritize exact label matches
    return items.sort((a, b) => {
      const aExact = a.label.toLowerCase().startsWith(q);
      const bExact = b.label.toLowerCase().startsWith(q);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [pits, query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          const selected = results[selectedIndex];
          if (selected) {
            if (selected.type === 'pit') {
              onSelectPit(selected.id);
            } else {
              onSelectTable(selected.id, selected.pitId!);
            }
            onOpenChange(false);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [results, selectedIndex, onSelectPit, onSelectTable, onOpenChange],
  );

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      // Focus input after render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keep selected item in view
  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector(`[data-index="${selectedIndex}"]`);
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Global keyboard shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="rounded-xl border border-border bg-popover shadow-2xl shadow-black/40 overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search pits and tables..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="border-0 shadow-none focus-visible:ring-0 h-14 text-base placeholder:text-muted-foreground/60"
            />
            <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 rounded border border-border bg-muted/50 text-xs text-muted-foreground font-mono">
              <Command className="w-3 h-3" />K
            </kbd>
          </div>

          {/* Results */}
          <ScrollArea className="max-h-[360px]">
            <div ref={listRef} className="p-2">
              {results.length > 0 ? (
                results.slice(0, 20).map((result, index) => {
                  const StatusIcon =
                    result.status && statusIcons[result.status];

                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      data-index={index}
                      onClick={() => {
                        if (result.type === 'pit') {
                          onSelectPit(result.id);
                        } else {
                          onSelectTable(result.id, result.pitId!);
                        }
                        onOpenChange(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                        'hover:bg-accent/50',
                        index === selectedIndex && 'bg-accent',
                      )}
                    >
                      {/* Icon */}
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                          result.type === 'pit'
                            ? 'bg-violet-500/10 text-violet-400'
                            : 'bg-blue-500/10 text-blue-400',
                        )}
                      >
                        {result.type === 'pit' ? (
                          <Layers className="w-4 h-4" />
                        ) : (
                          <Table2 className="w-4 h-4" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground truncate">
                            {result.label}
                          </span>
                          {result.status && StatusIcon && (
                            <StatusIcon
                              className={cn(
                                'w-3.5 h-3.5 flex-shrink-0',
                                statusColors[result.status],
                                result.status === 'active' &&
                                  'fill-emerald-400',
                              )}
                            />
                          )}
                        </div>
                        {result.sublabel && (
                          <span className="text-xs text-muted-foreground">
                            {result.sublabel}
                          </span>
                        )}
                      </div>

                      {/* Arrow */}
                      <ArrowRight
                        className={cn(
                          'w-4 h-4 text-muted-foreground/40 flex-shrink-0 transition-transform',
                          index === selectedIndex && 'translate-x-0.5',
                        )}
                      />
                    </button>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="w-8 h-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No results found
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Try searching for a pit name or table ID
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/50 font-mono">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/50 font-mono">
                  ↵
                </kbd>
                select
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/50 font-mono">
                  esc
                </kbd>
                close
              </span>
            </div>
            <span>{results.length} results</span>
          </div>
        </div>
      </div>
    </>
  );
}
