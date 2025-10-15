"use client";

/**
 * MTL Transaction Entry Form Component
 * Phase 6 Wave 3 Track 2: MTL UI Implementation
 *
 * Features:
 * - Transaction type, amount, player ID, timestamp fields
 * - CTR threshold detection ($10,000 warning)
 * - Gaming day calculation and display
 * - Form validation with react-hook-form
 * - Integration with MTL server actions (NOT loyalty actions)
 * - WCAG 2.1 AA compliant
 *
 * CRITICAL: This form creates MTL entries ONLY
 * It does NOT write to loyalty tables
 */

import { AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
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
import type { Database } from "@/types/database.types";

// Type aliases from database
type MtlDirection = Database["public"]["Enums"]["MtlDirection"];
type MtlArea = Database["public"]["Enums"]["MtlArea"];
type TenderType = Database["public"]["Enums"]["TenderType"];

// CTR Threshold constant (configurable per casino in production)
const CTR_THRESHOLD = 10000;

export interface MtlTransactionFormProps {
  casinoId: string;
  onSuccess?: (entryId: number) => void;
  onCancel?: () => void;
}

interface MtlFormData {
  direction: MtlDirection;
  area: MtlArea;
  amount: number;
  playerId: string;
  tenderType: TenderType;
  eventTime: string;
  tableNumber?: string;
  locationNote?: string;
  notes?: string;
}

/**
 * Calculate gaming day from event timestamp
 * Gaming day starts at 6 AM and runs for 24 hours
 *
 * @param eventTime - ISO timestamp
 * @returns Gaming day in YYYY-MM-DD format
 */
function calculateGamingDay(eventTime: string): string {
  const eventDate = new Date(eventTime);
  const gamingDayStart = new Date(eventDate);
  gamingDayStart.setHours(6, 0, 0, 0);

  // If event is before 6 AM, gaming day is previous day
  if (eventDate.getHours() < 6) {
    gamingDayStart.setDate(gamingDayStart.getDate() - 1);
  }

  return gamingDayStart.toISOString().split("T")[0];
}

export function MtlTransactionForm({
  casinoId,
  onSuccess,
  onCancel,
}: MtlTransactionFormProps) {
  const [gamingDay, setGamingDay] = useState<string>("");
  const [showCtrWarning, setShowCtrWarning] = useState(false);

  // Form setup
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
  } = useForm<MtlFormData>({
    defaultValues: {
      direction: "cash_in",
      area: "pit",
      amount: 0,
      playerId: "",
      tenderType: "cash",
      eventTime: new Date().toISOString().slice(0, 16),
      tableNumber: "",
      locationNote: "",
      notes: "",
    },
  });

  // Watch form values for controlled selects and calculations
  const watchedDirection = watch("direction");
  const watchedArea = watch("area");
  const watchedTenderType = watch("tenderType");
  const watchedAmount = watch("amount");
  const watchedEventTime = watch("eventTime");

  // Update gaming day when event time changes
  useEffect(() => {
    if (watchedEventTime) {
      const calculatedGamingDay = calculateGamingDay(watchedEventTime);
      setGamingDay(calculatedGamingDay);
    }
  }, [watchedEventTime]);

  // CTR threshold detection
  useEffect(() => {
    setShowCtrWarning(watchedAmount >= CTR_THRESHOLD);
  }, [watchedAmount]);

  // Handle form submission
  const onSubmit = async (data: MtlFormData) => {
    // TODO: Call MTL server action (NOT loyalty action)
    // const result = await createMtlEntry({
    //   casinoId,
    //   direction: data.direction,
    //   area: data.area,
    //   amount: data.amount,
    //   patronId: data.playerId,
    //   tenderType: data.tenderType,
    //   eventTime: new Date(data.eventTime).toISOString(),
    //   gamingDay,
    //   tableNumber: data.tableNumber,
    //   locationNote: data.locationNote,
    //   notes: data.notes,
    // });
    //
    // if (result.success && onSuccess) {
    //   onSuccess(result.data.id);
    // }
    // TODO: Replace with actual server action call when MTL backend is implemented
    // Submission data: { ...data, casinoId, gamingDay, showCtrWarning }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Record MTL Transaction</CardTitle>
      </CardHeader>
      <CardContent>
        {/* CTR Warning */}
        {showCtrWarning && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>CTR Threshold Alert</AlertTitle>
            <AlertDescription>
              Amount meets or exceeds ${CTR_THRESHOLD.toLocaleString()}{" "}
              threshold. Currency Transaction Report (CTR) filing may be
              required.
            </AlertDescription>
          </Alert>
        )}

        {/* Gaming Day Display */}
        {gamingDay && (
          <div
            className="mb-4 p-3 bg-muted rounded-lg"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm font-medium">
              Gaming Day: <span className="font-bold">{gamingDay}</span>
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Transaction Direction */}
          <div className="space-y-2">
            <Label htmlFor="direction">
              Transaction Direction <span className="text-destructive">*</span>
            </Label>
            <Select
              value={watchedDirection}
              onValueChange={(value) =>
                setValue("direction", value as MtlDirection, {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger id="direction" aria-required="true">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash_in">Cash In</SelectItem>
                <SelectItem value="cash_out">Cash Out</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Area */}
          <div className="space-y-2">
            <Label htmlFor="area">
              Area <span className="text-destructive">*</span>
            </Label>
            <Select
              value={watchedArea}
              onValueChange={(value) =>
                setValue("area", value as MtlArea, { shouldDirty: true })
              }
            >
              <SelectTrigger id="area" aria-required="true">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pit">Pit</SelectItem>
                <SelectItem value="cage">Cage</SelectItem>
                <SelectItem value="slot">Slot</SelectItem>
                <SelectItem value="poker">Poker</SelectItem>
                <SelectItem value="kiosk">Kiosk</SelectItem>
                <SelectItem value="sportsbook">Sportsbook</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">
              Amount <span className="text-destructive">*</span>
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              {...register("amount", {
                required: "Amount is required",
                min: {
                  value: 0,
                  message: "Amount must be greater than 0",
                },
                valueAsNumber: true,
              })}
              aria-invalid={errors.amount ? "true" : "false"}
              aria-describedby={errors.amount ? "amount-error" : undefined}
            />
            {errors.amount && (
              <p
                id="amount-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.amount.message}
              </p>
            )}
          </div>

          {/* Player ID */}
          <div className="space-y-2">
            <Label htmlFor="playerId">
              Player ID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="playerId"
              type="text"
              {...register("playerId", {
                required: "Player ID is required",
              })}
              placeholder="Player UUID"
              aria-invalid={errors.playerId ? "true" : "false"}
              aria-describedby={errors.playerId ? "playerId-error" : undefined}
            />
            {errors.playerId && (
              <p
                id="playerId-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.playerId.message}
              </p>
            )}
          </div>

          {/* Tender Type */}
          <div className="space-y-2">
            <Label htmlFor="tenderType">
              Tender Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={watchedTenderType}
              onValueChange={(value) =>
                setValue("tenderType", value as TenderType, {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger id="tenderType" aria-required="true">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cashier_check">Cashier Check</SelectItem>
                <SelectItem value="tito">TITO</SelectItem>
                <SelectItem value="money_order">Money Order</SelectItem>
                <SelectItem value="chips">Chips</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Event Time */}
          <div className="space-y-2">
            <Label htmlFor="eventTime">
              Event Time <span className="text-destructive">*</span>
            </Label>
            <Input
              id="eventTime"
              type="datetime-local"
              {...register("eventTime", {
                required: "Event time is required",
              })}
              aria-invalid={errors.eventTime ? "true" : "false"}
              aria-describedby={
                errors.eventTime ? "eventTime-error" : undefined
              }
            />
            {errors.eventTime && (
              <p
                id="eventTime-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.eventTime.message}
              </p>
            )}
          </div>

          {/* Table Number (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="tableNumber">Table Number (Optional)</Label>
            <Input
              id="tableNumber"
              type="text"
              {...register("tableNumber")}
              placeholder="e.g., BJ-12"
            />
          </div>

          {/* Location Note (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="locationNote">Location Note (Optional)</Label>
            <Input
              id="locationNote"
              type="text"
              {...register("locationNote")}
              placeholder="Additional location details"
            />
          </div>

          {/* Notes (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Input
              id="notes"
              type="text"
              {...register("notes")}
              placeholder="Additional notes or observations"
            />
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          onClick={handleSubmit(onSubmit)}
          disabled={!isDirty}
        >
          Record Transaction
        </Button>
      </CardFooter>
    </Card>
  );
}
