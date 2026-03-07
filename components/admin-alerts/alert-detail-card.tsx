'use client';

import {
  AlertTriangleIcon,
  ArrowDownIcon,
  InfoIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import { useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/format';
import type { CashObsSpikeAlertDTO } from '@/services/table-context/dtos';

function getSeverityConfig(severity: 'info' | 'warn' | 'critical') {
  switch (severity) {
    case 'critical':
      return {
        borderClass: 'border-l-4 border-l-red-500',
        icon: <XCircleIcon className="h-4 w-4 text-red-500" />,
        badgeClass: 'bg-red-500/10 text-red-500',
      };
    case 'warn':
      return {
        borderClass: 'border-l-4 border-l-amber-500',
        icon: <AlertTriangleIcon className="h-4 w-4 text-amber-500" />,
        badgeClass: 'bg-amber-500/10 text-amber-500',
      };
    case 'info':
    default:
      return {
        borderClass: 'border-l-4 border-l-blue-500',
        icon: <InfoIcon className="h-4 w-4 text-blue-500" />,
        badgeClass: 'bg-blue-500/10 text-blue-500',
      };
  }
}

interface AlertDetailCardProps {
  alert: CashObsSpikeAlertDTO;
  alertKey: string;
  onDismiss: (key: string) => void;
}

export function AlertDetailCard({
  alert,
  alertKey,
  onDismiss,
}: AlertDetailCardProps) {
  const [isPending, startTransition] = useTransition();
  const config = getSeverityConfig(alert.severity);

  const handleDismiss = () => {
    startTransition(() => {
      onDismiss(alertKey);
    });
  };

  return (
    <div
      className={`${config.borderClass} rounded-r-lg border border-l-0 bg-card p-4`}
      role="alert"
      aria-label={`${alert.severity} alert for ${alert.entity_label}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 shrink-0">{config.icon}</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium">
                {alert.entity_label}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {alert.entity_type === 'table' ? 'Table' : 'Pit'}
              </Badge>
              <Badge className={`${config.badgeClass} text-[10px] uppercase`}>
                {alert.severity}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {alert.message}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          disabled={isPending}
          aria-label={`Dismiss alert for ${alert.entity_label}`}
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-6 mt-3 ml-7 text-xs">
        <div>
          <span className="text-muted-foreground">Observed </span>
          <span className="font-mono tabular-nums font-medium text-foreground">
            {formatCents(alert.observed_value)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Threshold </span>
          <span className="font-mono tabular-nums">
            {formatCents(alert.threshold)}
          </span>
        </div>
      </div>

      {alert.downgraded && (
        <div className="flex items-center gap-1.5 mt-2 ml-7 text-[10px] text-muted-foreground">
          <ArrowDownIcon className="h-3 w-3" />
          <span>
            Downgraded from{' '}
            <span className="font-medium uppercase">
              {alert.original_severity}
            </span>
            {alert.downgrade_reason &&
              ` — ${alert.downgrade_reason.replace('_', ' ')}`}
          </span>
        </div>
      )}
    </div>
  );
}
