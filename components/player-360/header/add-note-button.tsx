/**
 * Add Note Button Component
 *
 * Header action button for opening the note composer.
 * Part of the Player 360 header actions.
 *
 * @see PRD-023 Player 360 Panels v0 - WS6
 */

'use client';

import { FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// === Props ===

export interface AddNoteButtonProps {
  /** Handler for click action */
  onClick: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Compact mode (icon only) */
  compact?: boolean;
}

// === Component ===

/**
 * Button to open the note composer.
 *
 * @example
 * ```tsx
 * function PlayerHeader({ playerId }: { playerId: string }) {
 *   const [showNoteComposer, setShowNoteComposer] = useState(false);
 *
 *   return (
 *     <div className="flex items-center gap-2">
 *       <AddNoteButton onClick={() => setShowNoteComposer(true)} />
 *     </div>
 *   );
 * }
 * ```
 */
export function AddNoteButton({
  onClick,
  disabled = false,
  compact = false,
}: AddNoteButtonProps) {
  const button = (
    <Button
      variant="outline"
      size={compact ? 'icon' : 'sm'}
      onClick={onClick}
      disabled={disabled}
      className="gap-1.5"
      data-testid="add-note-button"
    >
      <FileText className="w-4 h-4" />
      {!compact && <span>Add Note</span>}
    </Button>
  );

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>Add Note</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
