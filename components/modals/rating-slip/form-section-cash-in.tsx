'use client';

import { Plus, Minus, Pencil } from 'lucide-react';
import React from 'react';

import { BuyInThresholdIndicator } from '@/components/rating-slip/buy-in-threshold-indicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNewBuyInField } from '@/hooks/ui/use-rating-slip-modal';

import { IncrementButtonGroup } from './increment-button-group';

// Increment button configuration for cash-in amounts
const INCREMENT_BUTTONS = [
  { amount: 5, label: '+5' },
  { amount: 25, label: '+25' },
  { amount: 100, label: '+100' },
  { amount: 500, label: '+500' },
  { amount: 1000, label: '+1000' },
];

interface FormSectionCashInProps {
  /** Existing total to display (in dollars) - this is the NET total after adjustments */
  totalCashIn?: number;
  /**
   * Original total before adjustments (in dollars).
   * If different from totalCashIn, shows adjustment breakdown.
   */
  originalTotal?: number;
  /**
   * Sum of adjustments (can be negative).
   * Shows as "+$X" or "-$X" in the breakdown.
   */
  adjustmentTotal?: number;
  /**
   * Number of adjustments made.
   * Used to determine if adjustment breakdown should be shown.
   */
  adjustmentCount?: number;
  /**
   * Callback when user clicks "Adjust" button.
   * If not provided, adjustment button is not shown.
   */
  onAdjust?: () => void;
  /**
   * Player's current daily total for MTL threshold checking.
   * If provided, shows BuyInThresholdIndicator with projected total.
   * @see PRD-MTL-UI-GAPS WS7
   */
  playerDailyTotal?: number;
}

/**
 * Cash-In form section for Rating Slip Modal.
 * Uses Zustand store via useNewBuyInField hook for optimized re-renders.
 *
 * React 19 Performance: Wrapped in React.memo to prevent parent re-renders
 * from triggering unnecessary reconciliation.
 *
 * @returns Form section with total cash-in display and new buy-in input
 */
export const FormSectionCashIn = React.memo(function FormSectionCashIn({
  totalCashIn,
  originalTotal,
  adjustmentTotal = 0,
  adjustmentCount = 0,
  onAdjust,
  playerDailyTotal,
}: FormSectionCashInProps) {
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

  // Event handlers - wrapped in useCallback for stable references
  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField('newBuyIn', e.target.value);
    },
    [updateField],
  );

  const handleReset = React.useCallback(() => {
    resetField('newBuyIn');
  }, [resetField]);

  const handleIncrement = React.useCallback(
    (amount: number) => {
      incrementField('newBuyIn', amount);
    },
    [incrementField],
  );

  const handleDecrement = React.useCallback(() => {
    decrementField('newBuyIn');
  }, [decrementField]);

  // Determine if we should show adjustment breakdown
  const hasAdjustments = adjustmentCount > 0;

  return (
    <div>
      {/* Display existing total cash-in with adjustment breakdown */}
      {totalCashIn !== undefined && (
        <div className="mb-3 p-3 bg-muted rounded-lg space-y-2">
          {/* Header row with total and adjust button */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Cash In</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold font-mono">
                ${totalCashIn.toFixed(2)}
              </span>
              {onAdjust && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAdjust}
                  className="h-7 px-2"
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Adjust
                </Button>
              )}
            </div>
          </div>

          {/* Adjustment breakdown (shown when there are adjustments) */}
          {hasAdjustments && originalTotal !== undefined && (
            <div className="pt-2 border-t border-border/50 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Original Total</span>
                <span className="font-mono">${originalTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Adjustments ({adjustmentCount})
                </span>
                <span
                  className={`font-mono ${
                    adjustmentTotal > 0
                      ? 'text-green-600'
                      : adjustmentTotal < 0
                        ? 'text-red-600'
                        : ''
                  }`}
                >
                  {adjustmentTotal >= 0 ? '+' : ''}${adjustmentTotal.toFixed(2)}
                </span>
              </div>
            </div>
          )}
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
        Total Change: {totalChange > 0 ? '+' : ''}
        {totalChange}
      </div>

      {/* Threshold Indicator - shows projected daily total when buy-in entered */}
      {playerDailyTotal !== undefined && (
        <BuyInThresholdIndicator
          currentDailyTotal={playerDailyTotal}
          newBuyInAmount={Number(value) || 0}
          className="mt-3"
        />
      )}
    </div>
  );
});
