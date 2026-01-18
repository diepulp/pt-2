/**
 * MTL Entry Form Component
 *
 * Manual MTL entry form replicating the official Affinity Gaming MTL paper form.
 * Uses React 19 form patterns with useActionState and useFormStatus.
 *
 * Form Layout:
 * - Section 1: Patron Identification (auto-populated, read-only)
 * - Section 2: Transaction Details (editable)
 * - CTR Warning Banner when totals approach $10,000
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS6
 * @see docs/00-vision/mtl-service-evolution/MTL-FORM.png
 */

"use client";

import { format } from "date-fns";
import { AlertCircle, DollarSign, Loader2, User } from "lucide-react";
import { useActionState, useCallback, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateMtlEntry } from "@/hooks/mtl/use-mtl-mutations";
import { usePatronDailyTotal } from "@/hooks/mtl/use-patron-daily-total";
import {
  checkCumulativeThreshold,
  type ThresholdCheckResult,
} from "@/hooks/mtl/use-threshold-notifications";
import { cn } from "@/lib/utils";

import {
  MTL_TXN_TYPE_CODES,
  getCashInCodes,
  getCashOutCodes,
  formatTxnTypeCode,
  type MtlTxnTypeCode,
} from "./mtl-txn-type-codes";

// ============================================================================
// Types
// ============================================================================

/**
 * Form state for useActionState
 */
interface MtlEntryFormState {
  error: string | null;
  success: boolean;
}

/**
 * Patron data for auto-population
 */
export interface PatronData {
  /** Player UUID */
  id: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Loyalty card number or account number */
  loyaltyCardNumber?: string;
  /** Date of birth (ISO format) */
  dateOfBirth?: string;
}

/**
 * Component props
 */
export interface MtlEntryFormProps {
  /** Casino UUID */
  casinoId: string;
  /** Staff UUID for attribution */
  staffId: string;
  /** Patron data for auto-population */
  patron?: PatronData;
  /** Pre-link to visit (optional) */
  visitId?: string;
  /** Pre-link to rating slip (optional) */
  ratingSlipId?: string;
  /**
   * Gaming day in YYYY-MM-DD format (REQUIRED)
   * Must be fetched from server using useGamingDay() hook to respect casino timezone.
   * Do not use client-side date defaults.
   */
  gamingDay: string;
  /** Callback on successful submission */
  onSuccess?: () => void;
  /** Callback on cancel */
  onCancel?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Submit button with pending state
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Recording...
        </>
      ) : (
        <>
          <DollarSign className="mr-2 h-4 w-4" aria-hidden="true" />
          Record Entry
        </>
      )}
    </Button>
  );
}

/**
 * CTR warning message
 */
function CtrWarningMessage() {
  return (
    <Alert variant="destructive" className="mt-4">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <strong>CTR Notice:</strong> Before a customer exceeds $10,000 in either
        cash-in or cash-out transactions, the customer&apos;s ID, address, and
        social security number must be obtained.
      </AlertDescription>
    </Alert>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * MTL Entry Form
 *
 * Manual entry form for creating MTL entries. Replicates the official
 * Affinity Gaming MTL paper form structure.
 *
 * @example
 * ```tsx
 * <MtlEntryForm
 *   casinoId={casinoId}
 *   staffId={staffId}
 *   patron={{ id: playerId, firstName: "John", lastName: "Smith" }}
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
  // Create mutation hook
  const createEntry = useCreateMtlEntry();

  // Fetch patron's daily total for threshold checking
  // ISSUE-CLIENT-GD-003: gamingDay is now required, no client-side default
  const { data: dailyTotal } = usePatronDailyTotal(
    casinoId,
    patron?.id,
    gamingDay,
  );

  // Local state for amount (needed for live threshold calculation)
  const [amountValue, setAmountValue] = useState<number>(0);
  const [selectedTxnType, setSelectedTxnType] = useState<MtlTxnTypeCode | null>(
    null,
  );

  // Calculate threshold status based on current input
  const thresholdResult: ThresholdCheckResult | null = useMemo(() => {
    if (!amountValue || amountValue <= 0) return null;

    const currentTotal =
      selectedTxnType?.direction === "in"
        ? (dailyTotal?.totalIn ?? 0)
        : (dailyTotal?.totalOut ?? 0);

    return checkCumulativeThreshold(currentTotal, amountValue);
  }, [amountValue, selectedTxnType, dailyTotal]);

  // Calculate running totals for display
  const runningTotals = useMemo(() => {
    const currentIn = dailyTotal?.totalIn ?? 0;
    const currentOut = dailyTotal?.totalOut ?? 0;

    if (!amountValue || !selectedTxnType) {
      return { totalIn: currentIn, totalOut: currentOut };
    }

    if (selectedTxnType.direction === "in") {
      return { totalIn: currentIn + amountValue, totalOut: currentOut };
    } else {
      return { totalIn: currentIn, totalOut: currentOut + amountValue };
    }
  }, [dailyTotal, amountValue, selectedTxnType]);

  // Show CTR warning when approaching threshold
  const showCtrWarning = useMemo(() => {
    return runningTotals.totalIn > 9000 || runningTotals.totalOut > 9000;
  }, [runningTotals]);

  // Handle transaction type change
  const handleTxnTypeChange = useCallback((value: string) => {
    const code = parseInt(value, 10);
    const txnType = MTL_TXN_TYPE_CODES[code];
    setSelectedTxnType(txnType ?? null);
  }, []);

  // Handle amount change
  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value) || 0;
      setAmountValue(value);
    },
    [],
  );

  // Form action with useActionState
  const [state, submitAction] = useActionState(
    async (
      _prevState: MtlEntryFormState,
      formData: FormData,
    ): Promise<MtlEntryFormState> => {
      // Extract form fields
      const amount = parseFloat(formData.get("amount") as string);
      const txnTypeCode = parseInt(formData.get("txnType") as string, 10);
      const note = (formData.get("note") as string)?.trim();
      const area = (formData.get("area") as string)?.trim() || undefined;
      const patronUuid = formData.get("patronUuid") as string;

      // Validate required fields
      if (!note) {
        return { error: "Comments/note is required", success: false };
      }

      if (!amount || amount <= 0) {
        return { error: "Amount must be greater than 0", success: false };
      }

      if (!txnTypeCode || !MTL_TXN_TYPE_CODES[txnTypeCode]) {
        return { error: "Please select a transaction type", success: false };
      }

      if (!patronUuid) {
        return { error: "Patron is required", success: false };
      }

      // Map txn type code to direction and mtlType
      const txnType = MTL_TXN_TYPE_CODES[txnTypeCode];

      try {
        // Call mutation
        await createEntry.mutateAsync({
          patron_uuid: patronUuid,
          casino_id: casinoId,
          staff_id: staffId,
          rating_slip_id: ratingSlipId,
          visit_id: visitId,
          amount,
          direction: txnType.direction,
          txn_type: txnType.mtlType,
          source: "table",
          area,
          idempotency_key: crypto.randomUUID(),
        });

        // Success callback
        onSuccess?.();
        return { error: null, success: true };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create MTL entry";
        return { error: message, success: false };
      }
    },
    { error: null, success: false },
  );

  // Calculate patron age if DOB provided
  const patronAge = useMemo(() => {
    if (!patron?.dateOfBirth) return null;
    const dob = new Date(patron.dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }, [patron?.dateOfBirth]);

  // Format currency for display
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <Card className={cn("w-full max-w-2xl", className)}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 font-mono">
          <DollarSign className="h-5 w-5" />
          Multiple Transaction Log Entry
        </CardTitle>
        <CardDescription>
          Record a manual MTL entry per gaming regulations. All fields marked
          with * are required.
        </CardDescription>
      </CardHeader>

      <form action={submitAction}>
        <CardContent className="space-y-6">
          {/* Hidden fields */}
          <input type="hidden" name="patronUuid" value={patron?.id ?? ""} />

          {/* Section 1: Patron Identification (read-only) */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2 border-b pb-2">
              <User className="h-4 w-4" />
              Patron Identification
            </h3>

            {patron ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Name:</span>
                  <p className="font-medium">
                    {patron.firstName} {patron.lastName}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Account Number:</span>
                  <p className="font-mono">
                    {patron.loyaltyCardNumber ?? patron.id.slice(0, 8)}
                  </p>
                </div>
                {patron.dateOfBirth && (
                  <div>
                    <span className="text-muted-foreground">DOB:</span>
                    <p>
                      {format(new Date(patron.dateOfBirth), "MM/dd/yyyy")}
                      {patronAge !== null && (
                        <span className="text-muted-foreground ml-2">
                          (Age: {patronAge})
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No patron selected. Select a patron to auto-populate
                identification.
              </p>
            )}
          </div>

          {/* Section 2: Transaction Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium border-b pb-2">
              Transaction Details
            </h3>

            {/* Transaction Type */}
            <div className="space-y-2">
              <Label htmlFor="txnType">Transaction Type *</Label>
              <Select
                name="txnType"
                required
                onValueChange={handleTxnTypeChange}
              >
                <SelectTrigger id="txnType">
                  <SelectValue placeholder="Select transaction type" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Cash-In (1-5)
                  </div>
                  {getCashInCodes().map((txn) => (
                    <SelectItem key={txn.code} value={String(txn.code)}>
                      {formatTxnTypeCode(txn)}
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                    Cash-Out (6-12)
                  </div>
                  {getCashOutCodes().map((txn) => (
                    <SelectItem key={txn.code} value={String(txn.code)}>
                      {formatTxnTypeCode(txn)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Transaction Amount *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0.00"
                  className="pl-7 font-mono"
                  onChange={handleAmountChange}
                />
              </div>
            </div>

            {/* Location/Area */}
            <div className="space-y-2">
              <Label htmlFor="area">Location / Table</Label>
              <Input
                id="area"
                name="area"
                placeholder="e.g., Table 12, Pit 3"
              />
            </div>

            {/* Running Totals */}
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-md">
              <div>
                <span className="text-xs text-muted-foreground">
                  Total Cash-In
                </span>
                <p
                  className={cn(
                    "font-mono font-medium",
                    runningTotals.totalIn > 10000 &&
                      "text-red-600 dark:text-red-400",
                  )}
                >
                  {formatCurrency(runningTotals.totalIn)}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">
                  Total Cash-Out
                </span>
                <p
                  className={cn(
                    "font-mono font-medium",
                    runningTotals.totalOut > 10000 &&
                      "text-red-600 dark:text-red-400",
                  )}
                >
                  {formatCurrency(runningTotals.totalOut)}
                </p>
              </div>
            </div>

            {/* Threshold Indicator */}
            {thresholdResult && thresholdResult.level !== "none" && (
              <div
                className={cn(
                  "p-3 rounded-md text-sm",
                  thresholdResult.level === "warning" &&
                    "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200",
                  thresholdResult.level === "watchlist_met" &&
                    "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
                  thresholdResult.level === "ctr_near" &&
                    "bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200",
                  thresholdResult.level === "ctr_met" &&
                    "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200",
                )}
              >
                {thresholdResult.message}
              </div>
            )}

            {/* CTR Warning */}
            {showCtrWarning && <CtrWarningMessage />}

            {/* Comments / Note (required) */}
            <div className="space-y-2">
              <Label htmlFor="note">Comments / Notes *</Label>
              <Textarea
                id="note"
                name="note"
                required
                placeholder="Required: explain this transaction entry"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                All MTL entries require an explanation for audit purposes.
              </p>
            </div>
          </div>

          {/* Error Display */}
          {state.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {/* Gaming Day Display */}
          <div className="text-xs text-muted-foreground">
            Gaming Day: <span className="font-mono">{gamingDay}</span>
          </div>
        </CardContent>

        <CardFooter className="flex justify-between border-t pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <SubmitButton />
        </CardFooter>
      </form>
    </Card>
  );
}
