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

// Placeholder types - will be replaced with actual service types
interface RatingSlipTableDto {
  gaming_table_id: string;
  name: string;
  seats_available: number;
}

interface FormSectionMovePlayerProps {
  tables: RatingSlipTableDto[];
  value: string;
  seatValue: string;
  onTableChange: (tableId: string) => void;
  onSeatChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedTable: RatingSlipTableDto | null;
  seatError: string;
  onMovePlayer: () => void;
  isUpdating: boolean;
  disabled: boolean;
}

export function FormSectionMovePlayer({
  tables,
  value,
  seatValue,
  onTableChange,
  onSeatChange,
  selectedTable,
  seatError,
  onMovePlayer,
  isUpdating,
  disabled,
}: FormSectionMovePlayerProps) {
  // Find current table (simple computation, no need for useMemo)
  const currentTable = tables.find((t) => t.gaming_table_id === value) || null;
  const currentTableName = currentTable?.name || "Unknown Table";

  // Simple string computation, no need for useMemo
  const seatPlaceholder = selectedTable
    ? `1-${selectedTable.seats_available ?? "N/A"}`
    : "Seat number";

  return (
    <div>
      <div className="flex justify-between items-center">
        <label htmlFor="movePlayerTable" className="text-sm font-medium">
          Move Player
        </label>
        {value && currentTable && (
          <span className="text-xs text-muted-foreground">
            Currently at: {currentTableName}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-1">
        <Select value={value || ""} onValueChange={onTableChange}>
          <SelectTrigger id="movePlayerTable">
            <SelectValue placeholder="Select table">
              {currentTable
                ? `${currentTable.name || "Unnamed Table"} (${currentTable.seats_available} seats)`
                : value
                  ? `Table ID: ${value} (Not Found)`
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
                {table.gaming_table_id === value && " ✓"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="space-y-1">
          <Input
            type="number"
            placeholder={seatPlaceholder}
            value={seatValue}
            onChange={onSeatChange}
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
}
