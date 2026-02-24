'use client';

/**
 * Rundown Report Card (PRD-038)
 *
 * Displays a rundown report summary with action buttons.
 * Shows "Save Report" during RUNDOWN, "Finalize" when CLOSED.
 *
 * @see hooks/table-context/use-rundown-report.ts
 * @see EXEC-038 WS5
 */

import { CheckCircle2, Loader2, Save } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePersistRundown } from '@/hooks/table-context/use-persist-rundown';
import { useRundownReport } from '@/hooks/table-context/use-rundown-report';
import { formatCents } from '@/lib/format';
import type { TableSessionStatus } from '@/services/table-context/dtos';

import { LateEventBadge } from '../shift-dashboard/late-event-badge';

import { FinalizeRundownButton } from './finalize-rundown-button';

interface RundownReportCardProps {
  sessionId: string;
  sessionStatus: TableSessionStatus;
  className?: string;
}

export function RundownReportCard({
  sessionId,
  sessionStatus,
  className,
}: RundownReportCardProps) {
  const { data: report, isLoading } = useRundownReport(sessionId);
  const persist = usePersistRundown(sessionId);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Rundown Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  const isFinalized = !!report?.finalized_at;
  const showPersist = sessionStatus === 'RUNDOWN' && !isFinalized;
  const showFinalize = sessionStatus === 'CLOSED' && report && !isFinalized;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Rundown Report</CardTitle>
          <div className="flex items-center gap-1.5">
            {isFinalized && (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Finalized
              </Badge>
            )}
            {report?.has_late_events && <LateEventBadge />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {report ? (
          <>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">Win/Loss</div>
              <div className="text-right font-mono">
                {formatCents(report.table_win_cents)}
              </div>
              <div className="text-muted-foreground">Fills</div>
              <div className="text-right font-mono">
                {formatCents(report.fills_total_cents)}
              </div>
              <div className="text-muted-foreground">Credits</div>
              <div className="text-right font-mono">
                {formatCents(report.credits_total_cents)}
              </div>
              <div className="text-muted-foreground">Drop</div>
              <div className="text-right font-mono">
                {formatCents(report.drop_total_cents)}
              </div>
            </div>
            <div className="flex gap-2">
              {showFinalize && <FinalizeRundownButton reportId={report.id} />}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No report generated yet.
          </p>
        )}
        {showPersist && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => persist.mutate()}
            disabled={persist.isPending}
          >
            {persist.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save Report
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
