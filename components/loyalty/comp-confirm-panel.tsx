/**
 * Comp Confirm Panel
 *
 * Confirmation panel for points_comp reward issuance.
 * Supports variable-amount comps with dollar input, auto-conversion display,
 * balance preview, and conditional overdraw toggle.
 *
 * Amount contract: Input displays DOLLARS, state stores INTEGER CENTS.
 * Example: user enters 35.00 → stores 3500 → service receives faceValueCents=3500
 *
 * @see PRD-052 WS4 — Issuance UI
 * @see EXEC-053 WS2 — Variable-Amount Comp Enhancement
 */

'use client';

import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { RewardCatalogDTO } from '@/services/loyalty/reward/dtos';

// === Types ===

export interface CompConfirmPanelProps {
  /** Selected reward from catalog */
  reward: RewardCatalogDTO;

  /** Player's current points balance */
  currentBalance: number;

  /** Default points cost from catalog (pre-fills dollar input) */
  defaultPointsCost: number;

  /** Whether the issuance mutation is in progress */
  isPending: boolean;

  /** Callback to confirm issuance with resolved amount and overdraw flag */
  onConfirm: (faceValueCents: number, allowOverdraw: boolean) => void;

  /** Callback to go back to reward selection */
  onBack: () => void;

  /** DB-sourced valuation rate (cents per loyalty point) — PRD-053 */
  centsPerPoint: number;

  /** True when no active valuation policy exists for the casino */
  policyMissing?: boolean;
}

// === Helpers ===

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// === Component ===

/**
 * Confirmation panel for comp (points_comp) reward issuance.
 *
 * Displays:
 * - Dollar amount input (primary interaction — pit boss thinks in dollars)
 * - Auto-converted points display
 * - Current balance and post-debit balance preview
 * - Overdraw toggle (visible when debit exceeds balance, role-governed)
 */
export function CompConfirmPanel({
  reward,
  currentBalance,
  defaultPointsCost,
  isPending,
  onConfirm,
  onBack,
  centsPerPoint,
  policyMissing = false,
}: CompConfirmPanelProps) {
  // State: amount in integer cents, pre-filled from catalog default
  const [amountCents, setAmountCents] = useState(
    defaultPointsCost * centsPerPoint,
  );
  const [allowOverdraw, setAllowOverdraw] = useState(false);

  // Derived values — computed during render, no useEffect
  const pointsCost = Math.ceil(amountCents / centsPerPoint);
  const postDebitBalance = currentBalance - pointsCost;
  const isInsufficientBalance = postDebitBalance < 0;

  // Dollar input change handler: normalize to integer cents
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (Number.isNaN(parsed) || parsed < 0) {
      setAmountCents(0);
      return;
    }
    setAmountCents(Math.round(parsed * 100));
  };

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

      {/* Policy missing error state (PRD-053 Flow 2) */}
      {policyMissing && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">
                Valuation policy not configured
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                No active valuation policy found for this casino. Contact your
                system administrator to configure a redemption rate before
                issuing comps.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Reward details */}
      <div className="rounded-lg border-2 border-border/50 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h3
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            {reward.name}
          </h3>
          <Badge variant="secondary">Comp</Badge>
        </div>

        {/* Dollar amount input */}
        <div className="space-y-1.5">
          <label
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            style={{ fontFamily: 'monospace' }}
            htmlFor="comp-amount"
          >
            Comp Amount
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              id="comp-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={(amountCents / 100).toFixed(2)}
              onChange={handleAmountChange}
              disabled={isPending}
              className="pl-7 tabular-nums"
              style={{ fontFamily: 'monospace' }}
            />
          </div>
        </div>

        {/* Auto-conversion display */}
        <div
          className="text-xs text-muted-foreground tabular-nums"
          style={{ fontFamily: 'monospace' }}
        >
          {formatDollars(amountCents)} = {pointsCost.toLocaleString()} points
          (at ${(centsPerPoint / 100).toFixed(2)}/pt)
        </div>

        {/* Balance preview */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Current balance</span>
            <span
              className="font-medium tabular-nums"
              style={{ fontFamily: 'monospace' }}
            >
              {currentBalance.toLocaleString()} pts
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">After issuance</span>
            <span
              className={`font-medium tabular-nums ${isInsufficientBalance ? 'text-destructive' : 'text-emerald-500'}`}
              style={{ fontFamily: 'monospace' }}
            >
              {postDebitBalance.toLocaleString()} pts
            </span>
          </div>
        </div>
      </div>

      {/* Insufficient balance warning + overdraw toggle */}
      {isInsufficientBalance && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Player has insufficient points balance (
              {currentBalance.toLocaleString()} pts available,{' '}
              {pointsCost.toLocaleString()} pts needed).
            </p>
          </div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="allow-overdraw"
              className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400"
              style={{ fontFamily: 'monospace' }}
            >
              Allow Overdraw
            </label>
            <Switch
              id="allow-overdraw"
              checked={allowOverdraw}
              onCheckedChange={setAllowOverdraw}
              disabled={isPending}
            />
          </div>
        </div>
      )}

      {/* Confirm button */}
      <Button
        className="w-full"
        onClick={() => onConfirm(amountCents, allowOverdraw)}
        disabled={
          isPending ||
          policyMissing ||
          amountCents <= 0 ||
          (isInsufficientBalance && !allowOverdraw)
        }
      >
        {isPending
          ? 'Issuing...'
          : `Confirm ${formatDollars(amountCents)} Comp`}
      </Button>
    </div>
  );
}
