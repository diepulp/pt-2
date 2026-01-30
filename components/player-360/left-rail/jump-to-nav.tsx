/**
 * Jump To Navigation Component
 *
 * In-page navigation links for smooth scrolling to sections.
 *
 * @see PRD-023 Player 360 Panels v0
 */

'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

// === Types ===

export interface JumpToTarget {
  /** Target element ID */
  id: string;
  /** Display label */
  label: string;
}

// === Props ===

export interface JumpToNavProps {
  /** Navigation targets */
  targets?: JumpToTarget[];
  /** Additional class names */
  className?: string;
}

// === Default Targets ===

const defaultTargets: JumpToTarget[] = [
  { id: 'summary-section', label: 'Summary' },
  { id: 'chart-section', label: 'Activity Chart' },
  { id: 'timeline-section', label: 'Timeline' },
];

// === Component ===

/**
 * Collapsible navigation for jumping to page sections.
 *
 * @example
 * ```tsx
 * function LeftRail() {
 *   return (
 *     <div>
 *       <JumpToNav />
 *       <FilterTileStack ... />
 *     </div>
 *   );
 * }
 * ```
 */
export function JumpToNav({
  targets = defaultTargets,
  className,
}: JumpToNavProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleJump = (targetId: string) => {
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, targetId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleJump(targetId);
    }
  };

  return (
    <div className={cn('', className)} data-testid="jump-to-nav">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-1 w-full px-2 py-1.5 text-xs font-medium',
          'text-muted-foreground hover:text-foreground transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded',
        )}
        aria-expanded={isExpanded}
        aria-controls="jump-to-list"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Jump To
      </button>

      {/* Links */}
      {isExpanded && (
        <nav
          id="jump-to-list"
          className="flex flex-col gap-0.5 pl-4"
          aria-label="Page sections"
        >
          {targets.map((target) => (
            <button
              key={target.id}
              type="button"
              onClick={() => handleJump(target.id)}
              onKeyDown={(e) => handleKeyDown(e, target.id)}
              className={cn(
                'text-left text-xs text-muted-foreground px-2 py-1 rounded',
                'hover:text-foreground hover:bg-muted/50 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              data-testid={`jump-to-${target.id}`}
            >
              {target.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
