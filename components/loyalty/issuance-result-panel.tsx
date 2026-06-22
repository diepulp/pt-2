/**
 * Issuance Result Panel
 *
 * Displays success, failure, or duplicate states after reward issuance.
 * Fires onFulfillmentReady on fresh issuance (notification only — NOT printing).
 *
 * Printing is MANUAL-FIRST (PRD-092 DEC-004): the operator must click Print; no
 * print fires on issuance. The print path routes through the controlled action
 * `POST /api/v1/loyalty/printing` via useControlledPrint (GATE-UX-1) — the legacy
 * window.print()/usePrintReward path is retired for the loyalty redemption flow.
 *
 * @see PRD-052 WS4 — Issuance UI
 * @see PRD-053 — Reward Instrument Fulfillment
 * @see PRD-092 / EXEC-092 WS7 — controlled print + terminal retry semantics
 */

'use client';

import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Printer,
  RotateCw,
} from 'lucide-react';
import { useRef } from 'react';

import { PrintOutcomeBadge } from '@/components/loyalty/print-outcome-badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useControlledPrint } from '@/hooks/loyalty/use-controlled-print';
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

  /**
   * Notification fired once on fresh issuance with the assembled payload.
   * Decoupled from printing (DEC-004) — it does NOT trigger a print.
   */
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

// === Controlled Print Actions ===

/**
 * Manual-first controlled print actions (PRD-092 WS7).
 *
 * - DEC-004: nothing prints until the operator clicks Print.
 * - DEC-008: `failed`/`unknown` are terminal+immutable — there is NO re-drive
 *   "Retry". A second physical copy is ONLY an explicit, nonce-bearing Reprint
 *   (forks a new attempt lineage). An `unknown` reprint is gated behind a
 *   duplicate-risk acknowledgement (the slip MAY already have printed).
 */
function PrintActions({
  payload,
  onClose,
}: {
  payload: FulfillmentPayload;
  onClose: () => void;
}) {
  const { print, reprint, state, outcome, failure, attempt } =
    useControlledPrint();

  const isSubmitting = state === 'submitting';
  const priorAttemptId = attempt?.printAttemptId ?? null;

  const doReprint = () => {
    if (!priorAttemptId) return;
    reprint(payload, { reprintOf: priorAttemptId });
  };

  // Before any send (or after a transport/HTTP error): manual Print / Try again.
  if (state === 'idle' || state === 'submitting' || state === 'error') {
    return (
      <div className="space-y-2">
        {state === 'error' && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <p className="min-w-0 break-words text-xs text-destructive">
              The print could not be sent. Check the print station, then try
              again.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => print(payload)}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4 mr-1.5" />
                {state === 'error' ? 'Try again' : 'Print'}
              </>
            )}
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  // Terminal outcome recorded: show the bounded badge + a Reprint affordance.
  return (
    <div className="space-y-3">
      <PrintOutcomeBadge status={outcome ?? 'unknown'} failure={failure} />
      <div className="flex gap-2">
        {outcome === 'unknown' ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="flex-1"
                disabled={!priorAttemptId}
              >
                <RotateCw className="h-4 w-4 mr-1.5" />
                Reprint
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Reprint — possible duplicate
                </AlertDialogTitle>
                <AlertDialogDescription>
                  The previous attempt&apos;s status is unknown — the slip may
                  already have printed. Reprinting will send a new copy.
                  Continue only if you have confirmed no slip was produced.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={doReprint}>
                  Reprint anyway
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            variant="outline"
            className="flex-1"
            onClick={doReprint}
            disabled={!priorAttemptId}
          >
            <RotateCw className="h-4 w-4 mr-1.5" />
            Reprint
          </Button>
        )}
        <Button className="flex-1" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
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
  const fulfillmentPayload = assemblePayload(result, context);

  // Notify the parent once for fresh issuances (notification only — DEC-004:
  // this does NOT trigger a print; printing is operator-initiated below).
  if (!isDuplicate && onFulfillmentReady && !hasFiredRef.current) {
    hasFiredRef.current = true;
    queueMicrotask(() => onFulfillmentReady(fulfillmentPayload));
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

      {/* Controlled print actions (manual-first; terminal-aware reprint) */}
      <PrintActions payload={fulfillmentPayload} onClose={onClose} />
    </div>
  );
}
