/**
 * MTL Audit Notes Route
 *
 * GET /api/v1/mtl/entries/[entryId]/audit-notes - List audit notes for entry
 * POST /api/v1/mtl/entries/[entryId]/audit-notes - Create audit note (append-only)
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Authorization per ADR-025:
 * - Audit Note READ: pit_boss, admin
 * - Audit Note WRITE: pit_boss, admin
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  parseParams,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { assertRole } from "@/lib/supabase/rls-context";
import { createClient } from "@/lib/supabase/server";
import { createMtlService } from "@/services/mtl";
import {
  createMtlAuditNoteSchema,
  mtlAuditNoteRouteParamsSchema,
} from "@/services/mtl/schemas";

/**
 * GET /api/v1/mtl/entries/[entryId]/audit-notes
 *
 * List audit notes for an MTL entry.
 * Restricted to pit_boss and admin per ADR-025.
 */
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ entryId: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      mtlAuditNoteRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // ADR-025: Audit Note READ allowed for pit_boss, admin only
        assertRole(mwCtx.rlsContext!, ["pit_boss", "admin"]);

        const service = createMtlService(mwCtx.supabase);
        const notes = await service.getAuditNotes(params.entryId);

        return {
          ok: true as const,
          code: "OK" as const,
          data: notes,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "mtl",
        action: "list-audit-notes",
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

/**
 * POST /api/v1/mtl/entries/[entryId]/audit-notes
 *
 * Create an audit note for an MTL entry (append-only).
 * Restricted to pit_boss and admin per ADR-025.
 * Requires Idempotency-Key header.
 * Returns 201 on success.
 */
export async function POST(
  request: NextRequest,
  segmentData: { params: Promise<{ entryId: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      mtlAuditNoteRouteParamsSchema,
    );
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<{ staff_id?: string; note: string }>(
      request,
    );

    // Validate input (mtl_entry_id is provided via route param)
    const inputValidation = createMtlAuditNoteSchema.safeParse({
      staff_id: body.staff_id,
      note: body.note,
      mtl_entry_id: params.entryId,
    });

    if (!inputValidation.success) {
      return errorResponse(ctx, {
        ok: false,
        code: "VALIDATION_ERROR",
        error: "Invalid request body",
        details: inputValidation.error.flatten(),
        status: 400,
      });
    }

    const input = inputValidation.data;

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // ADR-025: Audit Note WRITE allowed for pit_boss, admin only
        assertRole(mwCtx.rlsContext!, ["pit_boss", "admin"]);

        const service = createMtlService(mwCtx.supabase);

        // Use actor from RLS context for staff_id if not provided
        const note = await service.createAuditNote({
          mtl_entry_id: input.mtl_entry_id,
          staff_id: input.staff_id || mwCtx.rlsContext!.actorId,
          note: input.note,
        });

        return {
          ok: true as const,
          code: "OK" as const,
          data: note,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "mtl",
        action: "create-audit-note",
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 Created for new audit note
    return successResponse(ctx, result.data, "OK", 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
