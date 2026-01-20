'use client';

import { Plus, Minus } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAverageBetField } from '@/hooks/ui/use-rating-slip-modal';

import { IncrementButtonGroup } from './increment-button-group';

// Increment button configuration - extracted to module scope to prevent recreation
const INCREMENT_BUTTONS = [
  { amount: 5, label: '+5' },
  { amount: 10, label: '+10' },
  { amount: 25, label: '+25' },
  { amount: 50, label: '+50' },
  { amount: 100, label: '+100' },
] as const;

/**
 * Average Bet form section for Rating Slip Modal.
 * Uses Zustand store via useAverageBetField hook for optimized re-renders.
 *
 * React 19 Performance: Wrapped in React.memo to prevent parent re-renders
 * from triggering unnecessary reconciliation.
 *
 * @returns Form section with input, increment/decrement controls, and preset buttons
 *
 * @example
 * <FormSectionAverageBet />
 */
export const FormSectionAverageBet = React.memo(
  function FormSectionAverageBet() {
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

    // Event handlers - wrapped in useCallback for stable references
    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        updateField('averageBet', e.target.value);
      },
      [updateField],
    );

    const handleReset = React.useCallback(() => {
      resetField('averageBet');
    }, [resetField]);

    const handleIncrement = React.useCallback(
      (amount: number) => {
        incrementField('averageBet', amount);
      },
      [incrementField],
    );

    const handleDecrement = React.useCallback(() => {
      decrementField('averageBet');
    }, [decrementField]);

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
          incrementButtons={INCREMENT_BUTTONS}
          onIncrement={(_, amount) => handleIncrement(amount)}
        />
        <div className="text-sm mt-1 text-muted-foreground">
          Total Change: {totalChange > 0 ? '+' : ''}
          {totalChange}
        </div>
      </div>
    );
  },
);
