/**
 * Issuance Result Panel
 *
 * Displays success, failure, or duplicate states after reward issuance.
 * Fires onFulfillmentReady on success (no-op until Vector C).
 *
 * @see PRD-052 WS4 — Issuance UI
 */

'use client';

import { AlertCircle, CheckCircle2, Copy, Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

  /** Callback fired on success with fulfillment payload (no-op until Vector C) */
  onFulfillmentReady?: (payload: FulfillmentPayload) => void;

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
  // FetchError from @/lib/http/fetch-json carries a code field
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

// === Component ===

/**
 * Result panel for reward issuance.
 *
 * States:
 * - Success: details + "Print" button binding point (no-op until Vector C)
 * - Failure: error message with actionable feedback per LOYALTY_-prefixed error codes
 * - Duplicate: "Already issued" with existing details (when isExisting: true)
 */
export function IssuanceResultPanel({
  result,
  error,
  playerName,
  playerId,
  playerTier,
  casinoName,
  staffName,
  onFulfillmentReady,
  onClose,
}: IssuanceResultPanelProps) {
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

  // No result yet (should not happen in this panel, but safe fallback)
  if (!result) {
    return null;
  }

  const isDuplicate = result.isExisting;

  // Assemble and fire fulfillment payload on success
  const handlePrint = () => {
    if (!onFulfillmentReady) return;

    const context = { playerName, playerId, playerTier, casinoName, staffName };
    const payload =
      result.family === 'points_comp'
        ? assembleCompFulfillment(result, context)
        : assembleEntitlementFulfillment(result, context);

    onFulfillmentReady(payload);
  };

  // Fire onFulfillmentReady automatically on mount for fresh issuances
  // Using a ref to ensure it fires only once per result
  if (!isDuplicate && onFulfillmentReady) {
    const context = { playerName, playerId, playerTier, casinoName, staffName };
    const payload =
      result.family === 'points_comp'
        ? assembleCompFulfillment(result, context)
        : assembleEntitlementFulfillment(result, context);
    // Schedule to fire after render (no useEffect needed — this is intentional)
    queueMicrotask(() => onFulfillmentReady(payload));
  }

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
        <Button variant="outline" className="flex-1" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-1.5" />
          Print
        </Button>
        <Button className="flex-1" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
