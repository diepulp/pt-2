/**
 * Step 5: Worker Processing (PRD-039 Server Flow)
 *
 * Polls batch status while the server worker parses, normalizes, and
 * stages CSV rows. Maps error codes to user-facing messages on failure.
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ImportBatchDTO } from '@/services/player-import/dtos';

interface StepWorkerProcessingProps {
  batch: ImportBatchDTO | null;
  isProcessing: boolean;
  isComplete: boolean;
  isFailed: boolean;
  onNext: () => void;
  onStartNew: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  BATCH_ROW_LIMIT: 'CSV exceeds the 10,000-row limit.',
  PARSE_ERROR: 'The CSV file could not be parsed. Check the file format.',
  STORAGE_ERROR: 'The uploaded file could not be read from storage.',
  MAX_ATTEMPTS_EXCEEDED:
    'Processing failed after multiple attempts. Please try uploading again.',
};

function getStatusLabel(status: string | null): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive';
} {
  switch (status) {
    case 'uploaded':
      return { label: 'Queued', variant: 'secondary' };
    case 'parsing':
      return { label: 'Processing', variant: 'default' };
    case 'staging':
      return { label: 'Complete', variant: 'default' };
    case 'failed':
      return { label: 'Failed', variant: 'destructive' };
    default:
      return { label: 'Waiting', variant: 'secondary' };
  }
}

export function StepWorkerProcessing({
  batch,
  isProcessing,
  isComplete,
  isFailed,
  onNext,
  onStartNew,
}: StepWorkerProcessingProps) {
  const statusInfo = getStatusLabel(batch?.status ?? null);
  const totalRows = batch?.total_rows ?? 0;
  const errorCode = batch?.last_error_code ?? null;
  const errorMessage = errorCode
    ? (ERROR_MESSAGES[errorCode] ?? `Processing failed (${errorCode}).`)
    : 'Processing failed. Please try again.';

  // Indeterminate progress: show 0 while uploaded (queued), animated while parsing
  const progressValue = isComplete ? 100 : batch?.status === 'parsing' ? 66 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Server Processing</CardTitle>
            <CardDescription>
              The server is parsing and staging your CSV rows.
            </CardDescription>
          </div>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isFailed && (
          <Progress
            value={progressValue}
            className={`h-3 ${isProcessing ? 'animate-pulse' : ''}`}
          />
        )}

        {totalRows > 0 && !isFailed && (
          <p className="text-sm text-muted-foreground">
            {totalRows.toLocaleString()} rows staged
          </p>
        )}

        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            {batch?.status === 'uploaded'
              ? 'Waiting for worker to pick up batch...'
              : 'Parsing and staging rows...'}
          </div>
        )}

        {isComplete && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            All rows have been parsed and staged successfully.
            {totalRows > 0 && (
              <span className="ml-1">
                {totalRows.toLocaleString()} rows ready for execution.
              </span>
            )}
          </div>
        )}

        {isFailed && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        {batch?.attempt_count != null &&
          batch.attempt_count > 1 &&
          !isFailed && (
            <p className="text-xs text-muted-foreground">
              Attempt {batch.attempt_count} of 3
            </p>
          )}
      </CardContent>
      <CardFooter className="justify-between">
        {isFailed ? (
          <>
            <div />
            <Button variant="outline" onClick={onStartNew}>
              Start New Import
            </Button>
          </>
        ) : (
          <>
            <div />
            <Button onClick={onNext} disabled={!isComplete}>
              Continue to Execute
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
