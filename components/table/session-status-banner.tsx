'use client';

import { Activity, Calendar, Clock, User } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  getSessionStatusColor,
  getSessionStatusLabel,
  type TableSessionDTO,
} from '@/hooks/table-context/use-table-session';
import { cn } from '@/lib/utils';

interface SessionStatusBannerProps {
  session: TableSessionDTO | null;
  isLoading?: boolean;
  className?: string;
}

/**
 * Session Status Banner
 *
 * Displays the current session status for a gaming table.
 * Shows session state, opened time, and who opened it.
 *
 * @see PRD-TABLE-SESSION-LIFECYCLE-MVP
 */
export function SessionStatusBanner({
  session,
  isLoading,
  className,
}: SessionStatusBannerProps) {
  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2',
          'rounded-md border border-border/50',
          'bg-card/50 backdrop-blur-sm',
          'animate-pulse',
          className,
        )}
      >
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
      </div>
    );
  }

  // No active session
  if (!session) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2',
          'rounded-md border border-border/50',
          'bg-card/30 backdrop-blur-sm',
          className,
        )}
        role="status"
        aria-label="No active session"
      >
        <Badge variant="outline" className="gap-1.5">
          <Activity className="size-3" />
          No Session
        </Badge>
        <span className="text-xs text-muted-foreground">
          Table session not started
        </span>
      </div>
    );
  }

  const statusLabel = getSessionStatusLabel(session.status);
  const statusColor = getSessionStatusColor(session.status);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2',
        'rounded-md border border-border/50',
        'bg-gradient-to-r from-card/60 to-card/30',
        'backdrop-blur-sm',
        className,
      )}
      role="status"
      aria-label={`Session status: ${statusLabel}`}
    >
      {/* Status indicator with subtle glow */}
      <div className="relative">
        <Badge variant={statusColor} className="gap-1.5">
          <Activity className="size-3" />
          {statusLabel}
        </Badge>
        {session.status === 'ACTIVE' && (
          <span className="absolute -right-0.5 -top-0.5 flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
        )}
      </div>

      {/* Session details */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {/* Gaming day */}
        <span className="flex items-center gap-1">
          <Calendar className="size-3" />
          {session.gaming_day}
        </span>

        {/* Opened time */}
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {formatTime(session.opened_at)}
        </span>

        {/* Opened by */}
        {session.opened_by_staff_id && (
          <span className="hidden items-center gap-1 sm:flex">
            <User className="size-3" />
            <span className="truncate max-w-[100px]">
              {formatStaffId(session.opened_by_staff_id)}
            </span>
          </span>
        )}

        {/* Rundown indicator */}
        {session.status === 'RUNDOWN' && session.rundown_started_at && (
          <span className="flex items-center gap-1 text-amber-500">
            <Clock className="size-3" />
            Rundown: {formatTime(session.rundown_started_at)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Compact variant for smaller viewports
 */
export function SessionStatusBannerCompact({
  session,
  isLoading,
  className,
}: SessionStatusBannerProps) {
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1',
          'rounded border border-border/40',
          'bg-card/30 animate-pulse',
          className,
        )}
      >
        <div className="h-4 w-12 rounded bg-muted" />
      </div>
    );
  }

  if (!session) {
    return (
      <Badge variant="outline" className={cn('gap-1', className)}>
        <Activity className="size-3" />
        None
      </Badge>
    );
  }

  const statusLabel = getSessionStatusLabel(session.status);
  const statusColor = getSessionStatusColor(session.status);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Badge variant={statusColor} className="gap-1">
        <Activity className="size-3" />
        {statusLabel}
      </Badge>
      <span className="text-[10px] text-muted-foreground">
        {formatTime(session.opened_at)}
      </span>
    </div>
  );
}

// === Utility Functions ===

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '--:--';
  }
}

function formatStaffId(staffId: string): string {
  // Show abbreviated staff ID for privacy
  // In production, this would be replaced with staff name lookup
  return staffId.slice(0, 8) + '...';
}
