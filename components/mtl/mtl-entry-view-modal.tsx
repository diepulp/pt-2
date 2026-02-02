/**
 * MTL Entry View Modal Component
 *
 * Read-only modal for viewing MTL entries for a patron on a gaming day.
 * Displays transaction log with running totals and threshold indicators.
 * Provides Print and Adjust actions for compliance workflows.
 *
 * This component replaces the editable MtlEntryForm in the Compliance Dashboard.
 * Financial-type MTL entries (buy_in, cash_out) can only be created via the
 * forward bridge from player_financial_transaction.
 *
 * @see PRD-MTL-VIEW-MODAL-KILL-REVERSE-BRIDGE
 * @see components/mtl/mtl-entry-form.tsx - Original editable form (preserved for future use)
 */

'use client';

import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Edit3,
  Printer,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMtlEntries } from '@/hooks/mtl/use-mtl-entries';
import { formatCents } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MtlDirection, MtlEntryDTO } from '@/services/mtl/dtos';

// ============================================================================
// Types
// ============================================================================

export interface MtlEntryViewModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Patron data for display */
  patron: {
    id: string;
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
  };
  /** Casino ID for data fetching */
  casinoId: string;
  /** Gaming day in YYYY-MM-DD format */
  gamingDay: string;
  /** Callback when Adjust button is clicked for an entry */
  onAdjust?: (entry: MtlEntryDTO) => void;
}

type ThresholdState = 'none' | 'approaching' | 'crossed';

// ============================================================================
// Constants
// ============================================================================

// All amounts in CENTS per ISSUE-FB8EB717 standardization
const MTL_THRESHOLD_AMOUNT = 300000; // $3,000 MTL threshold in CENTS
const APPROACHING_PCT = 0.9;
const APPROACHING_AMOUNT = MTL_THRESHOLD_AMOUNT * APPROACHING_PCT; // $2,700 in CENTS

// ============================================================================
// Utility Functions
// ============================================================================

function getThresholdState(total: number): ThresholdState {
  if (total >= MTL_THRESHOLD_AMOUNT) return 'crossed';
  if (total >= APPROACHING_AMOUNT) return 'approaching';
  return 'none';
}

// ============================================================================
// Sub-Components
// ============================================================================

function ThresholdBadge({ state }: { state: ThresholdState }) {
  if (state === 'none') return null;

  const isCrossed = state === 'crossed';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        'animate-in fade-in-0 slide-in-from-right-2 duration-300',
        isCrossed
          ? 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 ring-1 ring-red-500/20'
          : 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 ring-1 ring-amber-500/20',
      )}
    >
      {isCrossed ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <AlertTriangle className="w-3 h-3" />
      )}
      {isCrossed ? 'MTL CROSSED' : 'APPROACHING'}
    </div>
  );
}

function RunningTotalDisplay({
  label,
  total,
  direction,
}: {
  label: string;
  total: number;
  direction: MtlDirection;
}) {
  const state = getThresholdState(total);
  const percentage = Math.min((total / MTL_THRESHOLD_AMOUNT) * 100, 100);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm dark:shadow-lg dark:shadow-black/20 dark:border-border/50 dark:bg-card/80 print:shadow-none print:border-gray-300">
      <div
        className={cn(
          'absolute inset-0 opacity-10 transition-all duration-500 print:hidden',
          state === 'crossed'
            ? 'bg-red-500'
            : state === 'approaching'
              ? 'bg-amber-500'
              : direction === 'in'
                ? 'bg-emerald-500'
                : 'bg-blue-500',
        )}
        style={{ width: `${percentage}%` }}
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {direction === 'in' ? (
              <ArrowDownLeft className="w-4 h-4 text-emerald-500 print:text-gray-600" />
            ) : (
              <ArrowUpRight className="w-4 h-4 text-blue-500 print:text-gray-600" />
            )}
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
          </div>
          <ThresholdBadge state={state} />
        </div>

        <div
          className={cn(
            'font-mono text-2xl font-bold tabular-nums',
            state === 'crossed'
              ? 'text-red-600 dark:text-red-400 print:text-red-700'
              : state === 'approaching'
                ? 'text-amber-600 dark:text-amber-400 print:text-amber-700'
                : 'text-foreground',
          )}
        >
          {formatCents(total)}
        </div>

        <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden print:bg-gray-200">
          <div
            className={cn(
              'h-full transition-all duration-500 rounded-full',
              state === 'crossed'
                ? 'bg-red-500'
                : state === 'approaching'
                  ? 'bg-amber-500'
                  : direction === 'in'
                    ? 'bg-emerald-500'
                    : 'bg-blue-500',
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="mt-1 flex justify-between text-xs text-muted-foreground font-mono">
          <span>$0</span>
          <span className={cn(state === 'approaching' && 'text-amber-500')}>
            {formatCents(APPROACHING_AMOUNT)}
          </span>
          <span className={cn(state === 'crossed' && 'text-red-500')}>
            {formatCents(MTL_THRESHOLD_AMOUNT)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TransactionLogTable({
  entries,
  onAdjust,
}: {
  entries: MtlEntryDTO[];
  onAdjust?: (entry: MtlEntryDTO) => void;
}) {
  // Calculate running totals
  let runningCashIn = 0;
  let runningCashOut = 0;

  const entriesWithTotals = entries.map((entry) => {
    if (entry.direction === 'in') {
      runningCashIn += entry.amount;
    } else {
      runningCashOut += entry.amount;
    }
    return {
      ...entry,
      runningCashIn,
      runningCashOut,
    };
  });

  if (entries.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg p-8 text-center dark:border-border/50 dark:bg-secondary/10 print:border-gray-300">
        <div className="text-muted-foreground text-sm">
          No transactions recorded for this gaming day
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden shadow-sm dark:shadow-lg dark:shadow-black/20 dark:border-border/50 print:shadow-none print:border-gray-300">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30 dark:bg-secondary/50 print:bg-gray-100">
            <TableHead className="w-24">Time</TableHead>
            <TableHead className="w-24">Location</TableHead>
            <TableHead className="w-32">Type</TableHead>
            <TableHead className="w-28 text-right">Amount</TableHead>
            <TableHead className="w-32 text-right">
              <span className="inline-flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-emerald-500 print:text-gray-600" />
                Cash-In
              </span>
            </TableHead>
            <TableHead className="w-32 text-right">
              <span className="inline-flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-blue-500 print:text-gray-600" />
                Cash-Out
              </span>
            </TableHead>
            {onAdjust && (
              <TableHead className="w-20 text-center print:hidden">
                Action
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {entriesWithTotals.map((entry) => {
            const cashInState = getThresholdState(entry.runningCashIn);
            const cashOutState = getThresholdState(entry.runningCashOut);

            return (
              <TableRow key={entry.id} className="group transition-colors">
                <TableCell className="font-mono text-sm">
                  {format(new Date(entry.occurred_at), 'HH:mm')}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {entry.area || '—'}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded',
                      entry.direction === 'in'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 print:bg-emerald-50 print:text-emerald-700'
                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 print:bg-blue-50 print:text-blue-700',
                    )}
                  >
                    {entry.direction === 'in' ? (
                      <ArrowDownLeft className="w-3 h-3" />
                    ) : (
                      <ArrowUpRight className="w-3 h-3" />
                    )}
                    {entry.direction === 'in' ? 'Buy-In' : 'Cash-Out'}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatCents(entry.amount)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-mono font-medium tabular-nums',
                    cashInState === 'crossed' &&
                      'text-red-600 dark:text-red-400 print:text-red-700',
                    cashInState === 'approaching' &&
                      'text-amber-600 dark:text-amber-400 print:text-amber-700',
                  )}
                >
                  {formatCents(entry.runningCashIn)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-mono font-medium tabular-nums',
                    cashOutState === 'crossed' &&
                      'text-red-600 dark:text-red-400 print:text-red-700',
                    cashOutState === 'approaching' &&
                      'text-amber-600 dark:text-amber-400 print:text-amber-700',
                  )}
                >
                  {formatCents(entry.runningCashOut)}
                </TableCell>
                {onAdjust && (
                  <TableCell className="text-center print:hidden">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAdjust(entry)}
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Adjust this entry"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="bg-muted/50 dark:bg-secondary/60 print:bg-gray-100">
            <TableCell
              colSpan={4}
              className="text-right font-medium text-muted-foreground"
            >
              Running Totals
            </TableCell>
            <TableCell
              className={cn(
                'text-right font-mono font-bold tabular-nums',
                getThresholdState(runningCashIn) === 'crossed' &&
                  'text-red-600 dark:text-red-400 print:text-red-700',
                getThresholdState(runningCashIn) === 'approaching' &&
                  'text-amber-600 dark:text-amber-400 print:text-amber-700',
              )}
            >
              {formatCents(runningCashIn)}
            </TableCell>
            <TableCell
              className={cn(
                'text-right font-mono font-bold tabular-nums',
                getThresholdState(runningCashOut) === 'crossed' &&
                  'text-red-600 dark:text-red-400 print:text-red-700',
                getThresholdState(runningCashOut) === 'approaching' &&
                  'text-amber-600 dark:text-amber-400 print:text-amber-700',
              )}
            >
              {formatCents(runningCashOut)}
            </TableCell>
            {onAdjust && <TableCell className="print:hidden" />}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * MTL Entry View Modal
 *
 * Read-only modal for viewing MTL entries with Print and Adjust actions.
 * Financial entries are derived from player_financial_transaction only.
 *
 * @example
 * ```tsx
 * <MtlEntryViewModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   patron={{ id: playerId, firstName: "John", lastName: "Smith" }}
 *   casinoId={casinoId}
 *   gamingDay="2026-01-20"
 *   onAdjust={(entry) => openAdjustmentModal(entry)}
 * />
 * ```
 */
export function MtlEntryViewModal({
  isOpen,
  onClose,
  patron,
  casinoId,
  gamingDay,
  onAdjust,
}: MtlEntryViewModalProps) {
  // Fetch entries for this patron on this gaming day
  const { data: entriesData, isLoading } = useMtlEntries({
    casinoId,
    patronId: patron.id,
    gamingDay,
  });

  const entries = useMemo(() => entriesData?.items ?? [], [entriesData?.items]);

  // Calculate totals
  const totals = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        if (entry.direction === 'in') {
          acc.cashIn += entry.amount;
        } else {
          acc.cashOut += entry.amount;
        }
        return acc;
      },
      { cashIn: 0, cashOut: 0 },
    );
  }, [entries]);

  const patronName =
    patron.firstName && patron.lastName
      ? `${patron.firstName} ${patron.lastName}`
      : 'Unknown Player';

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible print:shadow-none print:border-none">
        {/* Print-only header */}
        <div className="hidden print:block mb-6 pb-4 border-b-2 border-gray-300">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Multiple Transaction Log</h1>
              <p className="text-sm text-gray-600">
                31 CFR § 1021.311 Compliance Record
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Gaming Day: {gamingDay}</p>
              <p className="text-xs text-gray-500">
                Printed: {format(new Date(), 'MMM d, yyyy HH:mm')}
              </p>
            </div>
          </div>
        </div>

        {/* Screen header */}
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5" />
                MTL Entry View
              </DialogTitle>
              <DialogDescription>
                Read-only view of Multiple Transaction Log entries for{' '}
                {gamingDay}
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5"
            >
              <Printer className="w-4 h-4 m-3" />
              Print
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4 print:mt-0">
          {/* Patron Info */}
          <div className="p-4 rounded-lg border bg-muted/30 print:bg-gray-50 print:border-gray-300">
            <div className="flex items-center gap-2 mb-3 print:hidden">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Patron Information
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground print:text-gray-500">
                  Patron:
                </span>
                <p className="font-medium">{patronName}</p>
              </div>
              <div>
                <span className="text-muted-foreground print:text-gray-500">
                  Account:
                </span>
                <p className="font-mono">{patron.id.slice(0, 8)}...</p>
              </div>
              {patron.dateOfBirth && (
                <div>
                  <span className="text-muted-foreground print:text-gray-500">
                    DOB:
                  </span>
                  <p>{format(new Date(patron.dateOfBirth), 'MM/dd/yyyy')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Running Totals */}
          <div className="grid grid-cols-2 gap-4">
            <RunningTotalDisplay
              label="Total Cash-In"
              total={totals.cashIn}
              direction="in"
            />
            <RunningTotalDisplay
              label="Total Cash-Out"
              total={totals.cashOut}
              direction="out"
            />
          </div>

          {/* Transaction Log */}
          <div className="space-y-3">
            <div className="flex items-center justify-between print:hidden">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Transaction Log
              </h3>
              <span className="text-xs text-muted-foreground">
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            <div className="hidden print:block mb-2">
              <h3 className="text-sm font-medium uppercase tracking-wider">
                Transaction Log ({entries.length}{' '}
                {entries.length === 1 ? 'entry' : 'entries'})
              </h3>
            </div>

            {isLoading ? (
              <div className="border border-dashed border-border rounded-lg p-8 text-center">
                <div className="text-muted-foreground text-sm">
                  Loading transactions...
                </div>
              </div>
            ) : (
              <TransactionLogTable entries={entries} onAdjust={onAdjust} />
            )}
          </div>

          {/* Gaming Day Display */}
          <div className="text-xs text-muted-foreground border-t pt-4 print:border-gray-300">
            <div className="flex items-center justify-between">
              <span>
                Gaming Day: <span className="font-mono">{gamingDay}</span>
              </span>
              <span className="print:hidden">
                Entries are read-only. Financial adjustments create audit
                records.
              </span>
            </div>
          </div>

          {/* Print footer */}
          <div className="hidden print:block mt-8 pt-4 border-t border-gray-300">
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                This document is an official compliance record per 31 CFR §
                1021.311
              </span>
              <span>Page 1 of 1</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
