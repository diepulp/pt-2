'use client';

import { AlertCircle, Info } from 'lucide-react';
import React from 'react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { AdjustmentReasonCode } from '@/services/player-financial/dtos';

/** Reason code options for the dropdown */
const REASON_OPTIONS: { value: AdjustmentReasonCode; label: string }[] = [
  { value: 'data_entry_error', label: 'Data Entry Error' },
  { value: 'wrong_amount', label: 'Wrong Amount' },
  { value: 'duplicate', label: 'Duplicate Transaction' },
  { value: 'wrong_player', label: 'Wrong Player' },
  { value: 'system_bug', label: 'System Bug' },
  { value: 'other', label: 'Other' },
];

interface AdjustmentModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback when adjustment is submitted */
  onSubmit: (data: {
    deltaAmount: number;
    reasonCode: AdjustmentReasonCode;
    note: string;
  }) => void;
  /** Current total cash in (for display) */
  currentTotal: number;
  /** Whether submission is in progress */
  isPending?: boolean;
  /** Error message to display */
  error?: string | null;
}

/**
 * Modal for creating financial adjustments.
 *
 * Provides a compliance-friendly way to correct cash-in totals
 * without editing/deleting original transactions.
 *
 * Requirements:
 * - Delta amount (signed, non-zero)
 * - Reason code (required)
 * - Note (required, min 10 characters)
 */
export function AdjustmentModal({
  isOpen,
  onClose,
  onSubmit,
  currentTotal,
  isPending = false,
  error = null,
}: AdjustmentModalProps) {
  // Form state
  const [deltaAmount, setDeltaAmount] = React.useState('');
  const [reasonCode, setReasonCode] = React.useState<AdjustmentReasonCode | ''>(
    '',
  );
  const [note, setNote] = React.useState('');

  // Derived state
  const deltaNum = Number(deltaAmount) || 0;
  const projectedTotal = currentTotal + deltaNum;
  const noteLength = note.trim().length;

  // Validation
  const isValidDelta = deltaNum !== 0;
  const isValidReason = reasonCode !== '';
  const isValidNote = noteLength >= 10;
  const canSubmit = isValidDelta && isValidReason && isValidNote && !isPending;

  // Reset form when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setDeltaAmount('');
      setReasonCode('');
      setNote('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !reasonCode) return;

    onSubmit({
      deltaAmount: deltaNum,
      reasonCode,
      note: note.trim(),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Cash In Total</DialogTitle>
          <DialogDescription>
            Create an adjustment to correct the total. Original transactions are
            preserved for audit compliance.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current & Projected Total */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
            <div>
              <div className="text-xs text-muted-foreground">Current Total</div>
              <div className="text-lg font-semibold font-mono">
                ${currentTotal.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Projected Total
              </div>
              <div
                className={`text-lg font-semibold font-mono ${
                  deltaNum > 0
                    ? 'text-green-600'
                    : deltaNum < 0
                      ? 'text-red-600'
                      : ''
                }`}
              >
                ${projectedTotal.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Delta Amount */}
          <div className="space-y-2">
            <Label htmlFor="deltaAmount">
              Adjustment Amount{' '}
              <span className="text-muted-foreground">
                (use - for decrease)
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-mono">$</span>
              <Input
                id="deltaAmount"
                type="number"
                step="0.01"
                value={deltaAmount}
                onChange={(e) => setDeltaAmount(e.target.value)}
                placeholder="e.g., -100 or +50"
                className="font-mono"
              />
            </div>
            {deltaAmount && !isValidDelta && (
              <p className="text-sm text-destructive">Amount cannot be zero</p>
            )}
          </div>

          {/* Reason Code */}
          <div className="space-y-2">
            <Label htmlFor="reasonCode">Reason for Adjustment</Label>
            <Select
              value={reasonCode}
              onValueChange={(v) => setReasonCode(v as AdjustmentReasonCode)}
            >
              <SelectTrigger id="reasonCode">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">
              Explanation{' '}
              <span className="text-muted-foreground">(min 10 characters)</span>
            </Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain why this adjustment is needed..."
              rows={3}
            />
            <div className="flex justify-between text-xs">
              <span
                className={
                  noteLength > 0 && noteLength < 10
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                }
              >
                {noteLength}/10 minimum characters
              </span>
            </div>
          </div>

          {/* Audit Notice */}
          <div className="flex items-start gap-2 p-3 bg-blue-950/30 border border-blue-800/50 rounded-lg text-sm">
            <Info className="h-4 w-4 mt-0.5 text-blue-400 flex-shrink-0" />
            <span className="text-blue-200">
              This creates an auditable adjustment transaction. Your name and
              the reason will be recorded for compliance.
            </span>
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-950/50 border border-red-800 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 text-red-400 flex-shrink-0" />
              <span className="text-red-200">{error}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isPending ? 'Creating...' : 'Create Adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
