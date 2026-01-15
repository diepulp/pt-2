'use client';

import { AlertTriangle, Loader2, Play, Square, StopCircle } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  canCloseSession,
  canOpenSession,
  canStartRundown,
  type TableSessionDTO,
  useOpenTableSession,
  useStartTableRundown,
} from '@/hooks/table-context/use-table-session';
import { cn } from '@/lib/utils';

interface SessionActionButtonsProps {
  tableId: string;
  session: TableSessionDTO | null;
  onCloseRequest: () => void;
  className?: string;
  variant?: 'default' | 'compact';
}

/**
 * Session Action Buttons
 *
 * Action buttons for table session lifecycle operations.
 * - Open Session: Creates new session (only if no active session)
 * - Start Rundown: Begins closing procedures (ACTIVE → RUNDOWN)
 * - Close Session: Opens close dialog (RUNDOWN/ACTIVE → CLOSED)
 *
 * @see PRD-TABLE-SESSION-LIFECYCLE-MVP
 */
export function SessionActionButtons({
  tableId,
  session,
  onCloseRequest,
  className,
  variant = 'default',
}: SessionActionButtonsProps) {
  const openMutation = useOpenTableSession(tableId);
  const rundownMutation = useStartTableRundown(session?.id ?? '', tableId);

  const canOpen = canOpenSession(session);
  const canRundown = canStartRundown(session);
  const canClose = canCloseSession(session);

  const handleOpenSession = React.useCallback(async () => {
    try {
      await openMutation.mutateAsync();
      toast.success('Session opened', {
        description: 'Table session is now active',
      });
    } catch (error) {
      toast.error('Failed to open session', {
        description:
          error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }, [openMutation]);

  const handleStartRundown = React.useCallback(async () => {
    if (!session) return;
    try {
      await rundownMutation.mutateAsync();
      toast.success('Rundown started', {
        description: 'Table is now in rundown mode',
      });
    } catch (error) {
      toast.error('Failed to start rundown', {
        description:
          error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }, [session, rundownMutation]);

  if (variant === 'compact') {
    return (
      <TooltipProvider delayDuration={150}>
        <div className={cn('flex items-center gap-1', className)}>
          {/* Open Session */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleOpenSession}
                disabled={!canOpen || openMutation.isPending}
                className={cn(
                  'h-8 w-8',
                  canOpen && 'text-emerald-500 hover:text-emerald-400',
                )}
              >
                {openMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open Session</TooltipContent>
          </Tooltip>

          {/* Start Rundown */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleStartRundown}
                disabled={!canRundown || rundownMutation.isPending}
                className={cn(
                  'h-8 w-8',
                  canRundown && 'text-amber-500 hover:text-amber-400',
                )}
              >
                {rundownMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <AlertTriangle className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Start Rundown</TooltipContent>
          </Tooltip>

          {/* Close Session */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onCloseRequest}
                disabled={!canClose}
                className={cn(
                  'h-8 w-8',
                  canClose && 'text-red-500 hover:text-red-400',
                )}
              >
                <StopCircle className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close Session</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Open Session */}
      <Button
        variant={canOpen ? 'default' : 'outline'}
        size="sm"
        onClick={handleOpenSession}
        disabled={!canOpen || openMutation.isPending}
        className={cn(
          'gap-1.5',
          canOpen && 'bg-emerald-600 hover:bg-emerald-700',
        )}
      >
        {openMutation.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Play className="size-4" />
        )}
        Open Session
      </Button>

      {/* Start Rundown */}
      <Button
        variant={canRundown ? 'secondary' : 'outline'}
        size="sm"
        onClick={handleStartRundown}
        disabled={!canRundown || rundownMutation.isPending}
        className={cn(
          'gap-1.5',
          canRundown && 'bg-amber-600 hover:bg-amber-700 text-white',
        )}
      >
        {rundownMutation.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <AlertTriangle className="size-4" />
        )}
        Start Rundown
      </Button>

      {/* Close Session */}
      <Button
        variant={canClose ? 'destructive' : 'outline'}
        size="sm"
        onClick={onCloseRequest}
        disabled={!canClose}
        className="gap-1.5"
      >
        <Square className="size-4" />
        Close Session
      </Button>
    </div>
  );
}
