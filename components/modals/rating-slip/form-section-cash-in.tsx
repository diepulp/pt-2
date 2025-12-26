"use client";

import { Plus, Minus } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNewBuyInField } from "@/hooks/ui/use-rating-slip-modal";

import { IncrementButtonGroup } from "./increment-button-group";

// Increment button configuration for cash-in amounts
const INCREMENT_BUTTONS = [
  { amount: 5, label: "+5" },
  { amount: 25, label: "+25" },
  { amount: 100, label: "+100" },
  { amount: 500, label: "+500" },
  { amount: 1000, label: "+1000" },
];

interface FormSectionCashInProps {
  totalCashIn?: number; // Existing total to display (in dollars)
}

export function FormSectionCashIn({ totalCashIn }: FormSectionCashInProps) {
  // Hook into Zustand store for newBuyIn field
  const {
    value,
    originalValue,
    updateField,
    resetField,
    incrementField,
    decrementField,
  } = useNewBuyInField();

  // Calculate derived state - total change from original value
  const totalChange = Number(value) - Number(originalValue);

  // Event handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField("newBuyIn", e.target.value);
  };

  const handleReset = () => {
    resetField("newBuyIn");
  };

  const handleIncrement = (amount: number) => {
    incrementField("newBuyIn", amount);
  };

  const handleDecrement = () => {
    decrementField("newBuyIn");
  };

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
        <Button onClick={handleReset} variant="outline" size="sm">
          Reset
        </Button>
      </div>
      <div className="flex items-center space-x-2 mt-1">
        <Button onClick={handleDecrement} variant="outline" size="icon">
          <Minus className="h-6 w-6" />
        </Button>
        <Input
          id="newBuyIn"
          type="number"
          value={value}
          onChange={handleChange}
          className="h-12 text-lg text-center"
        />
        <Button
          onClick={() => handleIncrement(1)}
          variant="outline"
          size="icon"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
      <IncrementButtonGroup
        type="newBuyIn"
        incrementButtons={INCREMENT_BUTTONS}
        onIncrement={(_, amount) => handleIncrement(amount)}
      />
      <div className="text-sm mt-1 text-muted-foreground">
        Total Change: {totalChange > 0 ? "+" : ""}
        {totalChange}
      </div>
    </div>
  );
}
