/**
 * Lift Exclusion Dialog
 *
 * Confirmation dialog for lifting (soft-deleting) an active exclusion.
 * Requires lift_reason. Role-gated to admin only.
 *
 * @see PRD-052 GAP-5
 * @see EXEC-052 WS5
 */

'use client';

import { MessageSquare } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useLiftExclusion } from '@/hooks/player/use-exclusions';
import { cn } from '@/lib/utils';
import type { PlayerExclusionDTO } from '@/services/player/exclusion-dtos';

const ENFORCEMENT_COLORS: Record<string, string> = {
  hard_block: 'bg-red-500/10 text-red-400 border-red-500/30',
  soft_alert: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  monitor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};

interface LiftExclusionDialogProps {
  exclusion: PlayerExclusionDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LiftExclusionDialog({
  exclusion,
  open,
  onOpenChange,
}: LiftExclusionDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [liftReason, setLiftReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const liftMutation = useLiftExclusion();

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const handleLift = () => {
    const trimmed = liftReason.trim();
    if (!trimmed) {
      setError('Lift reason is required');
      return;
    }
    if (trimmed.length > 1000) {
      setError('Lift reason must be 1000 characters or less');
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await liftMutation.mutateAsync({
          playerId: exclusion.player_id,
          exclusionId: exclusion.id,
          input: { lift_reason: trimmed },
        });
        toast.success('Exclusion lifted');
        setLiftReason('');
        onOpenChange(false);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to lift exclusion';
        toast.error(message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Lift Exclusion
          </DialogTitle>
          <DialogDescription>
            This will deactivate the exclusion. The record is preserved for
            audit.
          </DialogDescription>
        </DialogHeader>

        {/* Exclusion summary */}
        <div className="rounded-lg border-2 border-border/50 bg-card/50 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className="text-xs font-bold capitalize"
              style={{ fontFamily: 'monospace' }}
            >
              {exclusion.exclusion_type.replace('_', ' ')}
            </span>
            <Badge
              variant="outline"
              className={cn(
                'h-4 text-[9px] px-1',
                ENFORCEMENT_COLORS[exclusion.enforcement] ?? '',
              )}
            >
              {exclusion.enforcement.replace('_', ' ')}
            </Badge>
          </div>
          <div
            className="text-[10px] text-muted-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Since {formatDate(exclusion.effective_from)}
            {exclusion.effective_until && (
              <> &ndash; {formatDate(exclusion.effective_until)}</>
            )}
          </div>
          {exclusion.reason && (
            <p className="text-xs text-muted-foreground/70">
              {exclusion.reason}
            </p>
          )}
        </div>

        <Separator />

        {/* Lift reason */}
        <div className="space-y-1.5">
          <Label
            htmlFor="lift_reason"
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Reason for Lifting
          </Label>
          <Textarea
            id="lift_reason"
            placeholder="Why is this exclusion being lifted?"
            value={liftReason}
            onChange={(e) => setLiftReason(e.target.value)}
            rows={3}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs font-semibold uppercase tracking-wider"
            onClick={() => onOpenChange(false)}
            className="h-9 text-xs font-semibold uppercase tracking-wider"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs font-semibold uppercase tracking-wider"
            onClick={handleLift}
            disabled={isPending || !liftReason.trim()}
            className="h-9 text-xs font-semibold uppercase tracking-wider"
          >
            {isPending ? 'Lifting...' : 'Lift Exclusion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
