"use client";

import { Plus, Minus } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { IncrementButtonGroup } from "./increment-button-group";

interface FormSectionCashInProps {
  value: string;
  totalCashIn?: number; // Existing total to display (in dollars)
  onChange: (v: string) => void;
  onReset: () => void;
  incrementHandlers: { newBuyIn: (amount: number) => void }; // Changed from cashIn
  decrementHandler: () => void;
  incrementButtons: { amount: number; label: string }[];
  totalChange: number;
}

export function FormSectionCashIn({
  value,
  totalCashIn,
  onChange,
  onReset,
  incrementHandlers,
  decrementHandler,
  incrementButtons,
  totalChange,
}: FormSectionCashInProps) {
  return (
    <div>
      {/* Display existing total cash-in (read-only) */}
      {totalCashIn !== undefined && (
        <div className="mb-3 p-3 bg-muted rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Cash In</span>
            <span className="text-lg font-semibold font-mono">
              ${totalCashIn.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* New buy-in input (editable) */}
      <div className="flex justify-between items-center">
        <label htmlFor="newBuyIn" className="text-sm font-medium">
          New Buy-In
        </label>
        <Button onClick={onReset} variant="outline" size="sm">
          Reset
        </Button>
      </div>
      <div className="flex items-center space-x-2 mt-1">
        <Button onClick={decrementHandler} variant="outline" size="icon">
          <Minus className="h-6 w-6" />
        </Button>
        <Input
          id="newBuyIn"
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 text-lg text-center"
        />
        <Button
          onClick={() => incrementHandlers.newBuyIn(1)}
          variant="outline"
          size="icon"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
      <IncrementButtonGroup
        type="newBuyIn"
        incrementButtons={incrementButtons}
        onIncrement={(_, amount) => incrementHandlers.newBuyIn(amount)}
      />
      <div className="text-sm mt-1 text-muted-foreground">
        Total Change: {totalChange > 0 ? "+" : ""}
        {totalChange}
      </div>
    </div>
  );
}
