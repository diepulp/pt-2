'use client';

import { Loader2, Power } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  canOpenSession,
  type TableSessionDTO,
  useOpenTableSession,
} from '@/hooks/table-context/use-table-session';
import { cn } from '@/lib/utils';

interface TablePowerToggleProps {
  tableId: string;
  session: TableSessionDTO | null;
  /** Opens the close-session dialog */
  onCloseRequest: () => void;
  /** Opens the activation drawer for OPEN sessions (PRD-059) */
  onActivateRequest?: () => void;
  className?: string;
}

/**
 * Table Power Toggle — consolidated lifecycle control
 *
 * Single on/off button that manages the table session lifecycle:
 *   OFF (no session / CLOSED) → click → opens session → OPEN
 *   OPEN → click → opens activation drawer (PRD-059 custody gate)
 *   ACTIVE / RUNDOWN → click → opens close dialog
 *
 * Visual states:
 *   - OFF: muted zinc, no glow
 *   - OPEN: blue pulse (awaiting activation)
 *   - ON (ACTIVE or RUNDOWN): emerald glow + outer pulse ring
 *
 * Replaces the three separate SessionActionButtons (Open, Rundown, Close).
 */
export function TablePowerToggle({
  tableId,
  session,
  onCloseRequest,
  onActivateRequest,
  className,
}: TablePowerToggleProps) {
  const openMutation = useOpenTableSession(tableId);

  const status = session?.status ?? null;
  const isOff = canOpenSession(session);
  const isOpen = status === 'OPEN';
  const isOn = status === 'ACTIVE' || status === 'RUNDOWN';
  const isPending = openMutation.isPending;

  // Determine the action for the current state
  const handleClick = React.useCallback(async () => {
    if (isPending) return;

    // OFF → Open session
    if (isOff) {
      try {
        await openMutation.mutateAsync();
        toast.success('Session opened', {
          description: 'Table session is now open',
        });
      } catch (error) {
        toast.error('Failed to open session', {
          description:
            error instanceof Error ? error.message : 'An error occurred',
        });
      }
      return;
    }

    // OPEN → Activate (PRD-059 custody gate)
    if (isOpen && onActivateRequest) {
      onActivateRequest();
      return;
    }

    // ACTIVE / RUNDOWN → Close dialog
    if (isOn) {
      onCloseRequest();
      return;
    }
  }, [
    isPending,
    isOff,
    isOpen,
    isOn,
    openMutation,
    onActivateRequest,
    onCloseRequest,
  ]);

  // Tooltip label describes the NEXT action
  const tooltipLabel = React.useMemo(() => {
    if (isPending) return 'Working...';
    if (isOff) return 'Open Session';
    if (isOpen) return 'Activate Table';
    if (isOn) return 'Close Session';
    return 'Table Power';
  }, [isPending, isOff, isOpen, isOn]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClick}
          disabled={isPending}
          aria-label={tooltipLabel}
          className={cn(
            'relative h-10 w-10 rounded-md',
            'transition-all duration-300',
            'focus-visible:ring-1 focus-visible:ring-accent/50',

            // OFF: muted, dormant
            isOff && [
              'text-zinc-500',
              'hover:text-zinc-300 hover:bg-zinc-500/10',
            ],

            // OPEN: blue pulse — awaiting activation
            isOpen && [
              'text-blue-400',
              'hover:bg-blue-500/15',
              'animate-pulse',
            ],

            // ON (ACTIVE / RUNDOWN): emerald — table is live
            isOn && ['text-emerald-400', 'hover:bg-emerald-500/15'],

            isPending && 'opacity-60 cursor-not-allowed',
            className,
          )}
        >
          {/* Outer glow ring for ON state */}
          {isOn && !isPending && (
            <span
              className="absolute inset-0 rounded-md border border-emerald-500/30 animate-pulse pointer-events-none"
              aria-hidden
            />
          )}

          {/* Ambient glow behind icon for non-OFF states */}
          {!isOff && !isPending && (
            <span
              className={cn(
                'absolute inset-1 rounded-sm blur-sm pointer-events-none opacity-30',
                isOpen && 'bg-blue-500',
                isOn && 'bg-emerald-500',
              )}
              aria-hidden
            />
          )}

          {isPending ? (
            <Loader2 className="!size-5 animate-spin" />
          ) : (
            <Power className="!size-5 relative z-10" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <span>{tooltipLabel}</span>
        <kbd className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-mono text-muted-foreground">
          ⌘T
        </kbd>
      </TooltipContent>
    </Tooltip>
  );
}
