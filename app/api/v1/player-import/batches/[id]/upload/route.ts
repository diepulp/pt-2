/**
 * Player Import Upload Route
 *
 * POST /api/v1/player-import/batches/[id]/upload — multipart/form-data file upload.
 *
 * Accepts a CSV file, uploads it to Supabase Storage (via service_role),
 * and transitions the batch from 'created' → 'uploaded'.
 *
 * Security:
 * - Uses withServerAction middleware for auth, RLS context, and audit.
 * - casino_id derived from auth context (ADR-024 INV-8) — never from request.
 * - Storage upload delegated to uploadFileToStorage() in the service layer
 *   (service_role, 'imports' bucket has no user-facing policies — SEC note).
 * - Role gate: admin, pit_boss only.
 *
 * @see PRD-039 Server-Authoritative CSV Ingestion Worker
 * @see ADR-024 Authoritative Context Derivation
 * @see docs/30-security/SEC-NOTE-SERVER-CSV-INGESTION.md
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  parseParams,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createPlayerImportService } from '@/services/player-import';
import { uploadFileToStorage } from '@/services/player-import/crud';
import { batchIdParamSchema } from '@/services/player-import/schemas';

export const dynamic = 'force-dynamic';

/** Max file size: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Route params type for Next.js 16 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/player-import/batches/[id]/upload
 *
 * Upload a CSV file for server-side ingestion.
 * Requires:
 * - Idempotency-Key header
 * - multipart/form-data body with 'file' field
 * - Batch must be in 'created' status (409 otherwise)
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(await segmentData.params, batchIdParamSchema);
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // 1. Parse multipart form data
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file || !(file instanceof File)) {
          throw new DomainError(
            'VALIDATION_ERROR',
            'Missing or invalid file field in multipart body',
          );
        }

        // 2. Validate file size
        if (file.size > MAX_FILE_SIZE) {
          throw new DomainError(
            'VALIDATION_ERROR',
            `File size ${file.size} exceeds maximum ${MAX_FILE_SIZE} bytes`,
          );
        }

        // 3. Get batch and verify status = 'created'
        const service = createPlayerImportService(mwCtx.supabase);
        const batch = await service.getBatch(params.id);
        if (!batch) {
          throw new DomainError(
            'IMPORT_BATCH_NOT_FOUND',
            `Batch ${params.id} not found`,
          );
        }
        if (batch.status !== 'created') {
          throw new DomainError(
            'IMPORT_BATCH_NOT_CREATED',
            `Batch status is '${batch.status}', expected 'created'`,
          );
        }

        // 4. Upload to Supabase Storage via service_role client
        //    Storage path uses generated UUID, never raw filename (SEC)
        const uploadId = crypto.randomUUID();
        const storagePath = `${batch.casino_id}/${batch.id}/${uploadId}.csv`;

        await uploadFileToStorage(storagePath, file);

        // 5. Update batch: set storage_path, original_file_name, status → 'uploaded'
        const updated = await service.updateBatchStoragePath(
          params.id,
          storagePath,
          file.name,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: updated,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player-import',
        action: 'upload',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
