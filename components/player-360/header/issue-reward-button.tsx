/**
 * Issue Reward Button Component
 *
 * Header action button for issuing rewards.
 * Currently a stub - disabled until backend reward issuance is ready.
 *
 * @see PRD-023 Player 360 Panels v0 - WS6
 */

'use client';

import { Gift } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// === Props ===

export interface IssueRewardButtonProps {
  /** Handler for click action (optional - button disabled by default) */
  onClick?: () => void;
  /** Whether the feature is enabled (default: false - stub) */
  enabled?: boolean;
  /** Compact mode (icon only) */
  compact?: boolean;
}

// === Component ===

/**
 * Button to issue a reward to the player.
 *
 * NOTE: This is currently a stub. The button is disabled by default
 * until the backend reward issuance workflow is implemented.
 *
 * @example
 * ```tsx
 * function PlayerHeader({ playerId }: { playerId: string }) {
 *   return (
 *     <div className="flex items-center gap-2">
 *       <IssueRewardButton />
 *     </div>
 *   );
 * }
 * ```
 */
export function IssueRewardButton({
  onClick,
  enabled = false,
  compact = false,
}: IssueRewardButtonProps) {
  const button = (
    <Button
      variant="outline"
      size={compact ? 'icon' : 'sm'}
      onClick={onClick}
      disabled={!enabled}
      className="gap-1.5"
      data-testid="issue-reward-button"
    >
      <Gift className="w-4 h-4" />
      {!compact && <span>Issue Reward</span>}
    </Button>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>
          {enabled ? (
            <p>Issue a reward to this player</p>
          ) : (
            <p>Coming soon: Reward issuance</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
