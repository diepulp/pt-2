'use client';

import {
  ChevronDown,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
} from 'lucide-react';
import * as React from 'react';
import {
  useId,
  useState,
  useCallback,
  useOptimistic,
  useTransition,
} from 'react';

import { Button } from '@/components/ui/button';
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
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type TransactionDirection = 'cash_in' | 'cash_out';
type TransactionType = 'chip_purchase' | 'chip_redemption';
type ThresholdState = 'none' | 'approaching' | 'crossed';

interface MtlEntry {
  id: string;
  time: string;
  period: 'AM' | 'PM';
  location: string;
  transType: TransactionType;
  amount: number;
  direction: TransactionDirection;
  employeeId: string;
  employeeName: string;
  comments: string;
  createdAt: Date;
}

interface PlayerInfo {
  name: string;
  accountNumber: string;
}

interface PhysicalCharacteristics {
  sex: string;
  race: string;
  build: string;
  age: string;
  hair: string;
  height: string;
  other: string;
}

// ============================================================================
// Constants
// ============================================================================

const THRESHOLD_AMOUNT = 3000;
const APPROACHING_PCT = 0.9;
const APPROACHING_AMOUNT = THRESHOLD_AMOUNT * APPROACHING_PCT; // $2,700

const TRANSACTION_TYPES: {
  value: TransactionType;
  label: string;
  direction: TransactionDirection;
}[] = [
  {
    value: 'chip_purchase',
    label: 'Chip Purchase (Buy-In)',
    direction: 'cash_in',
  },
  {
    value: 'chip_redemption',
    label: 'Chip Redemption (Cash-Out)',
    direction: 'cash_out',
  },
];

// ============================================================================
// Utility Functions
// ============================================================================

function formatDollars(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getPeriod(date: Date): 'AM' | 'PM' {
  return date.getHours() < 12 ? 'AM' : 'PM';
}

function getThresholdState(total: number): ThresholdState {
  if (total > THRESHOLD_AMOUNT) return 'crossed';
  if (total >= APPROACHING_AMOUNT) return 'approaching';
  return 'none';
}

function generateId(): string {
  return `mtl-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ============================================================================
// Threshold Badge Component
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
      {isCrossed ? 'CROSSED' : 'APPROACHING'}
    </div>
  );
}

// ============================================================================
// Running Total Display
// ============================================================================

function RunningTotalDisplay({
  label,
  total,
  direction,
}: {
  label: string;
  total: number;
  direction: TransactionDirection;
}) {
  const state = getThresholdState(total);
  const percentage = Math.min((total / THRESHOLD_AMOUNT) * 100, 100);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm dark:shadow-lg dark:shadow-black/20 dark:border-border/50 dark:bg-card/80">
      {/* Progress bar background */}
      <div
        className={cn(
          'absolute inset-0 opacity-10 transition-all duration-500',
          state === 'crossed'
            ? 'bg-red-500'
            : state === 'approaching'
              ? 'bg-amber-500'
              : direction === 'cash_in'
                ? 'bg-emerald-500'
                : 'bg-blue-500',
        )}
        style={{ width: `${percentage}%` }}
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {direction === 'cash_in' ? (
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
          {formatDollars(total)}
        </div>

        <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500 rounded-full',
              state === 'crossed'
                ? 'bg-red-500'
                : state === 'approaching'
                  ? 'bg-amber-500'
                  : direction === 'cash_in'
                    ? 'bg-emerald-500'
                    : 'bg-blue-500',
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="mt-1 flex justify-between text-xs text-muted-foreground font-mono">
          <span>$0</span>
          <span className={cn(state === 'approaching' && 'text-amber-500')}>
            ${APPROACHING_AMOUNT.toLocaleString()}
          </span>
          <span className={cn(state === 'crossed' && 'text-red-500')}>
            ${THRESHOLD_AMOUNT.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Physical Characteristics Section
// ============================================================================

function PhysicalCharacteristicsSection({
  characteristics,
  onChange,
}: {
  characteristics: PhysicalCharacteristics;
  onChange: (chars: PhysicalCharacteristics) => void;
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
                value={characteristics[key]}
                onChange={(e) =>
                  onChange({ ...characteristics, [key]: e.target.value })
                }
                placeholder={placeholder}
                className="h-8 text-sm"
              />
            </div>
          ))}
          <div className="col-span-6 space-y-1.5">
            <Label
              htmlFor="char-other"
              className="text-xs text-muted-foreground"
            >
              Other Physical Characteristics
            </Label>
            <Input
              id="char-other"
              value={characteristics.other}
              onChange={(e) =>
                onChange({ ...characteristics, other: e.target.value })
              }
              placeholder="Additional identifying features..."
              className="h-8 text-sm"
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Transaction Entry Form
// ============================================================================

function TransactionEntryForm({
  onSubmit,
  isPending,
}: {
  onSubmit: (entry: Omit<MtlEntry, 'id' | 'createdAt'>) => void;
  isPending: boolean;
}) {
  const formId = useId();
  const [transType, setTransType] = useState<TransactionType>('chip_purchase');
  const [amount, setAmount] = useState('');
  const [location, setLocation] = useState('');
  const [comments, setComments] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const now = new Date();
    const typeConfig = TRANSACTION_TYPES.find((t) => t.value === transType)!;

    onSubmit({
      time: formatTime(now),
      period: getPeriod(now),
      location,
      transType,
      amount: parseFloat(amount) || 0,
      direction: typeConfig.direction,
      employeeId: 'EMP-001', // Would come from auth context
      employeeName: 'J. Smith', // Would come from auth context
      comments,
    });

    // Reset form
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
        {/* Transaction Type */}
        <div className="col-span-4 space-y-1.5">
          <Label htmlFor={`${formId}-type`} className="text-xs">
            Transaction Type
          </Label>
          <Select
            value={transType}
            onValueChange={(v) => setTransType(v as TransactionType)}
          >
            <SelectTrigger id={`${formId}-type`} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSACTION_TYPES.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Amount */}
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

        {/* Location */}
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

        {/* Audit Notes (Optional) */}
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

        {/* Submit */}
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
              <Clock className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ============================================================================
// Transaction Log Table
// ============================================================================

function TransactionLogTable({ entries }: { entries: MtlEntry[] }) {
  // Calculate running totals
  let runningCashIn = 0;
  let runningCashOut = 0;

  const entriesWithTotals = entries.map((entry) => {
    if (entry.direction === 'cash_in') {
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
            <TableHead className="w-32">Trans Type</TableHead>
            <TableHead className="w-28 text-right">Amount</TableHead>
            <TableHead className="w-32 text-right">
              <span className="inline-flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-emerald-500" />
                Cash-In Total
              </span>
            </TableHead>
            <TableHead className="w-32 text-right">
              <span className="inline-flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-blue-500" />
                Cash-Out Total
              </span>
            </TableHead>
            <TableHead className="w-40">Employee</TableHead>
            <TableHead>Audit Notes</TableHead>
            <TableHead className="w-10">
              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            </TableHead>
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
                  <span className="text-foreground">{entry.time}</span>
                  <span className="text-muted-foreground ml-1 text-xs">
                    {entry.period}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {entry.location || '—'}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded',
                      entry.direction === 'cash_in'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                    )}
                  >
                    {entry.direction === 'cash_in' ? (
                      <ArrowDownLeft className="w-3 h-3" />
                    ) : (
                      <ArrowUpRight className="w-3 h-3" />
                    )}
                    {entry.transType === 'chip_purchase'
                      ? 'Buy-In'
                      : 'Cash-Out'}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatDollars(entry.amount)}
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
                  {entry.direction === 'cash_in' ? (
                    <span className="relative">
                      {formatDollars(entry.runningCashIn)}
                      {cashInState !== 'none' && isLatest && (
                        <span className="absolute -right-1 -top-1 w-2 h-2 bg-current rounded-full animate-ping" />
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {formatDollars(entry.runningCashIn)}
                    </span>
                  )}
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
                  {entry.direction === 'cash_out' ? (
                    <span className="relative">
                      {formatDollars(entry.runningCashOut)}
                      {cashOutState !== 'none' && isLatest && (
                        <span className="absolute -right-1 -top-1 w-2 h-2 bg-current rounded-full animate-ping" />
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {formatDollars(entry.runningCashOut)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  <div className="font-medium">{entry.employeeName}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {entry.employeeId}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                  <span className="block truncate" title={entry.comments}>
                    {entry.comments || '—'}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-[10px] text-muted-foreground/50 font-mono">
                    #{index + 1}
                  </span>
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
              {formatDollars(runningCashIn)}
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
              {formatDollars(runningCashOut)}
            </TableCell>
            <TableCell colSpan={3} className="text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Append-only log
              </span>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

// ============================================================================
// Main Form Component
// ============================================================================

export function MtlEntryForm() {
  const [isPending, startTransition] = useTransition();

  // Player info state
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo>({
    name: '',
    accountNumber: '',
  });

  // Physical characteristics state
  const [characteristics, setCharacteristics] =
    useState<PhysicalCharacteristics>({
      sex: '',
      race: '',
      build: '',
      age: '',
      hair: '',
      height: '',
      other: '',
    });

  // Transaction entries with optimistic updates
  const [entries, setEntries] = useState<MtlEntry[]>([]);
  const [optimisticEntries, addOptimisticEntry] = useOptimistic(
    entries,
    (state, newEntry: MtlEntry) => [...state, newEntry],
  );

  // Calculate totals
  const totals = optimisticEntries.reduce(
    (acc, entry) => {
      if (entry.direction === 'cash_in') {
        acc.cashIn += entry.amount;
      } else {
        acc.cashOut += entry.amount;
      }
      return acc;
    },
    { cashIn: 0, cashOut: 0 },
  );

  // Handle adding a new entry
  const handleAddEntry = useCallback(
    (entryData: Omit<MtlEntry, 'id' | 'createdAt'>) => {
      const newEntry: MtlEntry = {
        ...entryData,
        id: generateId(),
        createdAt: new Date(),
      };

      startTransition(() => {
        addOptimisticEntry(newEntry);
        // Simulate async operation (would be a server action in production)
        setTimeout(() => {
          setEntries((prev) => [...prev, newEntry]);
        }, 100);
      });
    },
    [addOptimisticEntry],
  );

  return (
    <div className="space-y-8">
      {/* Player Header Section */}
      <section className="space-y-4">
        <div className="grid grid-cols-2 gap-6">
          {/* Player Name */}
          <div className="space-y-2">
            <Label
              htmlFor="player-name"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Patron Name
            </Label>
            <Input
              id="player-name"
              value={playerInfo.name}
              onChange={(e) =>
                setPlayerInfo((p) => ({ ...p, name: e.target.value }))
              }
              placeholder="Enter patron name..."
              className="h-12 text-lg font-medium shadow-sm dark:shadow-md dark:shadow-black/10 dark:bg-secondary/50"
            />
          </div>

          {/* Account Number */}
          <div className="space-y-2">
            <Label
              htmlFor="account-number"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Account Number
            </Label>
            <Input
              id="account-number"
              value={playerInfo.accountNumber}
              onChange={(e) =>
                setPlayerInfo((p) => ({ ...p, accountNumber: e.target.value }))
              }
              placeholder="Enter account number..."
              className="h-12 text-lg font-mono shadow-sm dark:shadow-md dark:shadow-black/10 dark:bg-secondary/50"
            />
          </div>
        </div>

        {/* Physical Characteristics (Collapsible) */}
        <PhysicalCharacteristicsSection
          characteristics={characteristics}
          onChange={setCharacteristics}
        />
      </section>

      {/* Running Totals Dashboard */}
      <section className="grid grid-cols-2 gap-4">
        <RunningTotalDisplay
          label="Total Cash-In"
          total={totals.cashIn}
          direction="cash_in"
        />
        <RunningTotalDisplay
          label="Total Cash-Out"
          total={totals.cashOut}
          direction="cash_out"
        />
      </section>

      {/* Transaction Entry Form */}
      <section className="border border-border rounded-lg p-5 bg-card/50 shadow-sm dark:shadow-lg dark:shadow-black/30 dark:border-accent/20 dark:bg-secondary/30">
        <TransactionEntryForm onSubmit={handleAddEntry} isPending={isPending} />
      </section>

      {/* Transaction Log Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Transaction Log
          </h2>
          <span className="text-xs text-muted-foreground">
            {optimisticEntries.length}{' '}
            {optimisticEntries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <TransactionLogTable entries={optimisticEntries} />
      </section>
    </div>
  );
}
