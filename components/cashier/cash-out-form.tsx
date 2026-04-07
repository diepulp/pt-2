'use client';

/**
 * Cash-Out Form
 *
 * Cash-out confirmation form for cashier: dollar amount input (→ cents per ADR-031),
 * optional receipt reference (external_ref), double-confirm for large amounts.
 *
 * @see PRD-033 WS5 Patron Transactions
 * @see ADR-031 Cents storage convention
 * @see GAP-PRD033-PATRON-CASHOUT-UI
 */

import { AlertTriangle, Receipt } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Threshold in dollars above which double-confirm is required */
const LARGE_AMOUNT_THRESHOLD_DOLLARS = 1000;

interface CashOutFormProps {
  playerName: string;
  visitId: string;
  disabled?: boolean;
  onSubmit: (params: { amountCents: number; externalRef?: string }) => void;
}

export function CashOutForm({
  playerName,
  visitId,
  disabled,
  onSubmit,
}: CashOutFormProps) {
  const [amountDollars, setAmountDollars] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isPending, startTransition] = useTransition();

  const parsedAmount = parseFloat(amountDollars || '0');
  const amountCents = Math.round(parsedAmount * 100);
  const isValid = parsedAmount > 0;
  const isLargeAmount = parsedAmount >= LARGE_AMOUNT_THRESHOLD_DOLLARS;

  const handleSubmit = () => {
    if (!isValid) return;

    if (isLargeAmount) {
      setShowConfirmDialog(true);
      return;
    }

    executeSubmit();
  };

  const executeSubmit = () => {
    startTransition(() => {
      onSubmit({
        amountCents,
        externalRef: externalRef.trim() || undefined,
      });
      setAmountDollars('');
      setExternalRef('');
      setShowConfirmDialog(false);
    });
  };

  return (
    <>
      <Card className="border-2 border-accent/50 bg-accent/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle
              className="text-sm font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Cash-Out Confirmation
            </CardTitle>
            <Badge
              variant="outline"
              className="bg-accent/10 text-accent border-accent/30 font-mono text-[10px]"
            >
              {visitId.slice(0, 8)}...
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Confirm cash-out for {playerName}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="cashout-amount"
              className="text-sm text-muted-foreground"
            >
              Amount ($)
            </Label>
            <Input
              id="cashout-amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              disabled={disabled || isPending}
              className="h-9 font-mono tabular-nums"
            />
            {isLargeAmount && (
              <div className="flex items-center gap-1.5 text-xs text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                Large amount — will require confirmation
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="cashout-ref"
              className="text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-1">
                <Receipt className="h-3 w-3" />
                Receipt / Ticket Ref
                <span className="ml-1 text-xs text-muted-foreground/50">
                  optional
                </span>
              </span>
            </Label>
            <Input
              id="cashout-ref"
              type="text"
              placeholder="Receipt number..."
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              disabled={disabled || isPending}
              className="h-9 font-mono"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!isValid || disabled || isPending}
            className="w-full text-xs font-semibold uppercase tracking-wider"
            size="sm"
          >
            {isPending
              ? 'Processing...'
              : `Confirm Cash-Out $${parsedAmount.toFixed(2)}`}
          </Button>
        </CardContent>
      </Card>

      {/* Double-confirm dialog for large amounts */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Large Cash-Out
            </DialogTitle>
            <DialogDescription>
              You are about to confirm a cash-out of{' '}
              <span className="font-semibold text-foreground">
                ${parsedAmount.toFixed(2)}
              </span>{' '}
              for{' '}
              <span className="font-semibold text-foreground">
                {playerName}
              </span>
              . This amount exceeds $
              {LARGE_AMOUNT_THRESHOLD_DOLLARS.toLocaleString()}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold uppercase tracking-wider"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={executeSubmit}
              disabled={isPending}
              size="sm"
              variant="destructive"
              className="h-8 text-xs font-semibold uppercase tracking-wider"
            >
              {isPending ? 'Processing...' : 'Confirm Cash-Out'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
