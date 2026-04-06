'use client';

/**
 * Acknowledge Alert Dialog (PRD-056 WS6)
 *
 * Dialog for acknowledging a persistent alert with optional notes
 * and false-positive flag. Uses useTransition for React 19 submit.
 */

import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAcknowledgeAlert } from '@/hooks/shift-intelligence/use-shift-alerts';
import type { ShiftAlertDTO } from '@/services/shift-intelligence/dtos';

interface AcknowledgeAlertDialogProps {
  alert: ShiftAlertDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AcknowledgeAlertDialog({
  alert,
  open,
  onOpenChange,
}: AcknowledgeAlertDialogProps) {
  const [isPending, startTransition] = useTransition();
  const acknowledgeMutation = useAcknowledgeAlert();

  function handleSubmit(formData: FormData) {
    if (!alert) return;

    startTransition(async () => {
      await acknowledgeMutation.mutateAsync({
        alert_id: alert.id,
        notes: (formData.get('notes') as string) || undefined,
        is_false_positive: formData.get('is_false_positive') === 'on',
      });
      onOpenChange(false);
    });
  }

  if (!alert) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Acknowledge Alert
          </DialogTitle>
          <DialogDescription className="text-sm">
            {alert.tableLabel} &mdash; {alert.metricType}
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm text-muted-foreground">
              Notes
              <span className="ml-1 text-xs text-muted-foreground/50">
                optional
              </span>
            </Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Add context or observations..."
              maxLength={1000}
              rows={3}
              className="font-mono"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox id="is_false_positive" name="is_false_positive" />
            <Label
              htmlFor="is_false_positive"
              className="text-sm text-muted-foreground"
            >
              Mark as false positive
            </Label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold uppercase tracking-wider"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 gap-1.5 text-xs font-semibold uppercase tracking-wider"
              disabled={isPending}
            >
              {isPending ? 'Acknowledging...' : 'Acknowledge'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
