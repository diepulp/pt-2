/**
 * Staging Upload Hook
 *
 * Chunks parsed CSV rows into 500-row batches and uploads them to the
 * staging API. Tracks progress and supports abort.
 *
 * @see PRD-037 CSV Player Import
 * @see services/player-import/http.ts — stageRows
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, useTransition } from 'react';

import type {
  ImportPlayerV1,
  StageRowInput,
} from '@/services/player-import/dtos';
import { stageRows } from '@/services/player-import/http';
import { playerImportKeys } from '@/services/player-import/keys';

const CHUNK_SIZE = 500;

export interface UploadProgress {
  totalChunks: number;
  completedChunks: number;
  totalRows: number;
  uploadedRows: number;
  isUploading: boolean;
  isComplete: boolean;
  error: string | null;
}

const INITIAL_PROGRESS: UploadProgress = {
  totalChunks: 0,
  completedChunks: 0,
  totalRows: 0,
  uploadedRows: 0,
  isUploading: false,
  isComplete: false,
  error: null,
};

/**
 * Hook for chunked row upload to the staging API.
 *
 * Splits rows into 500-row chunks and uploads sequentially with
 * idempotency keys per chunk. Tracks progress and supports abort.
 */
export function useStagingUpload(batchId: string | null) {
  const [progress, setProgress] = useState<UploadProgress>(INITIAL_PROGRESS);
  const abortRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const stageMutation = useMutation({
    mutationFn: ({
      id,
      rows,
      key,
    }: {
      id: string;
      rows: StageRowInput[];
      key: string;
    }) => stageRows(id, rows, key),
    onSuccess: () => {
      if (batchId) {
        queryClient.invalidateQueries({
          queryKey: playerImportKeys.batches.detail(batchId),
        });
      }
    },
  });

  /**
   * Build normalized StageRowInput from raw CSV rows + column mappings.
   */
  function buildStageRows(
    rawRows: Record<string, string>[],
    mappings: Record<string, string>,
    fileName: string,
    vendorLabel?: string,
  ): StageRowInput[] {
    return rawRows.map((rawRow, index) => {
      const rowNumber = index + 1;

      const normalized: ImportPlayerV1 = {
        contract_version: 'v1',
        source: { vendor: vendorLabel, file_name: fileName },
        row_ref: { row_number: rowNumber },
        identifiers: {
          email: mappings.email
            ? rawRow[mappings.email]?.trim() || undefined
            : undefined,
          phone: mappings.phone
            ? rawRow[mappings.phone]?.trim() || undefined
            : undefined,
          external_id: mappings.external_id
            ? rawRow[mappings.external_id]?.trim() || undefined
            : undefined,
        },
        profile: {
          first_name: mappings.first_name
            ? rawRow[mappings.first_name]?.trim() || undefined
            : undefined,
          last_name: mappings.last_name
            ? rawRow[mappings.last_name]?.trim() || undefined
            : undefined,
          dob: mappings.dob ? rawRow[mappings.dob]?.trim() || null : null,
        },
        notes: mappings.notes
          ? rawRow[mappings.notes]?.trim() || undefined
          : undefined,
      };

      return {
        row_number: rowNumber,
        raw_row: rawRow as unknown as Record<string, unknown>,
        normalized_payload: normalized,
      };
    });
  }

  /**
   * Upload all rows in chunks.
   */
  function startUpload(targetBatchId: string, stageRowInputs: StageRowInput[]) {
    abortRef.current = false;

    const chunks: StageRowInput[][] = [];
    for (let i = 0; i < stageRowInputs.length; i += CHUNK_SIZE) {
      chunks.push(stageRowInputs.slice(i, i + CHUNK_SIZE));
    }

    setProgress({
      totalChunks: chunks.length,
      completedChunks: 0,
      totalRows: stageRowInputs.length,
      uploadedRows: 0,
      isUploading: true,
      isComplete: false,
      error: null,
    });

    startTransition(async () => {
      for (let i = 0; i < chunks.length; i++) {
        if (abortRef.current) {
          setProgress((prev) => ({
            ...prev,
            isUploading: false,
            error: 'Upload aborted',
          }));
          return;
        }

        const chunk = chunks[i];
        const idempotencyKey = `stage-${targetBatchId}-chunk-${i}`;

        try {
          await stageMutation.mutateAsync({
            id: targetBatchId,
            rows: chunk,
            key: idempotencyKey,
          });

          setProgress((prev) => ({
            ...prev,
            completedChunks: i + 1,
            uploadedRows: Math.min(prev.totalRows, (i + 1) * CHUNK_SIZE),
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Upload failed';
          setProgress((prev) => ({
            ...prev,
            isUploading: false,
            error: message,
          }));
          return;
        }
      }

      setProgress((prev) => ({
        ...prev,
        isUploading: false,
        isComplete: true,
        uploadedRows: prev.totalRows,
      }));
    });
  }

  function abort() {
    abortRef.current = true;
  }

  function reset() {
    abortRef.current = false;
    setProgress(INITIAL_PROGRESS);
  }

  return {
    progress,
    isPending,
    buildStageRows,
    startUpload,
    abort,
    reset,
  };
}
