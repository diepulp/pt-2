'use client';

import { useState, useTransition } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useUpdateValuationPolicy } from '@/hooks/loyalty/use-loyalty-mutations';
import { useActiveValuationPolicy } from '@/hooks/loyalty/use-loyalty-queries';
import { useAuth } from '@/hooks/use-auth';
import { useUnsavedChangesPrompt } from '@/hooks/use-unsaved-changes-prompt';

// --- Helpers ---

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    dateStyle: 'medium',
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Component ---

export function ValuationSettingsForm() {
  const { casinoId, staffRole, isLoading: authLoading } = useAuth();
  const {
    data: policy,
    isLoading: policyLoading,
    error: policyError,
  } = useActiveValuationPolicy(casinoId ?? undefined);
  const mutation = useUpdateValuationPolicy(casinoId ?? '');
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  // Form state
  const [centsPerPoint, setCentsPerPoint] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>('');
  const [formTouched, setFormTouched] = useState(false);

  const isAdmin = staffRole === 'admin';
  const isLoading = authLoading || policyLoading;

  // Initialize form from policy when it loads (only if user hasn't edited)
  const displayCents = formTouched
    ? centsPerPoint
    : (policy?.centsPerPoint?.toString() ?? '');
  const displayDate = formTouched
    ? effectiveDate
    : (policy?.effectiveDate ?? '');

  // Dirty check: compare against server values
  const isDirty =
    formTouched &&
    (centsPerPoint !== (policy?.centsPerPoint?.toString() ?? '') ||
      effectiveDate !== (policy?.effectiveDate ?? ''));

  useUnsavedChangesPrompt(isDirty);

  function handleCentsChange(value: string) {
    if (!formTouched) {
      // Initialize both fields from current server state on first edit
      setCentsPerPoint(value);
      setEffectiveDate(policy?.effectiveDate ?? todayISO());
      setFormTouched(true);
    } else {
      setCentsPerPoint(value);
    }
  }

  function handleDateChange(value: string) {
    if (!formTouched) {
      setCentsPerPoint(policy?.centsPerPoint?.toString() ?? '');
      setEffectiveDate(value);
      setFormTouched(true);
    } else {
      setEffectiveDate(value);
    }
  }

  function handleSave() {
    const cents = parseFloat(centsPerPoint);
    if (isNaN(cents) || cents <= 0 || !effectiveDate) return;

    startTransition(async () => {
      await mutation.mutateAsync({
        input: {
          centsPerPoint: cents,
          effectiveDate,
          versionIdentifier: `admin-${todayISO()}`,
        },
        idempotencyKey: `valuation-${casinoId}-${Date.now()}`,
      });
      setFormTouched(false);
      setCentsPerPoint('');
      setEffectiveDate('');
      setShowConfirm(false);
    });
  }

  // --- Loading state ---

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (policyError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          Failed to load valuation policy. Please try again.
        </p>
      </div>
    );
  }

  const parsedCents = parseFloat(displayCents);
  const isValid = !isNaN(parsedCents) && parsedCents > 0 && displayDate !== '';

  return (
    <div className="space-y-6">
      {/* Read-only banner for non-admin */}
      {!isAdmin && (
        <Alert
          variant="default"
          className="border-amber-500/50 bg-amber-500/10"
        >
          <AlertDescription className="text-sm text-amber-700 dark:text-amber-400">
            Valuation policy is read-only for your role. Contact an
            administrator to make changes.
          </AlertDescription>
        </Alert>
      )}

      {/* No policy — system error, not expected onboarding state */}
      {!policy && !policyLoading && (
        <Alert
          variant="default"
          className="border-destructive/50 bg-destructive/10"
        >
          <AlertDescription className="text-sm text-destructive">
            Valuation policy could not be loaded for this casino. This is a
            system configuration error — comp issuance will be blocked until
            resolved.
            {isAdmin
              ? ' Use the form below to set a rate, or contact support.'
              : ' Contact an administrator.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Current policy info */}
      {policy && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            Current rate:{' '}
            <strong>${(policy.centsPerPoint / 100).toFixed(2)}/pt</strong>
          </span>
          <span>Effective: {formatDate(policy.effectiveDate)}</span>
          <span>Last updated: {formatTimestamp(policy.createdAt)}</span>
        </div>
      )}

      {/* Policy form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Point Valuation Rate</CardTitle>
          <p className="text-sm text-muted-foreground">
            The redemption rate used to convert loyalty points to dollar value
            when issuing comps.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cents-per-point">Cents per Point</Label>
              <Input
                id="cents-per-point"
                type="number"
                min={0.01}
                step={0.01}
                placeholder="e.g. 2"
                value={displayCents}
                onChange={(e) => handleCentsChange(e.target.value)}
                disabled={!isAdmin}
              />
              {displayCents && !isNaN(parsedCents) && parsedCents > 0 && (
                <p className="text-xs text-muted-foreground">
                  1 point = ${(parsedCents / 100).toFixed(4)} &middot; $1.00 ={' '}
                  {Math.ceil(100 / parsedCents)} pts
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="effective-date">Effective Date</Label>
              <Input
                id="effective-date"
                type="date"
                value={displayDate}
                onChange={(e) => handleDateChange(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save button — only visible when dirty and valid */}
      {isDirty && isAdmin && (
        <div className="flex justify-end">
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={isPending || !isValid}
          >
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}

      {/* Mutation error */}
      {mutation.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Failed to update valuation policy. Please try again.
          </p>
        </div>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Valuation Rate?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the valuation rate affects all future comp issuances.
              In-flight comp drawers will use the new rate on next open.
              {displayCents && (
                <>
                  <br />
                  <br />
                  New rate:{' '}
                  <strong>${(parsedCents / 100).toFixed(2)}/pt</strong> (1 point
                  = ${(parsedCents / 100).toFixed(4)})
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
