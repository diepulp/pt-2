"use client";

import { Plus, Minus } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { IncrementButtonGroup } from "./increment-button-group";

interface FormSectionAverageBetProps {
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  incrementHandlers: { averageBet: (amount: number) => void };
  decrementHandler: () => void;
  incrementButtons: { amount: number; label: string }[];
  totalChange: number;
}

const FormSectionAverageBetComponent: React.FC<FormSectionAverageBetProps> = ({
  value,
  onChange,
  onReset,
  incrementHandlers,
  decrementHandler,
  incrementButtons,
  totalChange,
}) => (
  <div>
    <div className="flex justify-between items-center">
      <label htmlFor="averageBet" className="text-sm font-medium">
        Average Bet
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
        id="averageBet"
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 text-lg text-center"
      />
      <Button
        onClick={() => incrementHandlers.averageBet(1)}
        variant="outline"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
    <IncrementButtonGroup
      type="averageBet"
      incrementButtons={incrementButtons}
      onIncrement={(_, amount) => incrementHandlers.averageBet(amount)}
    />
    <div className="text-sm mt-1 text-muted-foreground">
      Total Change: {totalChange > 0 ? "+" : ""}
      {totalChange}
    </div>
  </div>
);

export const FormSectionAverageBet = React.memo(FormSectionAverageBetComponent);
