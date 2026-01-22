/**
 * Player 360 Dashboard Empty & Error States (WS-UX-D)
 *
 * Empty state and error state components for the Player 360 dashboard.
 * Provides clear feedback and actionable recovery options.
 *
 * @see player-360-crm-dashboard-ux-ui-baselines.md §7
 * @see EXEC-SPEC-029.md WS-UX-D
 */

"use client";

import {
  AlertCircle,
  Calendar,
  FileText,
  Filter,
  History,
  RefreshCw,
  Search,
  Tag,
  UserX,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// === Base Empty State ===

interface EmptyStateProps {
  /** Icon to display */
  icon: React.ReactNode;
  /** Main heading */
  title: string;
  /** Description text */
  description: string;
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Base empty state component with icon, text, and optional actions.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8",
        className,
      )}
    >
      <div className="w-16 h-16 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h4 className="text-sm font-medium text-foreground mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground max-w-[280px] mb-4">
        {description}
      </p>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2">
          {action && (
            <Button variant="default" size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="outline"
              size="sm"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// === Error State ===

interface ErrorStateProps {
  /** Error message */
  message: string;
  /** Optional correlation ID for support */
  correlationId?: string;
  /** Retry callback */
  onRetry?: () => void;
  className?: string;
}

/**
 * Error state with retry action and correlation ID.
 * Per UX baseline §7: "Error states with retry + correlation id"
 */
export function ErrorState({
  message,
  correlationId,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8",
        className,
      )}
    >
      <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
        <AlertCircle className="h-8 w-8 text-red-400/70" />
      </div>
      <h4 className="text-sm font-medium text-red-400 mb-1">
        Something went wrong
      </h4>
      <p className="text-xs text-muted-foreground max-w-[280px] mb-2">
        {message}
      </p>
      {correlationId && (
        <p className="text-[10px] font-mono text-muted-foreground/60 mb-4">
          ID: {correlationId}
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

// === Timeline Empty States ===

interface TimelineEmptyProps {
  /** Type of empty state */
  type: "no-events" | "no-results" | "no-player";
  /** Callback to widen date range */
  onWidenDateRange?: () => void;
  /** Callback to clear filters */
  onClearFilters?: () => void;
  /** Callback to select a player */
  onSelectPlayer?: () => void;
  className?: string;
}

/**
 * Timeline-specific empty states.
 * Per UX baseline §7: "Empty states with widen range button"
 */
export function TimelineEmpty({
  type,
  onWidenDateRange,
  onClearFilters,
  onSelectPlayer,
  className,
}: TimelineEmptyProps) {
  switch (type) {
    case "no-events":
      return (
        <EmptyState
          icon={<History className="h-8 w-8 text-muted-foreground/50" />}
          title="No events in this period"
          description="This player has no activity recorded for the selected date range."
          action={
            onWidenDateRange
              ? { label: "Widen date range", onClick: onWidenDateRange }
              : undefined
          }
          className={className}
        />
      );

    case "no-results":
      return (
        <EmptyState
          icon={<Filter className="h-8 w-8 text-muted-foreground/50" />}
          title="No matching events"
          description="No events match your current filters. Try adjusting your selection."
          action={
            onClearFilters
              ? { label: "Clear filters", onClick: onClearFilters }
              : undefined
          }
          className={className}
        />
      );

    case "no-player":
      return (
        <EmptyState
          icon={<Search className="h-8 w-8 text-muted-foreground/50" />}
          title="No player selected"
          description="Search for and select a player to view their timeline."
          action={
            onSelectPlayer
              ? { label: "Search players", onClick: onSelectPlayer }
              : undefined
          }
          className={className}
        />
      );

    default:
      return null;
  }
}

// === Metrics Empty States ===

interface MetricsEmptyProps {
  /** Reason for empty state */
  reason: "no-player" | "no-data" | "insufficient-data";
  className?: string;
}

/**
 * Metrics rail empty states.
 */
export function MetricsEmpty({ reason, className }: MetricsEmptyProps) {
  switch (reason) {
    case "no-player":
      return (
        <EmptyState
          icon={<UserX className="h-8 w-8 text-muted-foreground/50" />}
          title="No player selected"
          description="Select a player to view their performance metrics."
          className={className}
        />
      );

    case "no-data":
      return (
        <EmptyState
          icon={<Calendar className="h-8 w-8 text-muted-foreground/50" />}
          title="No metrics available"
          description="This player doesn't have any recorded activity yet."
          className={className}
        />
      );

    case "insufficient-data":
      return (
        <EmptyState
          icon={<History className="h-8 w-8 text-muted-foreground/50" />}
          title="Limited data"
          description="Not enough activity to calculate meaningful metrics. Check back after more visits."
          className={className}
        />
      );

    default:
      return null;
  }
}

// === Collaboration Empty States ===

interface NotesEmptyProps {
  /** Action to add first note */
  onAddNote?: () => void;
  className?: string;
}

/**
 * Notes section empty state.
 */
export function NotesEmpty({ onAddNote, className }: NotesEmptyProps) {
  return (
    <EmptyState
      icon={<FileText className="h-8 w-8 text-muted-foreground/50" />}
      title="No notes yet"
      description="Be the first to add a note about this player."
      action={onAddNote ? { label: "Add note", onClick: onAddNote } : undefined}
      className={className}
    />
  );
}

interface TagsEmptyProps {
  /** Action to add first tag */
  onAddTag?: () => void;
  className?: string;
}

/**
 * Tags section empty state.
 */
export function TagsEmpty({ onAddTag, className }: TagsEmptyProps) {
  return (
    <EmptyState
      icon={<Tag className="h-8 w-8 text-muted-foreground/50" />}
      title="No tags applied"
      description="Apply tags to categorize and quickly identify this player."
      action={onAddTag ? { label: "Add tag", onClick: onAddTag } : undefined}
      className={className}
    />
  );
}

// === Compact Empty States ===

interface CompactEmptyProps {
  /** Icon to display */
  icon: React.ReactNode;
  /** Short message */
  message: string;
  className?: string;
}

/**
 * Compact empty state for inline use.
 */
export function CompactEmpty({ icon, message, className }: CompactEmptyProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-3 px-4 text-muted-foreground",
        "rounded-lg border border-dashed border-border/50",
        className,
      )}
    >
      {icon}
      <span className="text-xs">{message}</span>
    </div>
  );
}

// === Timeline Error State ===

interface TimelineErrorProps {
  /** Error message */
  message: string;
  /** Correlation ID */
  correlationId?: string;
  /** Retry callback */
  onRetry?: () => void;
  className?: string;
}

/**
 * Timeline-specific error state.
 * Per UX baseline §7: "Timeline unavailable + retry + correlation id"
 */
export function TimelineError({
  message,
  correlationId,
  onRetry,
  className,
}: TimelineErrorProps) {
  return (
    <ErrorState
      message={message || "Timeline unavailable"}
      correlationId={correlationId}
      onRetry={onRetry}
      className={className}
    />
  );
}

// === No Permission State ===

interface NoPermissionProps {
  /** Resource user doesn't have permission to view */
  resource: string;
  className?: string;
}

/**
 * No permission state for RLS-protected resources.
 */
export function NoPermission({ resource, className }: NoPermissionProps) {
  return (
    <EmptyState
      icon={<AlertCircle className="h-8 w-8 text-amber-400/70" />}
      title="Access restricted"
      description={`You don't have permission to view ${resource}. Contact your supervisor if you need access.`}
      className={className}
    />
  );
}
