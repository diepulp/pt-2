/**
 * Issue Reward Button Component
 *
 * Header action button for issuing rewards.
 * Opens the IssueRewardDrawer for unified reward issuance.
 * Integrates Vector C print fulfillment via usePrintReward hook.
 *
 * @see PRD-052 WS4 — Issuance UI
 * @see PRD-053 — Reward Instrument Fulfillment
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
import { usePrintReward } from '@/lib/print/hooks/use-print-reward';
import type { PrintInvocationMode, PrintState } from '@/lib/print/types';
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
  const {
    print,
    state: printState,
    error: printError,
    reset: resetPrint,
  } = usePrintReward();

  const handleClick = () => {
    onClick?.();
    resetPrint();
    setDrawerOpen(true);
  };

  // Auto-print handler: fires on fresh issuance via onFulfillmentReady
  const handleFulfillmentReady = (payload: FulfillmentPayload) => {
    onFulfillmentReady?.(payload);
    print(payload, 'auto_attempt');
  };

  // Manual print handler: passed to IssuanceResultPanel's Print button
  const handleManualPrint = (
    payload: FulfillmentPayload,
    mode: PrintInvocationMode,
  ) => {
    print(payload, mode);
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
          printState={printState}
          onPrint={handleManualPrint}
          centsPerPoint={centsPerPoint}
          policyMissing={policyMissing}
        />
      )}
    </>
  );
}
