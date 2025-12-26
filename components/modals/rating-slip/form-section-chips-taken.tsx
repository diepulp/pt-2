"use client";

import { Plus, Minus } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChipsTakenField } from "@/hooks/ui/use-rating-slip-modal";

import { IncrementButtonGroup } from "./increment-button-group";

/**
 * FormSectionChipsTaken - Chips Taken field with increment/decrement controls.
 * Uses Zustand hook for state management (ZUSTAND-RSM migration).
 *
 * @see useChipsTakenField - Field-specific selector hook
 * @see ZUSTAND_INTEGRATION.md - Migration guide
 */
export function FormSectionChipsTaken() {
  const { value, updateField, incrementField, decrementField } =
    useChipsTakenField();

  // Static increment button configuration
  const incrementButtons = [
    { amount: 5, label: "+5" },
    { amount: 25, label: "+25" },
    { amount: 100, label: "+100" },
    { amount: 500, label: "+500" },
    { amount: 1000, label: "+1000" },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField("chipsTaken", e.target.value);
  };

  const handleIncrement = (amount: number) => {
    incrementField("chipsTaken", amount);
  };

  const handleDecrement = () => {
    decrementField("chipsTaken");
  };

  return (
    <div>
      <div className="flex justify-between items-center">
        <label htmlFor="chipsTaken" className="text-sm font-medium">
          Chips Taken
        </label>
      </div>
      <div className="flex items-center space-x-2 mt-1">
        <Button onClick={handleDecrement} variant="outline" size="icon">
          <Minus className="h-6 w-6" />
        </Button>
        <Input
          id="chipsTaken"
          type="number"
          value={value}
          onChange={handleChange}
          className="h-12 text-lg text-center"
          placeholder="Enter chips taken"
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
        type="chipsTaken"
        incrementButtons={incrementButtons}
        onIncrement={(_, amount) => handleIncrement(amount)}
      />
    </div>
  );
}
