'use client';

import {
  Clock,
  DollarSign,
  Plus,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DropEvent {
  id: string;
  amount: number;
  scheduledAt: string;
  actualPulledAt?: string;
  variance?: number;
  status: 'scheduled' | 'completed' | 'overdue';
}

interface DropEventsDisplayProps {
  events: DropEvent[];
}

/**
 * Drop events timeline display
 * Shows scheduled drops with status indicators and variance tracking
 */
export function DropEventsDisplay({ events }: DropEventsDisplayProps) {
  const getStatusConfig = (status: DropEvent['status']) => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle2,
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          text: 'text-emerald-400',
          label: 'Completed',
        };
      case 'overdue':
        return {
          icon: AlertCircle,
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          text: 'text-red-400',
          label: 'Overdue',
        };
      default:
        return {
          icon: Clock,
          bg: 'bg-cyan-500/10',
          border: 'border-cyan-500/30',
          text: 'text-cyan-400',
          label: 'Scheduled',
        };
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Scheduled Drops
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-dashed border-accent/30 text-accent hover:bg-accent/10 hover:border-accent"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Schedule Drop
        </Button>
      </div>

      {/* Events list */}
      <div className="space-y-3">
        {events.map((event) => {
          const statusConfig = getStatusConfig(event.status);
          const StatusIcon = statusConfig.icon;

          return (
            <div
              key={event.id}
              className={cn(
                'relative overflow-hidden',
                'p-4 rounded-lg',
                'border border-border/40',
                'bg-card/50 backdrop-blur-sm',
                'transition-all duration-300',
                'hover:border-border/60',
              )}
            >
              {/* Status indicator bar */}
              <div
                className={cn(
                  'absolute left-0 top-0 bottom-0 w-1',
                  event.status === 'completed' && 'bg-emerald-500',
                  event.status === 'overdue' && 'bg-red-500',
                  event.status === 'scheduled' && 'bg-cyan-500',
                )}
              />

              <div className="flex items-start justify-between gap-4 pl-3">
                <div className="space-y-2">
                  {/* Amount and status */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-foreground">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-lg font-semibold">
                        {event.amount.toLocaleString()}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-mono text-xs',
                        statusConfig.bg,
                        statusConfig.border,
                        statusConfig.text,
                      )}
                    >
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusConfig.label}
                    </Badge>
                  </div>

                  {/* Time info */}
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Scheduled: {event.scheduledAt}</span>
                    </div>
                    {event.actualPulledAt && (
                      <div className="text-muted-foreground pl-5">
                        Pulled: {event.actualPulledAt}
                      </div>
                    )}
                    {event.variance !== undefined && (
                      <div
                        className={cn(
                          'pl-5 font-mono',
                          event.variance > 0
                            ? 'text-red-400'
                            : 'text-emerald-400',
                        )}
                      >
                        Variance: ${Math.abs(event.variance)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action button for scheduled */}
                {event.status === 'scheduled' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-accent/30 text-accent hover:bg-accent/10"
                  >
                    Execute Drop
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
