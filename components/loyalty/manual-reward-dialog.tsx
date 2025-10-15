"use client";

/**
 * Manual Reward Dialog Component
 * Phase 6 Wave 3 Track 2: RatingSlip Modal Integration
 *
 * Enables staff to manually award loyalty points to players with:
 * - ADR-003 compliant state management (useServiceMutation)
 * - Direct server action integration (manualReward)
 * - Client-side validation
 * - Graceful idempotency conflict handling
 * - Cache invalidation for player loyalty and rating slip detail
 * - Full accessibility (ARIA labels, keyboard navigation)
 *
 * @module components/loyalty/manual-reward-dialog
 */

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import {
  manualReward,
  type ManualRewardInput,
  type ManualRewardResult,
} from "@/app/actions/loyalty-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServiceMutation } from "@/hooks/shared/use-service-mutation";
import { toast } from "@/hooks/ui";

/**
 * Manual Reward Dialog Props
 */
export interface ManualRewardDialogProps {
  /** Dialog open state */
  open: boolean;
  /** Dialog open state change handler */
  onOpenChange: (open: boolean) => void;
  /** Player UUID */
  playerId: string;
  /** Player display name */
  playerName: string;
  /** Current loyalty balance */
  currentBalance: number;
  /** Current loyalty tier */
  currentTier: string;
  /** Optional success callback */
  onSuccess?: (result: ManualRewardResult) => void;
}

/**
 * Form validation errors
 */
interface FormErrors {
  points?: string;
  reason?: string;
}

/**
 * Manual Reward Dialog Component
 *
 * Provides a form for staff to manually award loyalty points with:
 * - Points input (number, min 1, required)
 * - Reason textarea (min 10 chars, required)
 * - Real-time validation
 * - Mutation state handling (loading, error, success)
 * - Cache invalidation on success
 *
 * @example
 * ```tsx
 * <ManualRewardDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   playerId="player-uuid"
 *   playerName="John Doe"
 *   currentBalance={1000}
 *   currentTier="SILVER"
 *   onSuccess={(result) => {
 *     console.log('Reward awarded:', result);
 *   }}
 * />
 * ```
 */
export function ManualRewardDialog({
  open,
  onOpenChange,
  playerId,
  playerName,
  currentBalance,
  currentTier,
  onSuccess,
}: ManualRewardDialogProps) {
  const queryClient = useQueryClient();

  // Local form state
  const [points, setPoints] = React.useState<string>("");
  const [reason, setReason] = React.useState<string>("");
  const [errors, setErrors] = React.useState<FormErrors>({});

  // Server mutation (ADR-003 compliant)
  // NOTE: Pass server action DIRECTLY, not wrapped in closure
  const awardPoints = useServiceMutation<ManualRewardResult, ManualRewardInput>(
    manualReward,
    {
      onSuccess: (data) => {
        // Cache invalidation
        queryClient.invalidateQueries({
          queryKey: ["loyalty", "player", playerId],
        });

        // Success toasts
        toast({
          title: "Reward Awarded",
          description: `Awarded ${data.pointsChange} points to ${playerName}`,
        });

        toast({
          title: "Updated Balance",
          description: `New balance: ${data.balanceAfter} | Tier: ${data.tierAfter}`,
        });

        // Reset form
        setPoints("");
        setReason("");
        setErrors({});

        // Close dialog
        onOpenChange(false);

        // Callback
        onSuccess?.(data);
      },
      onError: (error) => {
        // Check for idempotency conflict (soft success)
        const errorDetails = (error as Error & { details?: { code?: string } })
          .details;
        if (errorDetails?.code === "IDEMPOTENT_DUPLICATE") {
          toast({
            title: "Duplicate Request",
            description: "This reward was already processed",
          });
          // Close dialog but don't show error
          onOpenChange(false);
          return;
        }

        // Show error toast
        toast({
          title: "Error",
          description: error.message || "Failed to award points",
        });
      },
    },
  );

  /**
   * Client-side form validation
   * Returns true if form is valid, false otherwise
   */
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Validate points
    const pointsNum = Number(points);
    if (!points || isNaN(pointsNum) || pointsNum < 1) {
      newErrors.points = "Points must be at least 1";
    }

    // Validate reason
    if (!reason || reason.trim().length < 10) {
      newErrors.reason = "Reason must be at least 10 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Form submission handler
   * Validates form and triggers mutation
   */
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Client-side validation
    if (!validateForm()) {
      return;
    }

    // Trigger mutation
    awardPoints.mutate({
      playerId,
      pointsChange: Number(points),
      reason: reason.trim(),
    });
  };

  /**
   * Reset form when dialog opens/closes
   */
  React.useEffect(() => {
    if (!open) {
      setPoints("");
      setReason("");
      setErrors({});
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Award Loyalty Points</DialogTitle>
          <DialogDescription>
            Manually award loyalty points to {playerName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Player Info Summary */}
          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Player:</span>
              <span className="font-medium">{playerName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current Balance:</span>
              <span className="font-medium">{currentBalance} pts</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current Tier:</span>
              <span className="font-medium">{currentTier}</span>
            </div>
          </div>

          {/* Points Input */}
          <div className="space-y-2">
            <Label htmlFor="points" className="required">
              Points to Award
            </Label>
            <Input
              id="points"
              name="points"
              type="number"
              min="1"
              step="1"
              placeholder="Enter points (e.g., 100)"
              value={points}
              onChange={(e) => {
                setPoints(e.target.value);
                if (errors.points) {
                  setErrors((prev) => ({ ...prev, points: undefined }));
                }
              }}
              aria-invalid={!!errors.points}
              aria-describedby={errors.points ? "points-error" : undefined}
              disabled={awardPoints.isPending}
              className={errors.points ? "border-destructive" : ""}
            />
            {errors.points && (
              <p
                id="points-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.points}
              </p>
            )}
          </div>

          {/* Reason Textarea */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="required">
              Reason
            </Label>
            <textarea
              id="reason"
              name="reason"
              rows={4}
              placeholder="Enter reason for manual reward (min 10 characters)"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (errors.reason) {
                  setErrors((prev) => ({ ...prev, reason: undefined }));
                }
              }}
              aria-invalid={!!errors.reason}
              aria-describedby={errors.reason ? "reason-error" : undefined}
              disabled={awardPoints.isPending}
              className={`flex min-h-[80px] w-full rounded-md border ${
                errors.reason ? "border-destructive" : "border-input"
              } bg-transparent px-3 py-2 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none`}
            />
            {errors.reason && (
              <p
                id="reason-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.reason}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {reason.length}/10 characters minimum
            </p>
          </div>

          {/* Form Actions */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={awardPoints.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={awardPoints.isPending}>
              {awardPoints.isPending ? "Awarding..." : "Award Points"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
