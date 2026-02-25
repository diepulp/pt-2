/**
 * Step 4: File Upload (PRD-039 Server Flow)
 *
 * Uploads the CSV file to Supabase Storage via the upload route handler.
 * Shows upload progress and transitions to worker-processing on success.
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
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
import type { FileUploadState } from '@/hooks/player-import/use-file-upload';

interface StepFileUploadProps {
  fileName: string;
  uploadState: FileUploadState;
  isPending: boolean;
  onUpload: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepFileUpload({
  fileName,
  uploadState,
  isPending,
  onUpload,
  onNext,
  onBack,
}: StepFileUploadProps) {
  const isUploading = uploadState.isUploading || isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload File</CardTitle>
        <CardDescription>
          Upload <span className="font-medium">{fileName}</span> to the server
          for processing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/50 p-4 text-sm">
          <p className="font-medium">Server-side processing</p>
          <p className="mt-1 text-muted-foreground">
            The file will be uploaded and processed on the server. The server
            will parse, normalize, and stage all rows automatically. This is
            faster and more reliable than client-side processing.
          </p>
        </div>

        {isUploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            Uploading file...
          </div>
        )}

        {uploadState.isComplete && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            File uploaded successfully. The server will now process your CSV.
          </div>
        )}

        {uploadState.error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {uploadState.error}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="outline" onClick={onBack} disabled={isUploading}>
          Back
        </Button>
        {uploadState.isComplete ? (
          <Button onClick={onNext}>Continue to Processing</Button>
        ) : (
          <Button
            onClick={onUpload}
            disabled={isUploading || !!uploadState.error}
          >
            {isUploading ? 'Uploading...' : 'Upload File'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
