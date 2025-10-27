'use client';

import { FormEvent, useState } from 'react';

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

export type ManualRewardResult = {
  loyalty: {
    playerId: string;
    pointsEarned: number;
    newBalance: number;
    tier: string;
  };
};

type ManualRewardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  playerName: string;
  currentBalance: number;
  currentTier: string;
  onSuccess?: (result: ManualRewardResult) => void;
};

export function ManualRewardDialog({
  open,
  onOpenChange,
  playerId,
  playerName,
  currentBalance,
  currentTier,
  onSuccess,
}: ManualRewardDialogProps) {
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setPoints('');
      setReason('');
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const awardedPoints = Number(points) || 0;
      onSuccess?.({
        loyalty: {
          playerId,
          pointsEarned: awardedPoints,
          newBalance: currentBalance + awardedPoints,
          tier: currentTier,
        },
      });
      handleClose(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual reward</DialogTitle>
          <DialogDescription>
            Issue bonus loyalty points to {playerName}.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="reward-points">Points</Label>
            <Input
              id="reward-points"
              type="number"
              inputMode="numeric"
              min={0}
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder="Enter point amount"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reward-reason">Reason</Label>
            <Input
              id="reward-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional context for audit trail"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Issuing...' : 'Issue reward'}
            </Button>
          </DialogFooter>
        </form>

        <p className="text-xs text-muted-foreground">
          Current tier: {currentTier} • Balance: {currentBalance} pts
        </p>
      </DialogContent>
    </Dialog>
  );
}
