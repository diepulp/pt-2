/**
 * MTL Entry Form Component (Simplified)
 *
 * Simplified MTL entry form with 2 transaction types (buy-in, cash-out).
 * Features visual progress bars showing threshold proximity ($3k MTL).
 * Uses optimistic updates with useOptimistic for responsive UX.
 *
 * All 12 official paper form codes are retained in mtl-txn-type-codes.ts
 * for future regulatory/audit needs.
 *
 * @see GAP-MTL-UI-TERMINOLOGY
 * @see components/mtl/mtl-txn-type-codes.ts - Full code definitions
 */

'use client';

import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  User,
} from 'lucide-react';
import {
  useCallback,
  useId,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useCreateMtlEntry } from '@/hooks/mtl/use-mtl-mutations';
import { cn } from '@/lib/utils';
import type { MtlDirection, MtlEntryDTO } from '@/services/mtl/dtos';

import {
  DISPLAYED_TRANSACTION_TYPES,
  type DisplayedTransactionType,
} from './mtl-txn-type-codes';

// ============================================================================
// Types
// ============================================================================

/**
 * Patron data for auto-population
 */
export interface PatronData {
  id: string;
  firstName?: string;
  lastName?: string;
  loyaltyCardNumber?: string;
  dateOfBirth?: string;
}

/**
 * Component props
 */
export interface MtlEntryFormProps {
  casinoId: string;
  staffId: string;
  patron?: PatronData;
  visitId?: string;
  ratingSlipId?: string;
  gamingDay: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
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

/**
 * Format currency for display
 * @param amountCents - Amount in CENTS (from database, per ISSUE-FB8EB717)
 * @returns Formatted currency string in dollars
 */
function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountCents / 100); // Convert cents to dollars for display
}

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
    <div className="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm dark:shadow-lg dark:shadow-black/20 dark:border-border/50 dark:bg-card/80">
      <div
        className={cn(
          'absolute inset-0 opacity-10 transition-all duration-500',
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
              <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
            ) : (
              <ArrowUpRight className="w-4 h-4 text-blue-500" />
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
              ? 'text-red-600 dark:text-red-400'
              : state === 'approaching'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-foreground',
          )}
        >
          {formatCurrency(total)}
        </div>

        <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
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
            ${(APPROACHING_AMOUNT / 100).toLocaleString()}
          </span>
          <span className={cn(state === 'crossed' && 'text-red-500')}>
            ${(MTL_THRESHOLD_AMOUNT / 100).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function PhysicalCharacteristicsSection({
  characteristics,
  onChange,
}: {
  characteristics: Record<string, string>;
  onChange: (chars: Record<string, string>) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const fields = [
    { key: 'sex', label: 'Sex', placeholder: 'M/F' },
    { key: 'race', label: 'Race', placeholder: 'e.g., Caucasian' },
    { key: 'build', label: 'Build', placeholder: 'e.g., Medium' },
    { key: 'age', label: 'Age', placeholder: 'e.g., 40-50' },
    { key: 'hair', label: 'Hair', placeholder: 'e.g., Brown' },
    { key: 'height', label: 'Height', placeholder: 'e.g., 5\'10"' },
  ] as const;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full flex items-center justify-between px-4 py-3 rounded-lg',
            'border border-border bg-card/50 hover:bg-card transition-colors',
            'text-sm font-medium text-muted-foreground hover:text-foreground',
            'shadow-sm dark:shadow-md dark:shadow-black/10 dark:border-border/50 dark:bg-secondary/30',
          )}
        >
          <span className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px]">
              ID
            </span>
            Physical Characteristics (Optional)
          </span>
          <ChevronDown
            className={cn(
              'w-4 h-4 transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-up-2 data-[state=open]:slide-down-2 duration-200">
        <div className="pt-4 grid grid-cols-6 gap-3">
          {fields.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label
                htmlFor={`char-${key}`}
                className="text-xs text-muted-foreground"
              >
                {label}
              </Label>
              <Input
                id={`char-${key}`}
                value={characteristics[key] || ''}
                onChange={(e) =>
                  onChange({ ...characteristics, [key]: e.target.value })
                }
                placeholder={placeholder}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TransactionEntryForm({
  onSubmit,
  isPending,
}: {
  onSubmit: (data: {
    amount: number;
    transType: DisplayedTransactionType;
    location: string;
    comments: string;
  }) => void;
  isPending: boolean;
}) {
  const formId = useId();
  const [transType, setTransType] =
    useState<DisplayedTransactionType>('chip_purchase');
  const [amount, setAmount] = useState('');
  const [location, setLocation] = useState('');
  const [comments, setComments] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) return;

    onSubmit({
      amount: parsedAmount,
      transType,
      location,
      comments,
    });

    setAmount('');
    setLocation('');
    setComments('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
        <Plus className="w-4 h-4" />
        New Transaction Entry
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor={`${formId}-type`} className="text-xs">
            Transaction Type
          </Label>
          <Select
            value={transType}
            onValueChange={(v) => setTransType(v as DisplayedTransactionType)}
          >
            <SelectTrigger id={`${formId}-type`} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISPLAYED_TRANSACTION_TYPES.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label htmlFor={`${formId}-amount`} className="text-xs">
            Amount
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              $
            </span>
            <Input
              id={`${formId}-amount`}
              type="number"
              min="0"
              step="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="h-9 pl-7 font-mono"
              required
            />
          </div>
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label htmlFor={`${formId}-location`} className="text-xs">
            Location #
          </Label>
          <Input
            id={`${formId}-location`}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., BJ-12"
            className="h-9 font-mono"
          />
        </div>

        <div className="col-span-3 space-y-1.5">
          <Label htmlFor={`${formId}-comments`} className="text-xs">
            Audit Notes
          </Label>
          <Input
            id={`${formId}-comments`}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Optional notes..."
            className="h-9"
          />
        </div>

        <div className="col-span-1 flex items-end">
          <Button
            type="submit"
            disabled={isPending || !amount}
            className={cn(
              'h-9 w-full',
              'bg-accent hover:bg-accent/90 text-accent-foreground',
              'transition-all duration-200',
              'disabled:opacity-50',
            )}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

function TransactionLogTable({ entries }: { entries: MtlEntryDTO[] }) {
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
      <div className="border border-dashed border-border rounded-lg p-8 text-center dark:border-border/50 dark:bg-secondary/10">
        <div className="text-muted-foreground text-sm">
          No transactions recorded yet
        </div>
        <div className="text-muted-foreground/60 text-xs mt-1">
          Add a transaction above to begin tracking
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden shadow-sm dark:shadow-lg dark:shadow-black/20 dark:border-border/50">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30 dark:bg-secondary/50">
            <TableHead className="w-24">Time</TableHead>
            <TableHead className="w-24">Location</TableHead>
            <TableHead className="w-32">Type</TableHead>
            <TableHead className="w-28 text-right">Amount</TableHead>
            <TableHead className="w-32 text-right">
              <span className="inline-flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-emerald-500" />
                Cash-In
              </span>
            </TableHead>
            <TableHead className="w-32 text-right">
              <span className="inline-flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-blue-500" />
                Cash-Out
              </span>
            </TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entriesWithTotals.map((entry, index) => {
            const cashInState = getThresholdState(entry.runningCashIn);
            const cashOutState = getThresholdState(entry.runningCashOut);
            const isLatest = index === entriesWithTotals.length - 1;

            return (
              <TableRow
                key={entry.id}
                className={cn(
                  'group transition-colors',
                  isLatest &&
                    'bg-accent/5 animate-in fade-in-0 slide-in-from-top-2 duration-300',
                )}
              >
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
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
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
                  {formatCurrency(entry.amount)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-mono font-medium tabular-nums',
                    cashInState === 'crossed' &&
                      'text-red-600 dark:text-red-400',
                    cashInState === 'approaching' &&
                      'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {formatCurrency(entry.runningCashIn)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-mono font-medium tabular-nums',
                    cashOutState === 'crossed' &&
                      'text-red-600 dark:text-red-400',
                    cashOutState === 'approaching' &&
                      'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {formatCurrency(entry.runningCashOut)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                  <span className="block truncate">—</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="bg-muted/50 dark:bg-secondary/60">
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
                  'text-red-600 dark:text-red-400',
                getThresholdState(runningCashIn) === 'approaching' &&
                  'text-amber-600 dark:text-amber-400',
              )}
            >
              {formatCurrency(runningCashIn)}
            </TableCell>
            <TableCell
              className={cn(
                'text-right font-mono font-bold tabular-nums',
                getThresholdState(runningCashOut) === 'crossed' &&
                  'text-red-600 dark:text-red-400',
                getThresholdState(runningCashOut) === 'approaching' &&
                  'text-amber-600 dark:text-amber-400',
              )}
            >
              {formatCurrency(runningCashOut)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              Append-only log
            </TableCell>
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
 * MTL Entry Form
 *
 * Simplified entry form for creating MTL entries with visual threshold tracking.
 * Uses 2 transaction types (buy-in, cash-out) for pit floor UX simplicity.
 *
 * @example
 * ```tsx
 * <MtlEntryForm
 *   casinoId={casinoId}
 *   staffId={staffId}
 *   patron={{ id: playerId, firstName: "John", lastName: "Smith" }}
 *   gamingDay="2026-01-19"
 *   onSuccess={() => dialog.close()}
 *   onCancel={() => dialog.close()}
 * />
 * ```
 */
export function MtlEntryForm({
  casinoId,
  staffId,
  patron,
  visitId,
  ratingSlipId,
  gamingDay,
  onSuccess,
  onCancel,
  className,
}: MtlEntryFormProps) {
  const [isPending, startTransition] = useTransition();
  const createEntry = useCreateMtlEntry();

  // Physical characteristics state
  const [characteristics, setCharacteristics] = useState<
    Record<string, string>
  >({});

  // Fetch existing entries for this patron on this gaming day
  const { data: entriesData } = useMtlEntries({
    casinoId,
    patronId: patron?.id,
    gamingDay,
  });

  const entries = entriesData?.items ?? [];

  // Optimistic entries for immediate UI feedback
  const [optimisticEntries, addOptimisticEntry] = useOptimistic(
    entries,
    (state, newEntry: MtlEntryDTO) => [...state, newEntry],
  );

  // Calculate totals from optimistic entries
  const totals = useMemo(() => {
    return optimisticEntries.reduce(
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
  }, [optimisticEntries]);

  // Handle adding a new entry
  const handleAddEntry = useCallback(
    (data: {
      amount: number;
      transType: DisplayedTransactionType;
      location: string;
      comments: string;
    }) => {
      if (!patron?.id) return;

      const typeConfig = DISPLAYED_TRANSACTION_TYPES.find(
        (t) => t.value === data.transType,
      );
      if (!typeConfig) return;

      // Convert user-entered dollars to cents (ISSUE-FB8EB717)
      const amountCents = Math.round(data.amount * 100);

      const optimisticEntry: MtlEntryDTO = {
        id: `temp-${Date.now()}`,
        patron_uuid: patron.id,
        casino_id: casinoId,
        staff_id: staffId,
        rating_slip_id: ratingSlipId ?? null,
        visit_id: visitId ?? null,
        amount: amountCents, // CENTS (ISSUE-FB8EB717)
        direction: typeConfig.direction,
        txn_type: typeConfig.mtlType,
        source: 'table',
        area: data.location || null,
        gaming_day: gamingDay,
        occurred_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        entry_badge: 'none',
      };

      startTransition(async () => {
        addOptimisticEntry(optimisticEntry);

        try {
          await createEntry.mutateAsync({
            patron_uuid: patron.id,
            casino_id: casinoId,
            staff_id: staffId,
            rating_slip_id: ratingSlipId,
            visit_id: visitId,
            amount: amountCents, // CENTS (ISSUE-FB8EB717)
            direction: typeConfig.direction,
            txn_type: typeConfig.mtlType,
            source: 'table',
            area: data.location || undefined,
            idempotency_key: crypto.randomUUID(),
          });

          onSuccess?.();
        } catch {
          // Entry will be removed from optimistic state on next fetch
        }
      });
    },
    [
      patron?.id,
      casinoId,
      staffId,
      ratingSlipId,
      visitId,
      gamingDay,
      createEntry,
      addOptimisticEntry,
      onSuccess,
    ],
  );

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 font-mono text-lg">
          <User className="h-5 w-5" />
          MTL Entry Form
        </CardTitle>
        <CardDescription>
          Multiple Transaction Log - Simplified entry for pit floor operations
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Patron Info */}
        {patron && (
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Patron:</span>
                <p className="font-medium">
                  {patron.firstName} {patron.lastName}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Account:</span>
                <p className="font-mono">
                  {patron.loyaltyCardNumber ?? patron.id.slice(0, 8)}
                </p>
              </div>
              {patron.dateOfBirth && (
                <div>
                  <span className="text-muted-foreground">DOB:</span>
                  <p>{format(new Date(patron.dateOfBirth), 'MM/dd/yyyy')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {!patron && (
          <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground">
            No patron selected. Select a patron from the compliance dashboard.
          </div>
        )}

        {/* Physical Characteristics */}
        <PhysicalCharacteristicsSection
          characteristics={characteristics}
          onChange={setCharacteristics}
        />

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

        {/* Transaction Entry Form - always visible, disabled when no patron */}
        <div
          className={cn(
            'border border-border rounded-lg p-5 bg-card/50 shadow-sm dark:shadow-lg dark:shadow-black/30 dark:border-accent/20 dark:bg-secondary/30',
            !patron && 'opacity-50 pointer-events-none',
          )}
        >
          {!patron && (
            <div className="text-center text-sm text-muted-foreground mb-4 p-2 bg-muted/50 rounded">
              Select a patron from the Gaming Day Summary to add entries
            </div>
          )}
          <TransactionEntryForm
            onSubmit={handleAddEntry}
            isPending={isPending || !patron}
          />
        </div>

        {/* Transaction Log */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Transaction Log
            </h3>
            <span className="text-xs text-muted-foreground">
              {optimisticEntries.length}{' '}
              {optimisticEntries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <TransactionLogTable entries={optimisticEntries} />
        </div>

        {/* Gaming Day Display */}
        <div className="text-xs text-muted-foreground border-t pt-4">
          Gaming Day: <span className="font-mono">{gamingDay}</span>
        </div>

        {/* Actions */}
        {onCancel && (
          <div className="flex justify-end border-t pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Close
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
