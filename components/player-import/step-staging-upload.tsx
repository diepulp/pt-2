/**
 * Step 4: Staging Upload
 *
 * Progress bar, chunk counter, and abort button for chunked row upload.
 *
 * @see PRD-037 CSV Player Import
 */

'use client';

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
import type { UploadProgress } from '@/hooks/player-import/use-staging-upload';

interface StepStagingUploadProps {
  progress: UploadProgress;
  onAbort: () => void;
  onNext: () => void;
}

export function StepStagingUpload({
  progress,
  onAbort,
  onNext,
}: StepStagingUploadProps) {
  const percent =
    progress.totalRows > 0
      ? Math.round((progress.uploadedRows / progress.totalRows) * 100)
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uploading Rows</CardTitle>
        <CardDescription>
          Staging rows to the server in chunks. Do not close this page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={percent} className="h-3" />

        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            {progress.uploadedRows.toLocaleString()} /{' '}
            {progress.totalRows.toLocaleString()} rows
          </span>
          <span>
            Chunk {progress.completedChunks} / {progress.totalChunks}
          </span>
        </div>

        {progress.error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {progress.error}
          </div>
        )}

        {progress.isComplete && !progress.error && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            All rows staged successfully.
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        {progress.isUploading ? (
          <>
            <div />
            <Button variant="destructive" onClick={onAbort}>
              Abort
            </Button>
          </>
        ) : (
          <>
            <div />
            <Button
              onClick={onNext}
              disabled={!progress.isComplete || !!progress.error}
            >
              Continue to Execute
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
