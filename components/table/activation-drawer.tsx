/**
 * Activation Drawer — OPEN → ACTIVE Custody Gate
 *
 * Right-side sheet for pit bosses to activate an OPEN table session.
 * Displays predecessor provenance chain or par bootstrap warning,
 * collects opening total, dealer confirmation, and optional note.
 *
 * Key-based reset on reopen ensures clean form state.
 *
 * @see PRD-059 Table Lifecycle Recovery
 * @see ADR-048 Open Table Custody Gate
 * @see components/ui/sheet.tsx — shadcn Sheet
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Link2, ShieldAlert } from 'lucide-react';
import { useState, useTransition, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useActivateTableSession } from '@/hooks/table-context/use-activate-table-session';
import { useCloseTableSession } from '@/hooks/table-context/use-table-session';
import { toast } from '@/hooks/ui';
import {
  getErrorMessage,
  isFetchError,
  logError,
} from '@/lib/errors/error-utils';
import { createBrowserComponentClient } from '@/lib/supabase/client';
import type { TableSessionDTO } from '@/services/table-context/dtos';

// === Types ===

export interface ActivationDrawerProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** The OPEN session to activate */
  session: TableSessionDTO;
  /** Gaming table UUID */
  tableId: string;
  /** Callback after successful activation */
  onActivated?: () => void;
  /** Callback after successful cancellation */
  onCancelled?: () => void;
}

// === Helpers ===

/** Format cents to dollar display */
function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Parse dollar string to cents */
function dollarsToCents(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

// === Component ===

function ActivationDrawerContent({
  session,
  tableId,
  onOpenChange,
  onActivated,
  onCancelled,
}: Omit<ActivationDrawerProps, 'open'>) {
  // --- Predecessor provenance ---
  const hasPredecessor = session.predecessor_session_id !== null;
  const snapshotId = session.opening_inventory_snapshot_id;

  // Fetch the predecessor close total from the linked inventory snapshot.
  // The snapshot's total_cents is the authoritative predecessor close amount —
  // session.need_total_cents is a bank-mode column unrelated to predecessor close.
  const { data: snapshotData } = useQuery({
    queryKey: ['snapshot-close-total', snapshotId],
    queryFn: async () => {
      const supabase = createBrowserComponentClient();
      const { data } = await supabase
        .from('table_inventory_snapshot')
        .select('total_cents')
        .eq('id', snapshotId!)
        .single();
      return data;
    },
    enabled: !!snapshotId,
    staleTime: Infinity, // Snapshot is immutable once written
  });

  const predecessorCloseTotalCents = snapshotData?.total_cents ?? null;

  // Fetch requires_reconciliation from the predecessor session
  const { data: predecessorData } = useQuery({
    queryKey: ['predecessor-recon', session.predecessor_session_id],
    queryFn: async () => {
      const supabase = createBrowserComponentClient();
      const { data } = await supabase
        .from('table_session')
        .select('requires_reconciliation')
        .eq('id', session.predecessor_session_id!)
        .single();
      return data;
    },
    enabled: !!session.predecessor_session_id,
    staleTime: Infinity,
  });

  const requiresReconciliation =
    predecessorData?.requires_reconciliation ?? false;

  // --- Form state ---
  const defaultDollars =
    predecessorCloseTotalCents !== null
      ? (predecessorCloseTotalCents / 100).toFixed(2)
      : '';

  const [openingDollars, setOpeningDollars] = useState(defaultDollars);
  const [dealerConfirmed, setDealerConfirmed] = useState(false);
  const [note, setNote] = useState('');

  // --- Derived state ---
  const openingCents = useMemo(
    () => dollarsToCents(openingDollars),
    [openingDollars],
  );

  const hasVariance =
    hasPredecessor &&
    predecessorCloseTotalCents !== null &&
    openingCents !== predecessorCloseTotalCents &&
    openingDollars !== '';

  // ADR-048: Three conditions — not two.
  // Condition A: predecessor with valid close snapshot → show close total
  // Condition B (absent): no predecessor → par bootstrap
  // Condition B (broken): predecessor exists but snapshot missing → par bootstrap + broken chain warning
  const hasValidPredecessor =
    hasPredecessor && predecessorCloseTotalCents !== null;
  const isBrokenPredecessor =
    hasPredecessor && predecessorCloseTotalCents === null;
  const isBootstrap = !hasPredecessor || isBrokenPredecessor;
  const hasWarning = isBootstrap || hasVariance || requiresReconciliation;
  const noteRequired = hasWarning;

  const canActivate =
    dealerConfirmed &&
    openingDollars !== '' &&
    openingCents >= 0 &&
    (!noteRequired || note.trim().length > 0);

  // --- Mutations ---
  const activateMutation = useActivateTableSession(session.id, tableId);
  const cancelMutation = useCloseTableSession(session.id, tableId);

  const [isActivating, startActivateTransition] = useTransition();
  const [isCancelling, startCancelTransition] = useTransition();

  const handleActivate = () => {
    startActivateTransition(async () => {
      try {
        await activateMutation.mutateAsync({
          opening_total_cents: openingCents,
          dealer_confirmed: true,
          opening_note: note.trim() || null,
        });
        toast.success('Table activated for play');
        onOpenChange(false);
        onActivated?.();
      } catch (error) {
        toast.error('Activation failed', {
          description: getErrorMessage(error),
        });
        if (!isFetchError(error) || error.status >= 500) {
          logError(error, {
            component: 'ActivationDrawer',
            action: 'activate',
          });
        }
      }
    });
  };

  const handleCancel = () => {
    startCancelTransition(async () => {
      try {
        await cancelMutation.mutateAsync({
          close_reason: 'cancelled',
        });
        toast.success('Table opening cancelled');
        onOpenChange(false);
        onCancelled?.();
      } catch (error) {
        toast.error('Cancellation failed', {
          description: getErrorMessage(error),
        });
        if (!isFetchError(error) || error.status >= 500) {
          logError(error, {
            component: 'ActivationDrawer',
            action: 'cancel',
          });
        }
      }
    });
  };

  const isPending = isActivating || isCancelling;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <SheetHeader className="border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="border-blue-500/30 bg-blue-500/10 text-blue-400"
          >
            Open
          </Badge>
          <SheetTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Activate Table
          </SheetTitle>
        </div>
        <SheetDescription className="text-xs text-muted-foreground">
          Complete the custody gate to transition this table to active play.
        </SheetDescription>
      </SheetHeader>

      {/* Content */}
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {/* Provenance Section — ADR-048 three conditions */}
        {hasValidPredecessor ? (
          /* Condition A: predecessor with valid close snapshot */
          <div className="rounded-lg border-2 border-accent/30 bg-accent/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="h-4 w-4 text-accent" />
              <span
                className="text-xs font-bold uppercase tracking-widest text-accent"
                style={{ fontFamily: 'monospace' }}
              >
                Predecessor Close
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className="text-2xl font-bold tabular-nums text-foreground"
                style={{
                  fontFamily: 'monospace',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ${formatCents(predecessorCloseTotalCents!)}
              </span>
              <span className="text-xs text-muted-foreground">
                closing total
              </span>
            </div>
          </div>
        ) : isBrokenPredecessor ? (
          /* Condition B (broken): predecessor exists but closing snapshot missing */
          <div className="rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <span
                  className="text-xs font-bold uppercase tracking-widest text-amber-500"
                  style={{ fontFamily: 'monospace' }}
                >
                  Broken Custody Chain
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Predecessor session exists but closed without an inventory
                  snapshot. No closing total available for comparison. Enter
                  opening total manually and provide a note.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Condition B (absent): no predecessor session at all */
          <div className="rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <span
                  className="text-xs font-bold uppercase tracking-widest text-amber-500"
                  style={{ fontFamily: 'monospace' }}
                >
                  Par Bootstrap
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  No predecessor session found. Opening total will be recorded
                  as a par bootstrap with no custody chain.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Reconciliation Warning */}
        {requiresReconciliation && (
          <div className="rounded-lg border-2 border-red-500/30 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <span
                  className="text-xs font-bold uppercase tracking-widest text-red-500"
                  style={{ fontFamily: 'monospace' }}
                >
                  Reconciliation Required
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  The predecessor session was flagged for reconciliation. A note
                  is required to document the opening attestation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Opening Total Input */}
        <div className="space-y-2">
          <Label
            htmlFor="opening-total"
            className="text-xs font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Opening Total ($)
          </Label>
          <Input
            id="opening-total"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={openingDollars}
            onChange={(e) => setOpeningDollars(e.target.value)}
            disabled={isPending}
            className="font-mono tabular-nums"
          />
          {predecessorCloseTotalCents !== null && openingDollars !== '' && (
            <p className="text-xs text-muted-foreground">
              = {openingCents.toLocaleString()} cents
            </p>
          )}
        </div>

        {/* Variance Warning */}
        {hasVariance && (
          <div className="rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <span
                  className="text-xs font-bold uppercase tracking-widest text-amber-500"
                  style={{ fontFamily: 'monospace' }}
                >
                  Variance Detected
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Opening total (${formatCents(openingCents)}) differs from
                  predecessor close ($
                  {formatCents(predecessorCloseTotalCents!)}). A note is
                  required to explain the discrepancy.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Dealer Confirmation */}
        <div className="flex items-start gap-3 rounded-lg border-2 border-border/50 p-4">
          <Checkbox
            id="dealer-confirmed"
            checked={dealerConfirmed}
            onCheckedChange={(checked) => setDealerConfirmed(checked === true)}
            disabled={isPending}
          />
          <div className="space-y-1">
            <Label
              htmlFor="dealer-confirmed"
              className="text-xs font-bold uppercase tracking-widest cursor-pointer"
              style={{ fontFamily: 'monospace' }}
            >
              Dealer Confirmation
            </Label>
            <p className="text-xs text-muted-foreground">
              Dealer has confirmed the chip count matches the opening total.
            </p>
          </div>
        </div>

        {/* Note Field */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label
              htmlFor="opening-note"
              className="text-xs font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Opening Note
            </Label>
            {noteRequired && (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px]"
              >
                Required
              </Badge>
            )}
          </div>
          <Textarea
            id="opening-note"
            placeholder={
              noteRequired
                ? 'Explain the variance, bootstrap, or reconciliation context...'
                : 'Optional note for this opening attestation...'
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isPending}
            rows={3}
            className="resize-none"
          />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-t border-border/50 px-6 py-4 space-y-3">
        <Button
          onClick={handleActivate}
          disabled={!canActivate || isPending}
          className="w-full gap-2 text-xs font-semibold uppercase tracking-wider"
        >
          {isActivating ? (
            'Activating...'
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Activate Table for Play
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={isPending}
          className="w-full gap-2 text-xs font-semibold uppercase tracking-wider text-destructive hover:text-destructive"
        >
          {isCancelling ? 'Cancelling...' : 'Cancel Opening'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Activation Drawer — OPEN → ACTIVE Custody Gate
 *
 * Non-dismissible: the pit boss must either activate or cancel.
 * Outside clicks and Escape key are blocked. The cancel button
 * inside the drawer is the only exit path.
 *
 * Uses key-based reset pattern: content remounts with fresh state on reopen.
 */
export function ActivationDrawer({
  open,
  onOpenChange,
  session,
  tableId,
  onActivated,
  onCancelled,
}: ActivationDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-md [&>button:last-child]:hidden"
        key={open ? 'open' : 'closed'}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <ActivationDrawerContent
          session={session}
          tableId={tableId}
          onOpenChange={onOpenChange}
          onActivated={onActivated}
          onCancelled={onCancelled}
        />
      </SheetContent>
    </Sheet>
  );
}
