"use client";

import { Plus, Minus } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { IncrementButtonGroup } from "./increment-button-group";

interface FormSectionCashInProps {
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  incrementHandlers: { cashIn: (amount: number) => void };
  decrementHandler: () => void;
  incrementButtons: { amount: number; label: string }[];
  totalChange: number;
}

const FormSectionCashInComponent: React.FC<FormSectionCashInProps> = ({
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
      <label htmlFor="cashIn" className="text-sm font-medium">
        Cash In
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
        id="cashIn"
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 text-lg text-center"
      />
      <Button
        onClick={() => incrementHandlers.cashIn(1)}
        variant="outline"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
    <IncrementButtonGroup
      type="cashIn"
      incrementButtons={incrementButtons}
      onIncrement={(_, amount) => incrementHandlers.cashIn(amount)}
    />
    <div className="text-sm mt-1 text-muted-foreground">
      Total Change: {totalChange > 0 ? "+" : ""}
      {totalChange}
    </div>
  </div>
);

export const FormSectionCashIn = React.memo(FormSectionCashInComponent);
