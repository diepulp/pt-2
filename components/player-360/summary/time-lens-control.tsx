/**
 * Time Lens Control Component
 *
 * Toggle buttons for selecting time period (30d, 90d, 12w).
 * Controls the time lens for summary metrics and activity chart.
 *
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import type { TimeLensRange } from '@/hooks/player-360';
import { cn } from '@/lib/utils';

// === Props ===

export interface TimeLensControlProps {
  /** Current time lens value */
  value: TimeLensRange;
  /** Change handler */
  onChange: (value: TimeLensRange) => void;
  /** Additional class names */
  className?: string;
}

// === Options ===

const timeLensOptions: { value: TimeLensRange; label: string }[] = [
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '12w', label: '12w' },
];

// === Component ===

/**
 * Time lens toggle control for adjusting data period.
 *
 * @example
 * ```tsx
 * function TimelineHeader() {
 *   const { timeLens, setTimeLens } = useTimelineFilter();
 *
 *   return (
 *     <div className="flex justify-between items-center">
 *       <h2>Activity</h2>
 *       <TimeLensControl value={timeLens} onChange={setTimeLens} />
 *     </div>
 *   );
 * }
 * ```
 */
export function TimeLensControl({
  value,
  onChange,
  className,
}: TimeLensControlProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border border-border/40 bg-card/30 p-0.5',
        className,
      )}
      role="radiogroup"
      aria-label="Time period"
      data-testid="time-lens-control"
    >
      {timeLensOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
          data-testid={`time-lens-${option.value}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
