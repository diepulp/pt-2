/**
 * Issuance Result Panel
 *
 * Displays success, failure, or duplicate states after reward issuance.
 * Fires onFulfillmentReady on fresh issuance for auto-print (Vector C).
 * Print button reflects printState from usePrintReward hook.
 *
 * @see PRD-052 WS4 — Issuance UI
 * @see PRD-053 — Reward Instrument Fulfillment
 */

'use client';

import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Printer,
} from 'lucide-react';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import type { PrintInvocationMode, PrintState } from '@/lib/print/types';
import type {
  CompIssuanceResult,
  EntitlementIssuanceResult,
  FulfillmentPayload,
  IssuanceResultDTO,
} from '@/services/loyalty';

// === Types ===

export interface IssuanceResultPanelProps {
  /** Issuance result from the mutation */
  result: IssuanceResultDTO | null;

  /** Error from the mutation */
  error: Error | null;

  /** Player context for fulfillment payload assembly */
  playerName: string;
  playerId: string;
  playerTier: string;
  casinoName: string;
  staffName: string;

  /** Callback fired on success with fulfillment payload (auto-fire on fresh issuance) */
  onFulfillmentReady?: (payload: FulfillmentPayload) => void;

  /** Print state from usePrintReward hook (Vector C) */
  printState?: PrintState;

  /** Manual print callback (Vector C) */
  onPrint?: (payload: FulfillmentPayload, mode: PrintInvocationMode) => void;

  /** Callback to close the drawer */
  onClose: () => void;
}

// === Helpers ===

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function assembleCompFulfillment(
  result: CompIssuanceResult,
  context: {
    playerName: string;
    playerId: string;
    casinoName: string;
    staffName: string;
  },
): FulfillmentPayload {
  return {
    family: 'points_comp',
    ledger_id: result.ledgerId,
    reward_id: result.rewardId,
    reward_code: result.rewardCode,
    reward_name: result.rewardName,
    face_value_cents: result.faceValueCents,
    points_redeemed: result.pointsDebited,
    balance_after: result.balanceAfter,
    player_name: context.playerName,
    player_id: context.playerId,
    casino_name: context.casinoName,
    staff_name: context.staffName,
    issued_at: result.issuedAt,
  };
}

function assembleEntitlementFulfillment(
  result: EntitlementIssuanceResult,
  context: {
    playerName: string;
    playerId: string;
    playerTier: string;
    casinoName: string;
    staffName: string;
  },
): FulfillmentPayload {
  return {
    family: 'entitlement',
    coupon_id: result.couponId,
    validation_number: result.validationNumber,
    reward_id: result.rewardId,
    reward_code: result.rewardCode,
    reward_name: result.rewardName,
    face_value_cents: result.faceValueCents,
    required_match_wager_cents: result.matchWagerCents,
    expires_at: result.expiresAt,
    player_name: context.playerName,
    player_id: context.playerId,
    player_tier: context.playerTier,
    casino_name: context.casinoName,
    staff_name: context.staffName,
    issued_at: result.issuedAt,
  };
}

function getErrorMessage(error: Error): string {
  const fetchError = error as Error & { code?: string };
  switch (fetchError.code) {
    case 'LOYALTY_INSUFFICIENT_BALANCE':
      return 'Insufficient points balance for this comp.';
    case 'LOYALTY_REWARD_INACTIVE':
      return 'This reward is no longer active. Please select a different reward.';
    case 'LOYALTY_REWARD_NOT_FOUND':
      return 'Reward not found in the catalog.';
    case 'LOYALTY_UNAUTHORIZED':
      return 'You do not have permission to issue rewards.';
    case 'LOYALTY_CATALOG_CONFIG_INVALID':
      return 'Reward catalog configuration is incomplete. Contact an administrator.';
    case 'LOYALTY_FULFILLMENT_ASSEMBLY_FAILED':
      return 'Failed to assemble the reward. Please try again.';
    default:
      return error.message || 'An unexpected error occurred.';
  }
}

/** Assemble payload from result + context */
function assemblePayload(
  result: IssuanceResultDTO,
  context: {
    playerName: string;
    playerId: string;
    playerTier: string;
    casinoName: string;
    staffName: string;
  },
): FulfillmentPayload {
  return result.family === 'points_comp'
    ? assembleCompFulfillment(result, context)
    : assembleEntitlementFulfillment(result, context);
}

// === Component ===

export function IssuanceResultPanel({
  result,
  error,
  playerName,
  playerId,
  playerTier,
  casinoName,
  staffName,
  onFulfillmentReady,
  printState,
  onPrint,
  onClose,
}: IssuanceResultPanelProps) {
  // DA P0-1 fix: ref guard ensures auto-fire fires exactly once per result
  const hasFiredRef = useRef(false);

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center text-center py-4">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <h3 className="mt-3 text-base font-semibold text-destructive">
            Issuance Failed
          </h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            {getErrorMessage(error)}
          </p>
        </div>
        <Button variant="outline" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  // No result yet
  if (!result) {
    return null;
  }

  const isDuplicate = result.isExisting;
  const context = { playerName, playerId, playerTier, casinoName, staffName };

  // Manual print handler
  const handlePrint = () => {
    if (!onPrint) {
      // Fallback: fire legacy onFulfillmentReady if no onPrint provided
      if (onFulfillmentReady) {
        onFulfillmentReady(assemblePayload(result, context));
      }
      return;
    }

    const payload = assemblePayload(result, context);
    const mode: PrintInvocationMode =
      printState === 'success' ? 'manual_reprint' : 'manual_print';
    onPrint(payload, mode);
  };

  // Auto-fire onFulfillmentReady once for fresh issuances (DA P0-1 fix)
  if (!isDuplicate && onFulfillmentReady && !hasFiredRef.current) {
    hasFiredRef.current = true;
    const payload = assemblePayload(result, context);
    queueMicrotask(() => onFulfillmentReady(payload));
  }

  // Print button label and state based on printState
  const getPrintButtonContent = () => {
    switch (printState) {
      case 'printing':
        return (
          <>
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            Printing...
          </>
        );
      case 'success':
        return (
          <>
            <Printer className="h-4 w-4 mr-1.5" />
            Print again
          </>
        );
      case 'error':
        return (
          <>
            <Printer className="h-4 w-4 mr-1.5" />
            Print failed — try again
          </>
        );
      default:
        return (
          <>
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Status icon and heading */}
      <div className="flex flex-col items-center text-center py-4">
        <CheckCircle2
          className={`h-10 w-10 ${isDuplicate ? 'text-amber-500' : 'text-emerald-500'}`}
        />
        <h3 className="mt-3 text-base font-semibold">
          {isDuplicate ? 'Already Issued' : 'Reward Issued'}
        </h3>
        {isDuplicate && (
          <p className="mt-1 text-xs text-muted-foreground">
            This reward was already issued today. Showing existing record.
          </p>
        )}
      </div>

      {/* Result details */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Reward</span>
          <span className="font-medium">{result.rewardName}</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Code</span>
          <span className="font-mono text-xs">{result.rewardCode}</span>
        </div>

        {result.family === 'points_comp' && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Points debited</span>
              <span className="font-medium">
                {result.pointsDebited.toLocaleString()} pts
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Balance after</span>
              <span className="font-medium">
                {result.balanceAfter.toLocaleString()} pts
              </span>
            </div>
            {result.faceValueCents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Face value</span>
                <span className="font-medium">
                  {formatCents(result.faceValueCents)}
                </span>
              </div>
            )}
          </>
        )}

        {result.family === 'entitlement' && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Validation #</span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs">
                  {result.validationNumber}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(result.validationNumber)
                      .catch(() => {
                        // Clipboard API may not be available
                      });
                  }}
                  aria-label="Copy validation number"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
            {result.faceValueCents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Face value</span>
                <span className="font-medium">
                  {formatCents(result.faceValueCents)}
                </span>
              </div>
            )}
            {result.matchWagerCents !== null && result.matchWagerCents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Match wager</span>
                <span className="font-medium">
                  {formatCents(result.matchWagerCents)}
                </span>
              </div>
            )}
            {result.expiresAt && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium">
                  {new Date(result.expiresAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </>
        )}

        <div className="flex justify-between text-sm border-t pt-2">
          <span className="text-muted-foreground">Issued at</span>
          <span className="text-xs text-muted-foreground">
            {new Date(result.issuedAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant={printState === 'error' ? 'destructive' : 'outline'}
          className="flex-1"
          onClick={handlePrint}
          disabled={printState === 'printing'}
        >
          {getPrintButtonContent()}
        </Button>
        <Button className="flex-1" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
