'use client';

import {
  Banknote,
  ClipboardList,
  Coins,
  MessageSquarePlus,
  Settings2,
  StickyNote,
  UserCog,
  UserPlus,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TableSessionDTO } from '@/hooks/table-context/use-table-session';
import {
  getSessionStatusColor,
  getSessionStatusLabel,
} from '@/hooks/table-context/use-table-session';
import { cn } from '@/lib/utils';

import {
  PitMapSelector,
  PitMapSelectorCompact,
  type PitMapPit,
} from './pit-map-selector';

interface ToolbarAction {
  id: string;
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'accent' | 'muted';
}

interface ActionGroup {
  id: string;
  label: string;
  actions: ToolbarAction[];
}

interface TableToolbarProps {
  tableId: string;
  tableStatus: 'active' | 'inactive' | 'closed';
  /** Current table session for status badge (PRD-038A) */
  session?: TableSessionDTO | null;
  onNewSlip: () => void;
  onEditLimits: () => void;
  onEnrollPlayer?: () => void;
  className?: string;
  /** Pit navigation props */
  pits?: PitMapPit[];
  selectedPitId?: string | null;
  selectedTableId?: string | null;
  onSelectTable?: (tableId: string, pitId: string) => void;
  onSelectPit?: (pitId: string) => void;
}

/**
 * Table Toolbar - Loop-centric action surface for table operations
 *
 * Groups actions by operational loops:
 * - TABLE: Open/close, dealer assignment, settings
 * - SESSION: Player slips, active sessions
 * - FINANCE: Fills, drops, inventory
 */
export function TableToolbar({
  tableId,
  tableStatus,
  session,
  onNewSlip,
  onEditLimits,
  onEnrollPlayer,
  className,
  pits,
  selectedPitId,
  selectedTableId,
  onSelectTable,
  onSelectPit,
}: TableToolbarProps) {
  // Placeholder handlers for pending functionality
  const handlePlaceholder = React.useCallback((action: string) => {
    toast.info(`${action} — pending implementation`, {
      description: 'This feature is being developed',
      duration: 2000,
    });
  }, []);

  // Action groups aligned to core daily loops
  const actionGroups: ActionGroup[] = React.useMemo(
    () => [
      {
        id: 'table',
        label: 'TABLE',
        actions: [
          {
            id: 'assign-dealer',
            icon: UserCog,
            label: 'Assign Dealer',
            shortcut: '⌘D',
            onClick: () => handlePlaceholder('Assign dealer'),
          },
          {
            id: 'table-settings',
            icon: Settings2,
            label: 'Table Settings',
            onClick: onEditLimits,
          },
        ],
      },
      {
        id: 'session',
        label: 'SESSION',
        actions: [
          {
            id: 'new-slip',
            icon: ClipboardList,
            label: 'New Rating Slip',
            shortcut: '⌘N',
            onClick: onNewSlip,
            variant: 'accent',
          },
          {
            id: 'enroll-player',
            icon: UserPlus,
            label: 'Enroll Player',
            shortcut: '⌘E',
            onClick:
              onEnrollPlayer ?? (() => handlePlaceholder('Enroll player')),
          },
          {
            id: 'add-note',
            icon: StickyNote,
            label: 'Add Note',
            shortcut: 'N',
            onClick: () => handlePlaceholder('Add table note'),
          },
        ],
      },
      {
        id: 'finance',
        label: 'FINANCE',
        actions: [
          {
            id: 'log-fill',
            icon: Coins,
            label: 'Log Fill',
            shortcut: 'F',
            onClick: () => handlePlaceholder('Log chip fill'),
          },
          {
            id: 'log-drop',
            icon: Banknote,
            label: 'Log Drop',
            shortcut: 'D',
            onClick: () => handlePlaceholder('Log cash drop'),
          },
          {
            id: 'quick-action',
            icon: MessageSquarePlus,
            label: 'Quick Action',
            shortcut: '⌘K',
            onClick: () => handlePlaceholder('Command palette'),
          },
        ],
      },
    ],
    [onNewSlip, onEditLimits, onEnrollPlayer, handlePlaceholder],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'relative flex items-center gap-1 px-2 py-1.5',
          'rounded-lg border border-border/50',
          'bg-gradient-to-b from-card/80 to-card/40',
          'backdrop-blur-sm',
          className,
        )}
        role="toolbar"
        aria-label={`Table ${tableId} actions`}
      >
        {/* Industrial LED accent */}
        <div className="absolute top-0 left-2 right-2 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

        {/* Session status badge (PRD-038A) */}
        <Badge
          variant={session ? getSessionStatusColor(session.status) : 'outline'}
          className="text-[10px] font-medium shrink-0"
        >
          {session ? getSessionStatusLabel(session.status) : 'No Session'}
        </Badge>

        <Separator orientation="vertical" className="h-6 mx-1 bg-border/40" />

        {actionGroups.map((group, groupIndex) => (
          <React.Fragment key={group.id}>
            {/* Group separator */}
            {groupIndex > 0 && (
              <Separator
                orientation="vertical"
                className="h-6 mx-1 bg-border/40"
              />
            )}

            {/* Action group */}
            <div
              className="flex items-center gap-0.5"
              role="group"
              aria-label={group.label}
            >
              {/* Group label - subtle, abbreviated */}
              <span className="hidden sm:block px-1.5 text-[9px] font-medium tracking-widest text-zinc-950 uppercase select-none">
                {group.label}
              </span>

              {/* Actions */}
              {group.actions.map((action) => (
                <ToolbarButton key={action.id} action={action} />
              ))}
            </div>
          </React.Fragment>
        ))}

        {/* Spacer to push pit selector to the right */}
        <div className="flex-1" />

        {/* Pit Map Selector - Navigation (rightmost) */}
        {pits && pits.length > 0 && onSelectTable && onSelectPit && (
          <>
            <Separator
              orientation="vertical"
              className="h-6 mx-1 bg-border/40"
            />
            <PitMapSelector
              pits={pits}
              selectedPitId={selectedPitId ?? null}
              selectedTableId={selectedTableId ?? null}
              onSelectTable={onSelectTable}
              onSelectPit={onSelectPit}
            />
          </>
        )}

        {/* Bottom accent line */}
        <div className="absolute bottom-0 left-2 right-2 h-px bg-gradient-to-r from-transparent via-border/30 to-transparent" />
      </div>
    </TooltipProvider>
  );
}

/**
 * Individual toolbar button with tooltip
 */
function ToolbarButton({ action }: { action: ToolbarAction }) {
  const Icon = action.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={action.onClick}
          disabled={action.disabled}
          className={cn(
            'relative h-10 w-10 rounded-md',
            'transition-all duration-150',
            'hover:bg-accent/10 hover:text-accent',
            'focus-visible:ring-1 focus-visible:ring-accent/50',
            action.variant === 'accent' && [
              'text-accent',
              'hover:bg-accent/20',
              'after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2',
              'after:w-1 after:h-1 after:rounded-full after:bg-accent/60',
            ],
            action.variant === 'muted' && 'text-muted-foreground/60',
            action.disabled && 'opacity-40 cursor-not-allowed',
          )}
          aria-label={action.label}
        >
          <Icon className="!size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <span>{action.label}</span>
        {action.shortcut && (
          <kbd className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-mono text-muted-foreground">
            {action.shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Compact variant for smaller viewports
 */
export function TableToolbarCompact({
  tableId,
  tableStatus,
  session,
  onNewSlip,
  onEditLimits,
  onEnrollPlayer,
  className,
  pits,
  selectedPitId,
  selectedTableId,
  onSelectTable,
  onSelectPit,
}: TableToolbarProps) {
  const handlePlaceholder = React.useCallback((action: string) => {
    toast.info(`${action} — pending implementation`, {
      description: 'This feature is being developed',
      duration: 2000,
    });
  }, []);

  // Priority actions only for compact view
  const priorityActions: ToolbarAction[] = [
    {
      id: 'new-slip',
      icon: ClipboardList,
      label: 'New Slip',
      onClick: onNewSlip,
      variant: 'accent',
    },
    {
      id: 'enroll-player',
      icon: UserPlus,
      label: 'Enroll',
      onClick: onEnrollPlayer ?? (() => handlePlaceholder('Enroll player')),
    },
    {
      id: 'log-fill',
      icon: Coins,
      label: 'Fill',
      onClick: () => handlePlaceholder('Log fill'),
    },
    {
      id: 'log-drop',
      icon: Banknote,
      label: 'Drop',
      onClick: () => handlePlaceholder('Log drop'),
    },
    {
      id: 'settings',
      icon: Settings2,
      label: 'Settings',
      onClick: onEditLimits,
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'flex items-center justify-center gap-0.5 px-1.5 py-1',
          'rounded-md border border-border/40',
          'bg-card/30 backdrop-blur-sm',
          className,
        )}
        role="toolbar"
        aria-label={`Table ${tableId} quick actions`}
      >
        {/* Session status badge (PRD-038A) */}
        <Badge
          variant={session ? getSessionStatusColor(session.status) : 'outline'}
          className="text-[9px] font-medium shrink-0"
        >
          {session ? getSessionStatusLabel(session.status) : 'No Session'}
        </Badge>

        <Separator orientation="vertical" className="h-5 mx-0.5 bg-border/40" />

        {priorityActions.map((action) => (
          <ToolbarButton key={action.id} action={action} />
        ))}

        {/* Spacer to push pit selector to the right */}
        <div className="flex-1" />

        {/* Compact Pit Selector (rightmost) */}
        {pits && pits.length > 0 && onSelectTable && onSelectPit && (
          <>
            <Separator
              orientation="vertical"
              className="h-5 mx-0.5 bg-border/40"
            />
            <PitMapSelectorCompact
              pits={pits}
              selectedPitId={selectedPitId ?? null}
              selectedTableId={selectedTableId ?? null}
              onSelectTable={onSelectTable}
              onSelectPit={onSelectPit}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
