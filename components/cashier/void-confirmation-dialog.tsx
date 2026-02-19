'use client';

/**
 * Void Confirmation Dialog
 *
 * Modal for voiding a cash-out transaction. Creates a reversal via
 * related_transaction_id + txn_kind='reversal' + reason_code.
 * Reason code and note are required per audit trail compliance.
 *
 * @see PRD-033 WS5 Patron Transactions
 * @see GAP-PRD033-PATRON-CASHOUT-UI
 */

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

import { AmountDisplay } from './amount-display';

const REASON_OPTIONS: { value: AdjustmentReasonCode; label: string }[] = [
  { value: 'data_entry_error', label: 'Data Entry Error' },
  { value: 'duplicate', label: 'Duplicate Transaction' },
  { value: 'wrong_player', label: 'Wrong Player' },
  { value: 'wrong_amount', label: 'Wrong Amount' },
  { value: 'system_bug', label: 'System Bug' },
  { value: 'other', label: 'Other' },
];

const MIN_NOTE_LENGTH = 10;

interface VoidConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: {
    id: string;
    amount: number;
    player_id: string;
    visit_id: string;
    casino_id: string;
  } | null;
  onVoid: (params: {
    original_txn_id: string;
    reason_code: AdjustmentReasonCode;
    note: string;
  }) => void;
}

export function VoidConfirmationDialog({
  open,
  onOpenChange,
  transaction,
  onVoid,
}: VoidConfirmationDialogProps) {
  const [reasonCode, setReasonCode] = useState<AdjustmentReasonCode | ''>('');
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const isValid = reasonCode !== '' && note.trim().length >= MIN_NOTE_LENGTH;

  const handleVoid = () => {
    if (!transaction || !isValid) return;

    startTransition(() => {
      onVoid({
        original_txn_id: transaction.id,
        reason_code: reasonCode as AdjustmentReasonCode,
        note: note.trim(),
      });
      resetForm();
    });
  };

  const resetForm = () => {
    setReasonCode('');
    setNote('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void Cash-Out</DialogTitle>
          <DialogDescription>
            Void the cash-out of{' '}
            <AmountDisplay
              cents={transaction.amount}
              className="font-semibold text-foreground"
            />
            . This creates a reversal transaction linked to the original. Both
            reason and note are required for audit compliance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label
              htmlFor="void-reason"
              className="text-xs text-muted-foreground"
            >
              Reason Code (required)
            </Label>
            <Select
              value={reasonCode}
              onValueChange={(v) => setReasonCode(v as AdjustmentReasonCode)}
            >
              <SelectTrigger id="void-reason" className="h-9">
                <SelectValue placeholder="Select reason..." />
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

          <div className="space-y-1.5">
            <Label
              htmlFor="void-note"
              className="text-xs text-muted-foreground"
            >
              Note (required, min {MIN_NOTE_LENGTH} characters)
            </Label>
            <Textarea
              id="void-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain why this cash-out is being voided..."
              className="min-h-[80px] text-sm"
            />
            {note.length > 0 && note.trim().length < MIN_NOTE_LENGTH && (
              <p className="text-xs text-destructive">
                Note must be at least {MIN_NOTE_LENGTH} characters (
                {MIN_NOTE_LENGTH - note.trim().length} more needed)
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleVoid}
            disabled={!isValid || isPending}
            size="sm"
            variant="destructive"
          >
            {isPending ? 'Voiding...' : 'Confirm Void'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
