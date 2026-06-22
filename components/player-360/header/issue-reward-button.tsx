/**
 * Issue Reward Button Component
 *
 * Header action button for issuing rewards.
 * Opens the IssueRewardDrawer for unified reward issuance.
 *
 * Printing is MANUAL-FIRST and routes through the controlled action
 * `POST /api/v1/loyalty/printing` from inside the result panel (PRD-092 WS7,
 * GATE-UX-1 / DEC-004) — this surface no longer touches window.print() /
 * usePrintReward for the loyalty redemption path.
 *
 * @see PRD-052 WS4 — Issuance UI
 * @see PRD-053 — Reward Instrument Fulfillment
 * @see PRD-092 / EXEC-092 WS7 — controlled print
 * @see components/loyalty/issue-reward-drawer.tsx
 */

'use client';

import { Gift } from 'lucide-react';
import { useState } from 'react';

import { IssueRewardDrawer } from '@/components/loyalty/issue-reward-drawer';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useValuationRate } from '@/hooks/loyalty/use-loyalty-queries';
import { useAuth } from '@/hooks/use-auth';
import type { FulfillmentPayload } from '@/services/loyalty/dtos';

// === Props ===

export interface IssueRewardButtonProps {
  /** Handler for click action (optional — drawer manages its own state) */
  onClick?: () => void;
  /** Whether the feature is enabled (default: true) */
  enabled?: boolean;
  /** Compact mode (icon only) */
  compact?: boolean;
  /** Player ID to issue reward to */
  playerId?: string;
  /** Player display name */
  playerName?: string;
  /** Casino name for fulfillment context */
  casinoName?: string;
  /** Player's current loyalty points balance */
  currentBalance?: number;
  /** Player's current loyalty tier */
  currentTier?: string;
  /** Staff name for fulfillment context */
  staffName?: string;
  /** Associated visit ID for audit trail linkage */
  visitId?: string;
  /** Callback fired on successful issuance with fulfillment payload */
  onFulfillmentReady?: (payload: FulfillmentPayload) => void;
}

// === Component ===

export function IssueRewardButton({
  onClick,
  enabled = true,
  compact = false,
  playerId = '',
  playerName = 'Player',
  casinoName = '',
  currentBalance = 0,
  currentTier = '',
  staffName = '',
  visitId,
  onFulfillmentReady,
}: IssueRewardButtonProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { casinoId } = useAuth();
  const { centsPerPoint, policyMissing } = useValuationRate(
    casinoId ?? undefined,
  );

  const handleClick = () => {
    onClick?.();
    setDrawerOpen(true);
  };

  // Notification only (DEC-004): forwards the payload to the parent but does NOT
  // trigger a print. Printing is operator-initiated in the result panel via the
  // controlled action.
  const handleFulfillmentReady = (payload: FulfillmentPayload) => {
    onFulfillmentReady?.(payload);
  };

  const button = (
    <Button
      variant="outline"
      size={compact ? 'icon' : 'sm'}
      onClick={handleClick}
      disabled={!enabled}
      className="gap-1.5"
      aria-label={compact ? 'Issue reward' : undefined}
      data-testid="issue-reward-button"
    >
      <Gift className="w-4 h-4" />
      {!compact && <span>Issue Reward</span>}
    </Button>
  );

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            {enabled ? (
              <p>Issue a reward to this player</p>
            ) : (
              <p>Reward issuance is not available</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {enabled && (
        <IssueRewardDrawer
          playerId={playerId}
          playerName={playerName}
          casinoName={casinoName}
          currentBalance={currentBalance}
          currentTier={currentTier}
          staffName={staffName}
          visitId={visitId}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onFulfillmentReady={handleFulfillmentReady}
          centsPerPoint={centsPerPoint}
          policyMissing={policyMissing}
        />
      )}
    </>
  );
}
