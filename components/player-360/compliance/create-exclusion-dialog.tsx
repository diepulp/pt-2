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
import { CalendarDays, Link2, MessageSquare, Shield } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useCreateExclusion } from '@/hooks/player/use-exclusions';
import {
  exclusionTypeEnum,
  enforcementEnum,
} from '@/services/player/exclusion-schemas';

// --- Section header ---

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-accent" />
      <h4
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
        style={{ fontFamily: 'monospace' }}
      >
        {label}
      </h4>
    </div>
  );
}

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
    startTransition(async () => {
      try {
        await createMutation.mutateAsync({
          playerId,
          input: {
            exclusion_type: values.exclusion_type,
            enforcement: values.enforcement,
            reason: values.reason,
            effective_from: values.effective_from || undefined,
            effective_until: values.effective_until || null,
            review_date: values.review_date || null,
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
          <DialogTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Add Exclusion
          </DialogTitle>
          <DialogDescription className="text-sm">
            Create a new exclusion record for this player.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
          {/* ── Classification ── */}
          <div className="space-y-3">
            <SectionHeader icon={Shield} label="Classification" />

            <div className="space-y-1.5">
              <Label
                htmlFor="exclusion_type"
                className="text-sm text-muted-foreground"
              >
                Type
              </Label>
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
                <SelectTrigger id="exclusion_type" className="font-mono">
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

            <div className="space-y-1.5">
              <Label
                htmlFor="enforcement"
                className="text-sm text-muted-foreground"
              >
                Enforcement
              </Label>
              <Select
                value={form.watch('enforcement') ?? ''}
                onValueChange={(v) =>
                  form.setValue('enforcement', v as FormValues['enforcement'], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="enforcement" className="font-mono">
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
          </div>

          <Separator />

          {/* ── Details ── */}
          <div className="space-y-3">
            <SectionHeader icon={MessageSquare} label="Details" />

            <div className="space-y-1.5">
              <Label htmlFor="reason" className="text-sm text-muted-foreground">
                Reason
              </Label>
              <Textarea
                id="reason"
                placeholder="Reason for exclusion..."
                {...form.register('reason')}
                rows={3}
                className="font-mono"
              />
              {form.formState.errors.reason && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.reason.message}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* ── Schedule ── */}
          <div className="space-y-3">
            <SectionHeader icon={CalendarDays} label="Schedule" />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="effective_from"
                  className="text-sm text-muted-foreground"
                >
                  Effective From
                </Label>
                <Input
                  id="effective_from"
                  type="date"
                  {...form.register('effective_from')}
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="effective_until"
                  className="text-sm text-muted-foreground"
                >
                  Effective Until
                </Label>
                <Input
                  id="effective_until"
                  type="date"
                  {...form.register('effective_until')}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="review_date"
                className="text-sm text-muted-foreground"
              >
                Review Date
              </Label>
              <Input
                id="review_date"
                type="date"
                {...form.register('review_date')}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <Separator />

          {/* ── References ── */}
          <div className="space-y-3">
            <SectionHeader icon={Link2} label="References" />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="external_ref"
                  className="text-sm text-muted-foreground"
                >
                  External Ref
                  <span className="ml-1 text-xs text-muted-foreground/50">
                    optional
                  </span>
                </Label>
                <Input
                  id="external_ref"
                  placeholder="Optional"
                  {...form.register('external_ref')}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="jurisdiction"
                  className="text-sm text-muted-foreground"
                >
                  Jurisdiction
                  <span className="ml-1 text-xs text-muted-foreground/50">
                    optional
                  </span>
                </Label>
                <Input
                  id="jurisdiction"
                  placeholder="Optional"
                  {...form.register('jurisdiction')}
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          {/* ── Actions ── */}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold uppercase tracking-wider"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 gap-1.5 text-xs font-semibold uppercase tracking-wider"
              disabled={isPending}
            >
              {isPending ? 'Creating...' : 'Create Exclusion'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
