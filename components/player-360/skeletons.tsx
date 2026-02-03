/**
 * Player 360 Dashboard Skeleton Components (WS-UX-D)
 *
 * Loading skeleton components for the Player 360 dashboard.
 * Provides visual feedback during data fetching.
 *
 * @see player-360-crm-dashboard-ux-ui-baselines.md
 * @see EXEC-SPEC-029.md WS-UX-D
 */

'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// === Timeline Skeletons ===

interface TimelineCardSkeletonProps {
  className?: string;
}

/**
 * Skeleton for a single collapsed timeline card.
 */
export function TimelineCardSkeleton({ className }: TimelineCardSkeletonProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg',
        'border border-border/30 bg-card/30',
        className,
      )}
    >
      {/* Icon placeholder */}
      <Skeleton className="h-8 w-8 rounded-lg shrink-0" />

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Summary line */}
        <Skeleton className="h-4 w-3/4" />
        {/* Timestamp + category chip */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>

      {/* Amount (optional) */}
      <Skeleton className="h-4 w-16 shrink-0" />
    </div>
  );
}

interface TimelineListSkeletonProps {
  /** Number of skeleton cards to show */
  count?: number;
  className?: string;
}

/**
 * Skeleton for timeline list.
 * Shows multiple card skeletons with day grouping.
 */
export function TimelineListSkeleton({
  count = 5,
  className,
}: TimelineListSkeletonProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Day header skeleton */}
      <div className="flex items-center gap-2 px-1">
        <Skeleton className="h-4 w-20" />
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {/* Card skeletons */}
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <TimelineCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// === Filter Bar Skeleton ===

interface FilterBarSkeletonProps {
  className?: string;
}

/**
 * Skeleton for timeline filter bar.
 */
export function FilterBarSkeleton({ className }: FilterBarSkeletonProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3',
        'border-b border-border/40 bg-card/30',
        className,
      )}
    >
      {/* Date range dropdown */}
      <Skeleton className="h-9 w-36" />

      {/* Event type chips */}
      <div className="flex items-center gap-2 flex-1 overflow-hidden">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-18 rounded-full" />
        <Skeleton className="h-7 w-14 rounded-full" />
      </div>

      {/* Clear button */}
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

// === Metrics Rail Skeletons ===

interface MetricTileSkeletonProps {
  className?: string;
}

/**
 * Skeleton for a single metric tile.
 */
export function MetricTileSkeleton({ className }: MetricTileSkeletonProps) {
  return (
    <div
      className={cn(
        'space-y-2 p-3 rounded-lg',
        'border border-border/30 bg-card/30',
        className,
      )}
    >
      {/* Label */}
      <Skeleton className="h-3 w-20" />
      {/* Value */}
      <Skeleton className="h-7 w-24" />
      {/* Delta */}
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

interface MetricsRailSkeletonProps {
  /** Number of metric tiles */
  count?: number;
  className?: string;
}

/**
 * Skeleton for metrics rail.
 */
export function MetricsRailSkeleton({
  count = 8,
  className,
}: MetricsRailSkeletonProps) {
  return (
    <div className={cn('p-4 space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-5 w-32" />
      </div>

      {/* Metric tiles */}
      <div className="grid gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <MetricTileSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// === Collaboration Rail Skeletons ===

interface NoteSkeletonProps {
  className?: string;
}

/**
 * Skeleton for a single note card.
 */
export function NoteSkeleton({ className }: NoteSkeletonProps) {
  return (
    <div
      className={cn(
        'space-y-2 p-3 rounded-lg',
        'border border-border/30 bg-card/30',
        className,
      )}
    >
      {/* Author + timestamp */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      {/* Content */}
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

interface CollaborationRailSkeletonProps {
  className?: string;
}

/**
 * Skeleton for collaboration rail.
 */
export function CollaborationRailSkeleton({
  className,
}: CollaborationRailSkeletonProps) {
  return (
    <div className={cn('p-4 space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-5 w-28" />
      </div>

      {/* Note composer */}
      <div className="space-y-2">
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="flex justify-between">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/40" />

      {/* Tags section */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-12" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-14 rounded-full" />
          <Skeleton className="h-6 w-18 rounded-full" />
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/40" />

      {/* Recent notes */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <NoteSkeleton />
        <NoteSkeleton />
      </div>
    </div>
  );
}

// === Header Skeleton ===

interface HeaderSkeletonProps {
  className?: string;
}

/**
 * Skeleton for player identity header.
 */
export function HeaderSkeleton({ className }: HeaderSkeletonProps) {
  return (
    <div className={cn('flex items-center gap-4 p-4', className)}>
      {/* Avatar */}
      <Skeleton className="h-12 w-12 rounded-xl shrink-0" />

      {/* Name + ID */}
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-6 w-48" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}

// === Full Dashboard Skeleton ===

interface DashboardSkeletonProps {
  className?: string;
}

/**
 * Full dashboard skeleton for initial load state.
 */
export function DashboardSkeleton({ className }: DashboardSkeletonProps) {
  return (
    <div className={cn('flex flex-col h-full w-full', className)}>
      {/* Header */}
      <div className="shrink-0 border-b border-border/40">
        <HeaderSkeleton />
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left rail */}
        <div className="hidden lg:block w-72 xl:w-80 shrink-0 border-r border-border/40">
          <MetricsRailSkeleton />
        </div>

        {/* Center */}
        <div className="flex-1 flex flex-col min-w-0">
          <FilterBarSkeleton />
          <div className="flex-1 overflow-y-auto p-4">
            <TimelineListSkeleton count={8} />
          </div>
        </div>

        {/* Right rail */}
        <div className="hidden xl:block w-80 shrink-0 border-l border-border/40">
          <CollaborationRailSkeleton />
        </div>
      </div>
    </div>
  );
}

// === Loading Spinner ===

interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Optional label */
  label?: string;
  className?: string;
}

/**
 * Centered loading spinner with optional label.
 */
export function LoadingSpinner({
  size = 'md',
  label,
  className,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        className,
      )}
    >
      <div
        className={cn(
          'motion-safe:animate-spin rounded-full border-2 border-border border-t-accent',
          sizeClasses[size],
        )}
        role="status"
        aria-label="Loading"
      />
      {label && (
        <p className="text-sm text-muted-foreground motion-safe:animate-pulse">
          {label}
        </p>
      )}
    </div>
  );
}

// === Inline Loading ===

interface InlineLoadingProps {
  /** Loading text */
  text?: string;
  className?: string;
}

/**
 * Inline loading indicator for "Loading more..." states.
 */
export function InlineLoading({
  text = 'Loading...',
  className,
}: InlineLoadingProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 py-4 text-muted-foreground',
        className,
      )}
    >
      <div
        className="h-4 w-4 motion-safe:animate-spin rounded-full border-2 border-border border-t-accent"
        role="status"
        aria-label="Loading"
      />
      <span className="text-sm">{text}</span>
    </div>
  );
}
