/**
 * Step 6: Report
 *
 * Displays import outcome summary, row detail table, and CSV download.
 *
 * @see PRD-037 CSV Player Import
 */

'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useImportBatchDetail,
  useImportRows,
} from '@/hooks/player-import/use-import-report';
import type { ImportRowStatus } from '@/services/player-import/dtos';

import { CsvDownloadButton } from './csv-download-button';
import { ReportSummaryCard } from './report-summary-card';

const STATUS_LABELS: Record<
  ImportRowStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  staged: { label: 'Staged', variant: 'secondary' },
  created: { label: 'Created', variant: 'default' },
  linked: { label: 'Linked', variant: 'secondary' },
  skipped: { label: 'Skipped', variant: 'outline' },
  conflict: { label: 'Conflict', variant: 'destructive' },
  error: { label: 'Error', variant: 'destructive' },
};

interface StepReportProps {
  batchId: string;
  onStartNew: () => void;
}

export function StepReport({ batchId, onStartNew }: StepReportProps) {
  const {
    batch,
    report,
    isLoading: batchLoading,
  } = useImportBatchDetail(batchId);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const rowFilters =
    statusFilter === 'all' ? {} : { status: statusFilter as ImportRowStatus };
  const { rows, isLoading: rowsLoading } = useImportRows(batchId, rowFilters);

  if (batchLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isExecuting = batch?.status === 'executing';

  return (
    <div className="space-y-4">
      {isExecuting && (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground animate-pulse">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            Import is still executing. Results will appear when complete.
          </CardContent>
        </Card>
      )}

      {report && <ReportSummaryCard report={report} />}

      {/* Row detail table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Row Details</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Rows</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="linked">Linked</SelectItem>
                  <SelectItem value="conflict">Conflict</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
              <CsvDownloadButton
                rows={rows}
                fileName={`import-report-${batchId.slice(0, 8)}.csv`}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rowsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No rows match the selected filter.
            </p>
          ) : (
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Matched Player</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const statusInfo =
                      STATUS_LABELS[row.status as ImportRowStatus] ??
                      STATUS_LABELS.staged;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground text-xs tabular-nums">
                          {row.row_number}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.variant}>
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                          {row.reason_detail ?? row.reason_code ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {row.matched_player_id
                            ? row.matched_player_id.slice(0, 8) + '...'
                            : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={onStartNew}>Start New Import</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
