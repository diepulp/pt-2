"use client";

import { Plus, Minus } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAverageBetField } from "@/hooks/ui/use-rating-slip-modal";

import { IncrementButtonGroup } from "./increment-button-group";

/**
 * Average Bet form section for Rating Slip Modal.
 * Uses Zustand store via useAverageBetField hook for optimized re-renders.
 *
 * @returns Form section with input, increment/decrement controls, and preset buttons
 *
 * @example
 * <FormSectionAverageBet />
 */
export function FormSectionAverageBet() {
  const {
    value,
    originalValue,
    updateField,
    resetField,
    incrementField,
    decrementField,
  } = useAverageBetField();

  // Calculate derived state
  const totalChange = Number(value) - Number(originalValue);

  // Increment button configuration
  const incrementButtons = [
    { amount: 5, label: "+5" },
    { amount: 10, label: "+10" },
    { amount: 25, label: "+25" },
    { amount: 50, label: "+50" },
    { amount: 100, label: "+100" },
  ];

  // Event handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField("averageBet", e.target.value);
  };

  const handleReset = () => {
    resetField("averageBet");
  };

  const handleIncrement = (amount: number) => {
    incrementField("averageBet", amount);
  };

  const handleDecrement = () => {
    decrementField("averageBet");
  };

  return (
    <div>
      <div className="flex justify-between items-center">
        <label htmlFor="averageBet" className="text-sm font-medium">
          Average Bet
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
          id="averageBet"
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
        type="averageBet"
        incrementButtons={incrementButtons}
        onIncrement={(_, amount) => handleIncrement(amount)}
      />
      <div className="text-sm mt-1 text-muted-foreground">
        Total Change: {totalChange > 0 ? "+" : ""}
        {totalChange}
      </div>
    </div>
  );
}
