/**
 * File Upload Hook (PRD-039 Server Flow)
 *
 * Uploads a CSV file via multipart/form-data to the server upload endpoint.
 * Uses useTransition for non-blocking UI during the upload.
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 * @see services/player-import/http.ts — uploadFile
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, useTransition } from 'react';

import type { ImportBatchDTO } from '@/services/player-import/dtos';
import { uploadFile } from '@/services/player-import/http';
import { playerImportKeys } from '@/services/player-import/keys';

export interface FileUploadState {
  isUploading: boolean;
  isComplete: boolean;
  error: string | null;
}

const INITIAL_STATE: FileUploadState = {
  isUploading: false,
  isComplete: false,
  error: null,
};

/**
 * Hook for uploading a CSV file to Supabase Storage via the upload route.
 *
 * Wraps the upload in useTransition so the UI stays responsive.
 * On success, invalidates the batch detail cache so polling picks up
 * the new 'uploaded' status.
 */
export function useFileUpload() {
  const [state, setState] = useState<FileUploadState>(INITIAL_STATE);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const resultRef = useRef<ImportBatchDTO | null>(null);

  function upload(batchId: string, file: File) {
    setState({ isUploading: true, isComplete: false, error: null });

    startTransition(async () => {
      const idempotencyKey = `upload-${batchId}-${Date.now()}`;

      try {
        const batch = await uploadFile(batchId, file, idempotencyKey);
        resultRef.current = batch;

        await queryClient.invalidateQueries({
          queryKey: playerImportKeys.batches.detail(batchId),
        });

        setState({ isUploading: false, isComplete: true, error: null });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'File upload failed';
        setState({ isUploading: false, isComplete: false, error: message });
      }
    });
  }

  function reset() {
    setState(INITIAL_STATE);
    resultRef.current = null;
  }

  return {
    ...state,
    isPending,
    result: resultRef.current,
    upload,
    reset,
  };
}
