'use client';

/**
 * Activate Locally Dialog — confirmation for cross-property player activation.
 *
 * Uses useTransition for the mutation (React 19 pattern).
 * Key-based reset for dialog state (no useEffect sync).
 *
 * @see PRD-051 §4 / ADR-044 D3
 */

import { useTransition } from 'react';
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
import { useActivateLocally } from '@/hooks/recognition/use-recognition-mutations';
import type { RecognitionResultDTO } from '@/services/recognition';

interface ActivateLocallyDialogProps {
  player: RecognitionResultDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivateLocallyDialog({
  player,
  open,
  onOpenChange,
}: ActivateLocallyDialogProps) {
  const [isPending, startTransition] = useTransition();
  const activateMutation = useActivateLocally();

  const originCasino =
    player.enrolledCasinos[0]?.casinoName ?? 'sister property';

  const handleActivate = () => {
    startTransition(async () => {
      try {
        const result = await activateMutation.mutateAsync(player.playerId);
        if (result.alreadyEnrolled) {
          toast.info(`${player.fullName} is already enrolled here.`);
        } else {
          toast.success(`${player.fullName} activated at this property.`);
        }
        onOpenChange(false);
      } catch {
        toast.error('Failed to activate player. Please try again.');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Activate Player Locally</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">
              {player.fullName}
            </span>{' '}
            is currently enrolled at{' '}
            <span className="font-medium text-foreground">{originCasino}</span>.
            This will create a local enrollment at your property.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-muted/30 border border-border/30 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Player</span>
            <span className="font-medium">{player.fullName}</span>
          </div>
          {player.birthDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">DOB</span>
              <span className="font-medium">{player.birthDate}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Origin</span>
            <span className="font-medium">{originCasino}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Enrolled at</span>
            <span className="font-medium">
              {player.enrolledCasinos.length}{' '}
              {player.enrolledCasinos.length === 1 ? 'property' : 'properties'}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleActivate} disabled={isPending}>
            {isPending ? 'Activating...' : 'Activate at This Property'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
