'use client';

/**
 * Redeem Loyalty Dialog — local redemption with balance guard.
 *
 * Shows ONLY redeemable_here (local balance), never portfolio total.
 * Uses useTransition for the mutation (React 19 pattern).
 * Key-based reset via playerId prop.
 *
 * @see PRD-051 §6 / ADR-044 D6
 */

import { Coins, MessageSquare } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

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
import { Separator } from '@/components/ui/separator';
import { useRedeemLocally } from '@/hooks/recognition/use-recognition-mutations';
import type { RecognitionResultDTO } from '@/services/recognition';

interface RedeemLoyaltyDialogProps {
  player: RecognitionResultDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RedeemLoyaltyForm({
  player,
  onOpenChange,
}: {
  player: RecognitionResultDTO;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const redeemMutation = useRedeemLocally();

  const redeemableHere = player.loyaltyEntitlement.redeemableHere;
  const parsedAmount = parseInt(amount, 10);
  const isValidAmount =
    !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= redeemableHere;
  const isValid = isValidAmount && reason.trim().length > 0;

  const handleRedeem = () => {
    if (!isValid) return;

    startTransition(async () => {
      try {
        const result = await redeemMutation.mutateAsync({
          playerId: player.playerId,
          amount: parsedAmount,
          reason: reason.trim(),
        });
        toast.success(
          `Redeemed ${parsedAmount.toLocaleString()} pts. Balance: ${result.localBalance.toLocaleString()} pts`,
        );
        onOpenChange(false);
      } catch (error) {
        const message =
          error instanceof Error &&
          error.message.includes('INSUFFICIENT_BALANCE')
            ? `Insufficient balance. Available: ${redeemableHere.toLocaleString()} pts`
            : 'Redemption failed. Please try again.';
        toast.error(message);
      }
    });
  };

  return (
    <>
      <div className="space-y-5">
        <div className="rounded-md bg-muted/30 border border-border/30 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">
              Available here
            </span>
            <span
              className="text-lg font-bold tabular-nums"
              style={{ fontFamily: 'monospace' }}
            >
              {redeemableHere.toLocaleString()} pts
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Coins className="h-3.5 w-3.5 text-accent" />
            <h4
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              Redemption
            </h4>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="redeem-amount"
              className="text-sm text-muted-foreground"
            >
              Amount (points)
            </Label>
            <Input
              id="redeem-amount"
              type="number"
              min="1"
              max={redeemableHere}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter points to redeem"
              disabled={isPending}
              className="font-mono tabular-nums"
            />
            {amount && !isValidAmount && (
              <p className="text-xs text-destructive">
                {parsedAmount > redeemableHere
                  ? `Maximum redeemable: ${redeemableHere.toLocaleString()} pts`
                  : 'Enter a valid positive number'}
              </p>
            )}
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-accent" />
            <h4
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              Details
            </h4>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="redeem-reason"
              className="text-sm text-muted-foreground"
            >
              Reason
            </Label>
            <Input
              id="redeem-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Comp dinner, promotional reward, etc."
              maxLength={500}
              disabled={isPending}
              className="font-mono"
            />
          </div>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs font-semibold uppercase tracking-wider"
          onClick={() => onOpenChange(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs font-semibold uppercase tracking-wider"
          onClick={handleRedeem}
          disabled={!isValid || isPending}
        >
          {isPending
            ? 'Redeeming...'
            : `Redeem ${parsedAmount > 0 ? parsedAmount.toLocaleString() : '0'} pts`}
        </Button>
      </DialogFooter>
    </>
  );
}

export function RedeemLoyaltyDialog({
  player,
  open,
  onOpenChange,
}: RedeemLoyaltyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Redeem Loyalty Points
          </DialogTitle>
          <DialogDescription className="text-sm">
            Redeem points for{' '}
            <span className="font-medium text-foreground">
              {player.fullName}
            </span>{' '}
            at this property.
          </DialogDescription>
        </DialogHeader>

        {/* Key-based reset: form resets when player changes */}
        <RedeemLoyaltyForm
          key={player.playerId}
          player={player}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
