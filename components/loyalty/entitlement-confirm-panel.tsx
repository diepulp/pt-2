/**
 * Entitlement Confirm Panel
 *
 * Confirmation panel for entitlement reward issuance.
 * Shows reward details with catalog-configured values.
 * NO tier language — uses "configured value" language per PRD §7.3.
 *
 * @see PRD-052 WS4 — Issuance UI
 */

'use client';

import { ArrowLeft } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { RewardCatalogDTO } from '@/services/loyalty/reward/dtos';

// === Types ===

export interface EntitlementConfirmPanelProps {
  /** Selected reward from catalog */
  reward: RewardCatalogDTO;

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

function formatInstrumentType(type: string): string {
  return type === 'match_play' ? 'Match Play' : 'Free Play';
}

// === Component ===

/**
 * Confirmation panel for entitlement reward issuance.
 *
 * Displays:
 * - Reward name and configured face value (from catalog config)
 * - Match wager amount (from catalog config)
 * - Instrument type
 *
 * Values are from catalog, not auto-derived from player tier.
 */
export function EntitlementConfirmPanel({
  reward,
  isPending,
  onConfirm,
  onBack,
}: EntitlementConfirmPanelProps) {
  const metadata = reward.metadata as Record<string, unknown>;
  const faceValueCents =
    typeof metadata?.face_value_cents === 'number'
      ? metadata.face_value_cents
      : null;
  const matchWagerCents =
    typeof metadata?.match_wager_cents === 'number'
      ? metadata.match_wager_cents
      : null;
  const instrumentType =
    typeof metadata?.instrument_type === 'string'
      ? metadata.instrument_type
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
          <Badge variant="secondary">Entitlement</Badge>
        </div>

        {instrumentType && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Instrument type</span>
            <span className="font-medium">
              {formatInstrumentType(instrumentType)}
            </span>
          </div>
        )}

        {faceValueCents !== null && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Configured face value</span>
            <span className="font-medium">{formatCents(faceValueCents)}</span>
          </div>
        )}

        {matchWagerCents !== null && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Configured match wager
            </span>
            <span className="font-medium">{formatCents(matchWagerCents)}</span>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Values shown are from the reward catalog configuration.
      </p>

      {/* Confirm button */}
      <Button
        className="w-full"
        onClick={() => onConfirm()}
        disabled={isPending}
      >
        {isPending ? 'Issuing...' : 'Confirm Entitlement Issuance'}
      </Button>
    </div>
  );
}
