/**
 * Comp Confirm Panel
 *
 * Confirmation panel for points_comp reward issuance.
 * Shows reward details, points cost, and balance preview.
 *
 * @see PRD-052 WS4 — Issuance UI
 */

'use client';

import { AlertTriangle, ArrowLeft } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { RewardCatalogDTO } from '@/services/loyalty/reward/dtos';

// === Types ===

export interface CompConfirmPanelProps {
  /** Selected reward from catalog */
  reward: RewardCatalogDTO;

  /** Player's current points balance */
  currentBalance: number;

  /** Points cost for this comp (from price_points config) */
  pointsCost: number;

  /** Whether the issuance mutation is in progress */
  isPending: boolean;

  /** Callback to confirm issuance */
  onConfirm: () => void;

  /** Callback to go back to reward selection */
  onBack: () => void;
}

// === Helpers ===

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// === Component ===

/**
 * Confirmation panel for comp (points_comp) reward issuance.
 *
 * Displays:
 * - Reward name and face value
 * - Points cost
 * - Current balance and post-debit balance preview
 * - Insufficient balance warning (advisory only, non-blocking)
 */
export function CompConfirmPanel({
  reward,
  currentBalance,
  pointsCost,
  isPending,
  onConfirm,
  onBack,
}: CompConfirmPanelProps) {
  const postDebitBalance = currentBalance - pointsCost;
  const isInsufficientBalance = postDebitBalance < 0;

  const metadata = reward.metadata as Record<string, unknown>;
  const faceValueCents =
    typeof metadata?.face_value_cents === 'number'
      ? metadata.face_value_cents
      : null;

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={onBack}
        disabled={isPending}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to rewards
      </button>

      {/* Reward details */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{reward.name}</h3>
          <Badge variant="secondary">Comp</Badge>
        </div>

        {faceValueCents !== null && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Face value</span>
            <span className="font-medium">{formatCents(faceValueCents)}</span>
          </div>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Points cost</span>
          <span className="font-medium">{pointsCost.toLocaleString()} pts</span>
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Current balance</span>
            <span className="font-medium">
              {currentBalance.toLocaleString()} pts
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">After issuance</span>
            <span
              className={`font-medium ${isInsufficientBalance ? 'text-destructive' : 'text-emerald-500'}`}
            >
              {postDebitBalance.toLocaleString()} pts
            </span>
          </div>
        </div>
      </div>

      {/* Insufficient balance warning — advisory only per PRD §5.3 */}
      {isInsufficientBalance && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Player has insufficient points balance. The comp may still be issued
            if overdraw is permitted.
          </p>
        </div>
      )}

      {/* Confirm button */}
      <Button className="w-full" onClick={onConfirm} disabled={isPending}>
        {isPending ? 'Issuing...' : 'Confirm Comp Issuance'}
      </Button>
    </div>
  );
}
