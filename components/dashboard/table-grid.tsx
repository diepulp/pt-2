/**
 * Table Grid Component
 *
 * Displays a responsive grid of table thumbnails using TableLayoutTerminal
 * in compact variant. Handles table selection and status indicators.
 *
 * Design: Brutalist aesthetic with exposed structure, high contrast borders,
 * monospace labels.
 *
 * @see PRD-006 Pit Dashboard UI
 * @see EXECUTION-SPEC-PRD-006.md WS2
 */

'use client';

import * as React from 'react';

import { TableLayoutTerminal } from '@/components/table/table-layout-terminal';
import { Badge } from '@/components/ui/badge';
import type { DashboardTableDTO } from '@/hooks/dashboard/types';
import { cn } from '@/lib/utils';

interface TableGridProps {
  tables: DashboardTableDTO[];
  selectedTableId: string | null;
  onTableSelect: (tableId: string) => void;
  isLoading?: boolean;
}

export function TableGrid({
  tables,
  selectedTableId,
  onTableSelect,
  isLoading = false,
}: TableGridProps) {
  // Empty state
  if (!isLoading && tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 p-12">
        <div
          className="text-sm font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          No Tables Available
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Create tables to start tracking player sessions
        </p>
      </div>
    );
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Loading Tables...
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[80px] w-[100px] animate-pulse rounded-lg border-2 border-border bg-muted/30"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          All Tables ({tables.length})
        </div>
        {/* Optional: Filter badges for quick access */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {tables.filter((t) => t.status === 'active').length} Active
          </Badge>
          <Badge variant="outline" className="font-mono text-xs">
            {tables.filter((t) => t.status === 'inactive').length} Inactive
          </Badge>
        </div>
      </div>

      {/* Table Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
        {tables.map((table) => (
          <button
            key={table.id}
            onClick={() => onTableSelect(table.id)}
            className={cn(
              'group relative transition-transform duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              selectedTableId === table.id
                ? 'scale-105 ring-2 ring-accent ring-offset-2 ring-offset-background'
                : 'hover:scale-105',
            )}
            aria-label={`Select table ${table.label}`}
          >
            <TableLayoutTerminal
              seats={Array(7).fill(null)} // Default 7 seats for thumbnail
              variant="compact"
              tableId={table.label}
              gameType={table.type}
              tableStatus={table.status}
              activeSlipsCount={table.activeSlipsCount}
              isSelected={selectedTableId === table.id}
            />
            {/* Selection indicator overlay */}
            {selectedTableId === table.id && (
              <div className="absolute inset-0 rounded-lg border-2 border-accent pointer-events-none" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
