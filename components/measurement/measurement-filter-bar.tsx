/**
 * Measurement Filter Bar
 *
 * Filter controls for measurement dashboard — pit and table dropdowns.
 * Uses useTransition for non-blocking filter changes.
 *
 * @see EXEC-046 WS5 — Widget Components
 */

'use client';

import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface MeasurementFilterBarProps {
  pitId?: string;
  tableId?: string;
  onPitChange: (pitId: string | undefined) => void;
  onTableChange: (tableId: string | undefined) => void;
  /** Available pits for dropdown — passed from parent or fetched separately */
  pits?: Array<{ id: string; label: string }>;
  /** Available tables for dropdown — filtered by selected pit */
  tables?: Array<{ id: string; label: string }>;
}

export function MeasurementFilterBar({
  pitId,
  tableId,
  onPitChange,
  onTableChange,
  pits,
  tables,
}: MeasurementFilterBarProps) {
  const [isPending, startTransition] = useTransition();

  const handlePitChange = (value: string) => {
    startTransition(() => {
      if (value === '__all__') {
        onPitChange(undefined);
        onTableChange(undefined);
      } else {
        onPitChange(value);
        onTableChange(undefined);
      }
    });
  };

  const handleTableChange = (value: string) => {
    startTransition(() => {
      onTableChange(value === '__all__' ? undefined : value);
    });
  };

  const handleClear = () => {
    startTransition(() => {
      onPitChange(undefined);
      onTableChange(undefined);
    });
  };

  const hasFilters = pitId || tableId;

  return (
    <div className="flex items-center gap-3">
      {/* Pit filter */}
      <Select
        value={pitId ?? '__all__'}
        onValueChange={handlePitChange}
        disabled={isPending || !pits || pits.length === 0}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="All Pits" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Pits</SelectItem>
          {pits?.map((pit) => (
            <SelectItem key={pit.id} value={pit.id}>
              {pit.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Table filter */}
      <Select
        value={tableId ?? '__all__'}
        onValueChange={handleTableChange}
        disabled={isPending || !tables || tables.length === 0}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="All Tables" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Tables</SelectItem>
          {tables?.map((table) => (
            <SelectItem key={table.id} value={table.id}>
              {table.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear filters */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={handleClear}
          disabled={isPending}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
