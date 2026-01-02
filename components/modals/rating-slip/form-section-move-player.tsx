"use client";

import { AlertCircle } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMovePlayerFields } from "@/hooks/ui";

// Placeholder types - will be replaced with actual service types
interface RatingSlipTableDto {
  gaming_table_id: string;
  name: string;
  seats_available: number;
}

interface FormSectionMovePlayerProps {
  tables: RatingSlipTableDto[];
  selectedTable: RatingSlipTableDto | null;
  seatError: string;
  onMovePlayer: () => void;
  isUpdating: boolean;
  disabled: boolean;
}

/**
 * Move Player form section for Rating Slip Modal.
 * Uses Zustand store via useMovePlayerFields hook for optimized re-renders.
 *
 * React 19 Performance: Wrapped in React.memo to prevent parent re-renders
 * from triggering unnecessary reconciliation.
 *
 * @returns Form section with table selector, seat input, and move button
 */
export const FormSectionMovePlayer = React.memo(function FormSectionMovePlayer({
  tables,
  selectedTable,
  seatError,
  onMovePlayer,
  isUpdating,
  disabled,
}: FormSectionMovePlayerProps) {
  const { tableId, seatNumber, updateField } = useMovePlayerFields();

  // Find current table (simple computation, no need for useMemo)
  const currentTable =
    tables.find((t) => t.gaming_table_id === tableId) || null;
  const currentTableName = currentTable?.name || "Unknown Table";

  // Simple string computation, no need for useMemo
  const seatPlaceholder = selectedTable
    ? `1-${selectedTable.seats_available ?? "N/A"}`
    : "Seat number";

  // Event handlers - wrapped in useCallback for stable references
  const handleTableChange = React.useCallback(
    (value: string) => {
      updateField("newTableId", value);
    },
    [updateField],
  );

  const handleSeatChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField("newSeatNumber", e.target.value);
    },
    [updateField],
  );

  return (
    <div>
      <div className="flex justify-between items-center">
        <label htmlFor="movePlayerTable" className="text-sm font-medium">
          Move Player
        </label>
        {tableId && currentTable && (
          <span className="text-xs text-muted-foreground">
            Currently at: {currentTableName}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-1">
        <Select value={tableId || ""} onValueChange={handleTableChange}>
          <SelectTrigger id="movePlayerTable">
            <SelectValue placeholder="Select table">
              {currentTable
                ? `${currentTable.name || "Unnamed Table"} (${currentTable.seats_available} seats)`
                : tableId
                  ? `Table ID: ${tableId} (Not Found)`
                  : "Select table"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {tables.map((table) => (
              <SelectItem
                key={table.gaming_table_id}
                value={table.gaming_table_id}
              >
                {table.name || "Unnamed Table"} ({table.seats_available} seats)
                {table.gaming_table_id === tableId && " ✓"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="space-y-1">
          <Input
            type="number"
            placeholder={seatPlaceholder}
            value={seatNumber}
            onChange={handleSeatChange}
            className={seatError ? "border-red-500" : ""}
          />
          {seatError && (
            <div className="flex items-center gap-1 text-red-500 text-xs">
              <AlertCircle className="h-3 w-3" />
              {seatError}
            </div>
          )}
        </div>
      </div>
      <Button
        type="button"
        className="w-full mt-2"
        onClick={onMovePlayer}
        disabled={disabled}
      >
        {isUpdating ? "Moving..." : "Move Player"}
      </Button>
    </div>
  );
});
