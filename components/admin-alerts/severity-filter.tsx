'use client';

import { AlertTriangleIcon, InfoIcon, XCircleIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

type Severity = 'critical' | 'warn' | 'info';

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; icon: React.ReactNode; activeClass: string }
> = {
  critical: {
    label: 'Critical',
    icon: <XCircleIcon className="h-3.5 w-3.5" />,
    activeClass: 'bg-red-500/15 text-red-500 border-red-500/30',
  },
  warn: {
    label: 'Warning',
    icon: <AlertTriangleIcon className="h-3.5 w-3.5" />,
    activeClass: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  },
  info: {
    label: 'Info',
    icon: <InfoIcon className="h-3.5 w-3.5" />,
    activeClass: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  },
};

interface SeverityFilterProps {
  selected: Set<Severity>;
  onToggle: (severity: Severity) => void;
}

export function SeverityFilter({ selected, onToggle }: SeverityFilterProps) {
  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label="Filter by severity"
    >
      {(
        Object.entries(SEVERITY_CONFIG) as [
          Severity,
          (typeof SEVERITY_CONFIG)[Severity],
        ][]
      ).map(([severity, config]) => {
        const isActive = selected.has(severity);
        return (
          <button
            key={severity}
            onClick={() => onToggle(severity)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              isActive
                ? config.activeClass
                : 'border-border text-muted-foreground hover:bg-accent/50',
            )}
            aria-pressed={isActive}
          >
            {config.icon}
            {config.label}
          </button>
        );
      })}
    </div>
  );
}
