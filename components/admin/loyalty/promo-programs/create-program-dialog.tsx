'use client';

import { AlertCircle, CalendarDays, DollarSign, Plus, Tag } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { useCreatePromoProgram } from '@/hooks/loyalty/promo-instruments/use-promo-mutations';
import type { PromoType } from '@/services/loyalty/promo/dtos';
import { createPromoProgramSchema } from '@/services/loyalty/promo/schemas';

type FormErrors = Partial<Record<string, string>>;

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

// --- Promo type toggle cards ---

function PromoTypeToggle({
  value,
  onChange,
  disabled,
}: {
  value: PromoType;
  onChange: (v: PromoType) => void;
  disabled: boolean;
}) {
  const options: { type: PromoType; label: string; desc: string }[] = [
    {
      type: 'match_play',
      label: 'Match Play',
      desc: 'Patron wagers to activate',
    },
    { type: 'free_play', label: 'Free Play', desc: 'No wager required' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((opt) => {
        const isActive = value === opt.type;
        return (
          <button
            key={opt.type}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.type)}
            className={`rounded-lg border-2 px-3 py-2.5 text-left transition-all duration-150 ${
              isActive
                ? 'border-accent/50 bg-accent/5'
                : 'border-border/50 bg-card/30 hover:border-accent/30'
            } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
          >
            <div className="flex items-center gap-2">
              {isActive && (
                <div className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(0,188,212,0.5)]" />
              )}
              <span
                className={`text-xs font-bold uppercase tracking-widest ${isActive ? 'text-accent' : 'text-muted-foreground'}`}
                style={{ fontFamily: 'monospace' }}
              >
                {opt.label}
              </span>
            </div>
            <p
              className={`mt-1 text-xs ${isActive ? 'text-foreground/70' : 'text-muted-foreground/60'}`}
            >
              {opt.desc}
            </p>
          </button>
        );
      })}
    </div>
  );
}

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
  const isFreePlay = promoType === 'free_play';
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
    if (!nextOpen) resetForm();
  }

  function handlePromoTypeChange(next: PromoType) {
    setPromoType(next);
    if (next === 'free_play') setMatchWager('0');
    else if (matchWager === '0') setMatchWager('');
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);

    const raw = {
      name: name.trim(),
      promoType,
      faceValueAmount: parseFloat(faceValue),
      requiredMatchWagerAmount: isFreePlay ? 0 : parseFloat(matchWager),
      ...(startAt ? { startAt: new Date(startAt).toISOString() } : {}),
      ...(endAt ? { endAt: new Date(endAt).toISOString() } : {}),
    };

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
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs font-semibold uppercase tracking-wider"
          data-testid="add-program-button"
        >
          <Plus className="h-3 w-3" />
          New Program
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Create Promo Program
          </DialogTitle>
          <DialogDescription className="text-sm">
            Define a new promotional instrument program. Coupons can be issued
            after the program is created.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── Program Identity ── */}
          <div className="space-y-3">
            <SectionHeader icon={Tag} label="Program Identity" />

            <div className="space-y-1.5">
              <Label
                htmlFor="program-name"
                className="text-sm text-muted-foreground"
              >
                Name
              </Label>
              <Input
                id="program-name"
                data-testid="program-name-input"
                placeholder="e.g., Weekend Match Play $25"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name}
                disabled={isPending}
                className="font-mono"
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Type</Label>
              <PromoTypeToggle
                value={promoType}
                onChange={handlePromoTypeChange}
                disabled={isPending}
              />
            </div>
          </div>

          <Separator />

          {/* ── Financials ── */}
          <div className="space-y-3">
            <SectionHeader icon={DollarSign} label="Financials" />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="face-value"
                  className="text-sm text-muted-foreground"
                >
                  Face Value ($)
                </Label>
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
                  className="font-mono tabular-nums"
                />
                {errors.faceValueAmount && (
                  <p className="text-xs text-destructive">
                    {errors.faceValueAmount}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="match-wager"
                  className={`text-sm ${isFreePlay ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}
                >
                  Match Wager ($)
                </Label>
                <Input
                  id="match-wager"
                  data-testid="match-wager-input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={isFreePlay ? '0.00' : '25.00'}
                  value={matchWager}
                  onChange={(e) => setMatchWager(e.target.value)}
                  aria-invalid={!!errors.requiredMatchWagerAmount}
                  disabled={isPending || isFreePlay}
                  className={`font-mono tabular-nums ${isFreePlay ? 'opacity-40' : ''}`}
                />
                {isFreePlay && (
                  <p className="text-[11px] text-muted-foreground/60">
                    Not applicable for free play.
                  </p>
                )}
                {errors.requiredMatchWagerAmount && (
                  <p className="text-xs text-destructive">
                    {errors.requiredMatchWagerAmount}
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Schedule ── */}
          <div className="space-y-3">
            <SectionHeader icon={CalendarDays} label="Schedule" />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="start-at"
                  className="text-sm text-muted-foreground"
                >
                  Start Date
                  <span className="ml-1 text-xs text-muted-foreground/50">
                    optional
                  </span>
                </Label>
                <Input
                  id="start-at"
                  data-testid="start-at-input"
                  type="date"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  disabled={isPending}
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="end-at"
                  className="text-sm text-muted-foreground"
                >
                  End Date
                  <span className="ml-1 text-xs text-muted-foreground/50">
                    optional
                  </span>
                </Label>
                <Input
                  id="end-at"
                  data-testid="end-at-input"
                  type="date"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  disabled={isPending}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* ── Error Banner ── */}
          {submitError && (
            <div
              className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5"
              data-testid="create-program-error"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <p className="min-w-0 break-words text-xs text-destructive">
                {submitError}
              </p>
            </div>
          )}

          {/* ── Actions ── */}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold uppercase tracking-wider"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 gap-1.5 text-xs font-semibold uppercase tracking-wider"
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
