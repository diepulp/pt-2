/**
 * Create Exclusion Dialog
 *
 * Form dialog for creating a new player exclusion.
 * Validates via createExclusionSchema. Role-gated to pit_boss/admin.
 *
 * @see PRD-052 GAP-4
 * @see EXEC-052 WS5
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

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
import { useCreateExclusion } from '@/hooks/player/use-exclusions';
import {
  exclusionTypeEnum,
  enforcementEnum,
} from '@/services/player/exclusion-schemas';

// Client-side form schema (omits player_id — injected on submit)
const formSchema = z.object({
  exclusion_type: exclusionTypeEnum,
  enforcement: enforcementEnum,
  reason: z.string().min(1, 'Reason is required').max(1000, 'Reason too long'),
  effective_from: z.string().optional(),
  effective_until: z.string().optional(),
  review_date: z.string().optional(),
  external_ref: z.string().max(500).optional(),
  jurisdiction: z.string().max(200).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const EXCLUSION_TYPE_LABELS: Record<string, string> = {
  self_exclusion: 'Self Exclusion',
  trespass: 'Trespass',
  regulatory: 'Regulatory',
  internal_ban: 'Internal Ban',
  watchlist: 'Watchlist',
};

const ENFORCEMENT_LABELS: Record<string, string> = {
  hard_block: 'Hard Block',
  soft_alert: 'Soft Alert',
  monitor: 'Monitor',
};

interface CreateExclusionDialogProps {
  playerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateExclusionDialog({
  playerId,
  open,
  onOpenChange,
}: CreateExclusionDialogProps) {
  const [isPending, startTransition] = useTransition();
  const createMutation = useCreateExclusion();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      exclusion_type: undefined,
      enforcement: undefined,
      reason: '',
      effective_from: '',
      effective_until: '',
      review_date: '',
      external_ref: '',
      jurisdiction: '',
    },
  });

  const handleSubmit = (values: FormValues) => {
    // HTML <input type="date"> produces YYYY-MM-DD; server schema requires ISO 8601 datetime.
    const toISO = (v: string | undefined): string | undefined =>
      v ? new Date(`${v}T00:00:00`).toISOString() : undefined;
    const toISOOrNull = (v: string | undefined): string | null =>
      v ? new Date(`${v}T00:00:00`).toISOString() : null;

    startTransition(async () => {
      try {
        await createMutation.mutateAsync({
          playerId,
          input: {
            exclusion_type: values.exclusion_type,
            enforcement: values.enforcement,
            reason: values.reason,
            effective_from: toISO(values.effective_from),
            effective_until: toISOOrNull(values.effective_until),
            review_date: toISOOrNull(values.review_date),
            external_ref: values.external_ref || null,
            jurisdiction: values.jurisdiction || null,
          },
        });
        toast.success('Exclusion created');
        form.reset();
        onOpenChange(false);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create exclusion';
        toast.error(message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Exclusion</DialogTitle>
          <DialogDescription>
            Create a new exclusion record for this player.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Exclusion Type */}
          <div className="space-y-1.5">
            <Label htmlFor="exclusion_type">Type</Label>
            <Select
              value={form.watch('exclusion_type') ?? ''}
              onValueChange={(v) =>
                form.setValue(
                  'exclusion_type',
                  v as FormValues['exclusion_type'],
                  {
                    shouldValidate: true,
                  },
                )
              }
            >
              <SelectTrigger id="exclusion_type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {exclusionTypeEnum.options.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EXCLUSION_TYPE_LABELS[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.exclusion_type && (
              <p className="text-xs text-destructive">
                {form.formState.errors.exclusion_type.message}
              </p>
            )}
          </div>

          {/* Enforcement */}
          <div className="space-y-1.5">
            <Label htmlFor="enforcement">Enforcement</Label>
            <Select
              value={form.watch('enforcement') ?? ''}
              onValueChange={(v) =>
                form.setValue('enforcement', v as FormValues['enforcement'], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="enforcement">
                <SelectValue placeholder="Select enforcement" />
              </SelectTrigger>
              <SelectContent>
                {enforcementEnum.options.map((e) => (
                  <SelectItem key={e} value={e}>
                    {ENFORCEMENT_LABELS[e] ?? e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.enforcement && (
              <p className="text-xs text-destructive">
                {form.formState.errors.enforcement.message}
              </p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              placeholder="Reason for exclusion..."
              {...form.register('reason')}
              rows={3}
            />
            {form.formState.errors.reason && (
              <p className="text-xs text-destructive">
                {form.formState.errors.reason.message}
              </p>
            )}
          </div>

          {/* Date fields row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="effective_from">Effective From</Label>
              <Input
                id="effective_from"
                type="date"
                {...form.register('effective_from')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="effective_until">Effective Until</Label>
              <Input
                id="effective_until"
                type="date"
                {...form.register('effective_until')}
              />
            </div>
          </div>

          {/* Review Date */}
          <div className="space-y-1.5">
            <Label htmlFor="review_date">Review Date</Label>
            <Input
              id="review_date"
              type="date"
              {...form.register('review_date')}
            />
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="external_ref">External Ref</Label>
              <Input
                id="external_ref"
                placeholder="Optional"
                {...form.register('external_ref')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jurisdiction">Jurisdiction</Label>
              <Input
                id="jurisdiction"
                placeholder="Optional"
                {...form.register('jurisdiction')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create Exclusion'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
