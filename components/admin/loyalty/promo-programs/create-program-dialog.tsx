'use client';

import { useTransition, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useCreatePromoProgram } from '@/hooks/loyalty/promo-instruments/use-promo-mutations';
import type { PromoType } from '@/services/loyalty/promo/dtos';
import { createPromoProgramSchema } from '@/services/loyalty/promo/schemas';

type FormErrors = Partial<Record<string, string>>;

/**
 * Dialog for creating a new promo program.
 * Uses existing createPromoProgramSchema for validation and useCreatePromoProgram for mutation.
 */
export function CreateProgramDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const createProgram = useCreatePromoProgram();

  // Form state
  const [name, setName] = useState('');
  const [promoType, setPromoType] = useState<PromoType>('match_play');
  const [faceValue, setFaceValue] = useState('');
  const [matchWager, setMatchWager] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  function resetForm() {
    setName('');
    setPromoType('match_play');
    setFaceValue('');
    setMatchWager('');
    setStartAt('');
    setEndAt('');
    setErrors({});
    setSubmitError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);

    // Build input for validation
    const raw = {
      name: name.trim(),
      promoType,
      faceValueAmount: parseFloat(faceValue),
      requiredMatchWagerAmount: parseFloat(matchWager),
      ...(startAt ? { startAt: new Date(startAt).toISOString() } : {}),
      ...(endAt ? { endAt: new Date(endAt).toISOString() } : {}),
    };

    // Validate with Zod schema
    const result = createPromoProgramSchema.safeParse(raw);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString();
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    startTransition(async () => {
      try {
        await createProgram.mutateAsync({
          ...result.data,
          casinoId: '', // Injected server-side via RLS context
          idempotencyKey: `create-program-${Date.now()}`,
        });
        setOpen(false);
        resetForm();
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : 'Failed to create program',
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="add-program-button">Add Program</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Promo Program</DialogTitle>
          <DialogDescription>
            Define a new promotional instrument program. Coupons can be issued
            after the program is created.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Program Name */}
          <div className="space-y-1.5">
            <Label htmlFor="program-name">Program Name</Label>
            <Input
              id="program-name"
              data-testid="program-name-input"
              placeholder="e.g., Weekend Match Play $25"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
              disabled={isPending}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Promo Type */}
          <div className="space-y-1.5">
            <Label htmlFor="promo-type">Promo Type</Label>
            <Select
              value={promoType}
              onValueChange={(v) => setPromoType(v as PromoType)}
              disabled={isPending}
            >
              <SelectTrigger id="promo-type" data-testid="promo-type-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="match_play">Match Play</SelectItem>
                <SelectItem value="free_play">Free Play</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Face Value + Match Wager (side by side) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="face-value">Face Value ($)</Label>
              <Input
                id="face-value"
                data-testid="face-value-input"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="25.00"
                value={faceValue}
                onChange={(e) => setFaceValue(e.target.value)}
                aria-invalid={!!errors.faceValueAmount}
                disabled={isPending}
              />
              {errors.faceValueAmount && (
                <p className="text-sm text-destructive">
                  {errors.faceValueAmount}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="match-wager">Required Match Wager ($)</Label>
              <Input
                id="match-wager"
                data-testid="match-wager-input"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="25.00"
                value={matchWager}
                onChange={(e) => setMatchWager(e.target.value)}
                aria-invalid={!!errors.requiredMatchWagerAmount}
                disabled={isPending}
              />
              {errors.requiredMatchWagerAmount && (
                <p className="text-sm text-destructive">
                  {errors.requiredMatchWagerAmount}
                </p>
              )}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="start-at">Start Date (optional)</Label>
              <Input
                id="start-at"
                data-testid="start-at-input"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-at">End Date (optional)</Label>
              <Input
                id="end-at"
                data-testid="end-at-input"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Submit Error */}
          {submitError && (
            <p
              className="text-sm text-destructive"
              data-testid="create-program-error"
            >
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              data-testid="create-program-submit"
            >
              {isPending ? 'Creating...' : 'Create Program'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
