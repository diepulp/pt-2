"use client";

import { Plus, Minus } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { IncrementButtonGroup } from "./increment-button-group";

interface FormSectionChipsTakenProps {
  value: string;
  onChange: (v: string) => void;
  incrementHandlers: { chipsTaken: (amount: number) => void };
  decrementHandler: () => void;
  incrementButtons: { amount: number; label: string }[];
}

export function FormSectionChipsTaken({
  value,
  onChange,
  incrementHandlers,
  decrementHandler,
  incrementButtons,
}: FormSectionChipsTakenProps) {
  return (
    <div>
      <div className="flex justify-between items-center">
        <label htmlFor="chipsTaken" className="text-sm font-medium">
          Chips Taken
        </label>
      </div>
      <div className="flex items-center space-x-2 mt-1">
        <Button onClick={decrementHandler} variant="outline" size="icon">
          <Minus className="h-6 w-6" />
        </Button>
        <Input
          id="chipsTaken"
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 text-lg text-center"
          placeholder="Enter chips taken"
        />
        <Button
          onClick={() => incrementHandlers.chipsTaken(1)}
          variant="outline"
          size="icon"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
      <IncrementButtonGroup
        type="chipsTaken"
        incrementButtons={incrementButtons}
        onIncrement={(_, amount) => incrementHandlers.chipsTaken(amount)}
      />
    </div>
  );
}
