'use client';

import { Pencil } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface TableLimitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMinBet: number;
  currentMaxBet: number;
  onSave: (minBet: number, maxBet: number) => Promise<void>;
  isLoading?: boolean;
}

/**
 * TableLimitsDialog
 * PRD-012: Table Betting Limits Management
 *
 * Features:
 * - Two numeric inputs for min_bet and max_bet
 * - Quick increment buttons: +25, +100, +500
 * - Client-side validation (min ≤ max, non-negative)
 * - Error message display
 * - Loading state on Save button
 */
export function TableLimitsDialog({
  open,
  onOpenChange,
  currentMinBet,
  currentMaxBet,
  onSave,
  isLoading = false,
}: TableLimitsDialogProps) {
  const [minBet, setMinBet] = React.useState(currentMinBet);
  const [maxBet, setMaxBet] = React.useState(currentMaxBet);
  const [error, setError] = React.useState<string>('');

  // Reset form when dialog opens with new values
  React.useEffect(() => {
    if (open) {
      setMinBet(currentMinBet);
      setMaxBet(currentMaxBet);
      setError('');
    }
  }, [open, currentMinBet, currentMaxBet]);

  const validateInputs = (): boolean => {
    if (minBet < 0) {
      setError('Minimum bet cannot be negative');
      return false;
    }
    if (maxBet < 0) {
      setError('Maximum bet cannot be negative');
      return false;
    }
    if (minBet > maxBet) {
      setError('Minimum bet cannot exceed maximum bet');
      return false;
    }
    setError('');
    return true;
  };

  const handleSave = async () => {
    if (!validateInputs()) return;

    try {
      await onSave(minBet, maxBet);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update table limits',
      );
    }
  };

  const handleQuickIncrement = (field: 'min' | 'max', amount: number): void => {
    if (field === 'min') {
      setMinBet((prev) => Math.max(0, prev + amount));
    } else {
      setMaxBet((prev) => Math.max(0, prev + amount));
    }
  };

  const handleInputChange = (field: 'min' | 'max', value: string): void => {
    const numValue = value === '' ? 0 : parseInt(value, 10);
    if (!isNaN(numValue)) {
      if (field === 'min') {
        setMinBet(numValue);
      } else {
        setMaxBet(numValue);
      }
      setError('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5 text-muted-foreground" />
            Edit Table Limits
          </DialogTitle>
          <DialogDescription>
            Set minimum and maximum betting limits for this table. Use quick
            increment buttons for common adjustments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Minimum Bet */}
          <div className="space-y-3">
            <Label htmlFor="min-bet" className="text-sm font-semibold">
              Minimum Bet
            </Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="min-bet"
                  type="number"
                  min="0"
                  value={minBet}
                  onChange={(e) => handleInputChange('min', e.target.value)}
                  className="pl-7"
                  aria-invalid={!!error && error.includes('Minimum')}
                  disabled={isLoading}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickIncrement('min', 25)}
                disabled={isLoading}
              >
                +$25
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickIncrement('min', 100)}
                disabled={isLoading}
              >
                +$100
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickIncrement('min', 500)}
                disabled={isLoading}
              >
                +$500
              </Button>
            </div>
          </div>

          {/* Maximum Bet */}
          <div className="space-y-3">
            <Label htmlFor="max-bet" className="text-sm font-semibold">
              Maximum Bet
            </Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="max-bet"
                  type="number"
                  min="0"
                  value={maxBet}
                  onChange={(e) => handleInputChange('max', e.target.value)}
                  className="pl-7"
                  aria-invalid={!!error && error.includes('Maximum')}
                  disabled={isLoading}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickIncrement('max', 25)}
                disabled={isLoading}
              >
                +$25
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickIncrement('max', 100)}
                disabled={isLoading}
              >
                +$100
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickIncrement('max', 500)}
                disabled={isLoading}
              >
                +$500
              </Button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
