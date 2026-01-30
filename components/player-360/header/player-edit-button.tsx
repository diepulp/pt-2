/**
 * Player Edit Button (WS4 - PRD-022-PATCH-OPTION-B)
 *
 * Button to trigger the PlayerEditModal from the Player 360 header.
 */

'use client';

import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PlayerEditButtonProps {
  /** Click handler to open the edit modal */
  onClick: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Optional variant */
  variant?: 'default' | 'outline' | 'ghost';
  /** Additional class names */
  className?: string;
}

export function PlayerEditButton({
  onClick,
  disabled = false,
  variant = 'outline',
  className,
}: PlayerEditButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            'gap-1.5',
            'hover:bg-accent/10 hover:border-accent/30',
            className,
          )}
          data-testid="edit-profile-button"
        >
          <Pencil className="h-4 w-4" />
          <span className="hidden sm:inline">Edit Profile</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Edit player profile</TooltipContent>
    </Tooltip>
  );
}
