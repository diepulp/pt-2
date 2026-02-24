'use client';

/**
 * Late Event Badge (PRD-038)
 *
 * Warning badge shown on rundown report cards when has_late_events = true.
 * Indicates activity was recorded after the report was finalized.
 *
 * @see EXEC-038 WS5
 */

import { AlertTriangle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface LateEventBadgeProps {
  className?: string;
}

export function LateEventBadge({ className }: LateEventBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`border-amber-500/30 text-amber-600 dark:text-amber-400 ${className ?? ''}`}
        >
          <AlertTriangle className="mr-1 h-3 w-3" />
          Late activity
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        Activity recorded after this report was finalized
      </TooltipContent>
    </Tooltip>
  );
}
