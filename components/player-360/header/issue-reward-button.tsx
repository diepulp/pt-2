/**
 * Issue Reward Button Component
 *
 * Header action button for issuing rewards.
 * Opens the IssueRewardDrawer for unified reward issuance.
 *
 * @see PRD-052 WS4 — Issuance UI
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
  /** Callback fired on successful issuance with fulfillment payload */
  onFulfillmentReady?: (payload: FulfillmentPayload) => void;
}

// === Component ===

/**
 * Button to issue a reward to the player.
 * Opens a side drawer with the reward catalog and issuance flow.
 *
 * @example
 * ```tsx
 * function PlayerHeader({ playerId, player }: Props) {
 *   return (
 *     <div className="flex items-center gap-2">
 *       <IssueRewardButton
 *         playerId={playerId}
 *         playerName={player.name}
 *         compact
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
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
  onFulfillmentReady,
}: IssueRewardButtonProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleClick = () => {
    onClick?.();
    setDrawerOpen(true);
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
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onFulfillmentReady={onFulfillmentReady}
        />
      )}
    </>
  );
}
