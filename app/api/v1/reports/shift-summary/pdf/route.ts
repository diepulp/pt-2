/**
 * Shift Report PDF Generation Route
 *
 * POST /api/v1/reports/shift-summary/pdf
 *
 * Generates a canonical PDF from the ShiftReportDTO using @react-pdf/renderer.
 * Requires pit_boss or admin role. Idempotency-Key required per PRD-HZ-001.
 *
 * Request body:
 *   { gaming_day: "YYYY-MM-DD", shift_boundary: "swing"|"day"|"grave" }
 *
 * Response: application/pdf binary (Content-Disposition: attachment)
 *
 * Security:
 * - Handler guard: role check (pit_boss/admin)
 * - Casino scope: derived from RLS context (ADR-024)
 *
 * @see EXEC-065 WS3
 */

import { renderToBuffer } from '@react-pdf/renderer';
import type { NextRequest } from 'next/server';
import React from 'react';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  RouteError,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createShiftReportService } from '@/services/reporting/shift-report';
import type { ShiftReportParams } from '@/services/reporting/shift-report/dtos';
import { ShiftReportPdf } from '@/services/reporting/shift-report/pdf/template';
import { pdfRequestSchema } from '@/services/reporting/shift-report/schemas';

export const dynamic = 'force-dynamic';

// ── Constants ──────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['pit_boss', 'admin']);

/**
 * Standard 8-hour shift model.
 * Offsets are hours from gaming_day_start_time.
 * day=0h, swing=8h, grave=16h (matching PT-2 casino 3-shift convention).
 */
const SHIFT_OFFSETS_HOURS: Record<
  string,
  { startOffset: number; endOffset: number }
> = {
  day: { startOffset: 0, endOffset: 8 },
  swing: { startOffset: 8, endOffset: 16 },
  grave: { startOffset: 16, endOffset: 24 },
};

// ── Route Handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const rawBody = await readJsonBody(request);

    // Validate with centralized schema (ADR-013)
    const parsed = pdfRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorResponse(ctx, {
        code: 'VALIDATION_ERROR',
        status: 400,
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const body = parsed.data;

    // Use middleware chain for auth/RLS, then assemble report DTO
    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Role guard
        const staffRole = mwCtx.rlsContext!.staffRole;
        if (!ALLOWED_ROLES.has(staffRole)) {
          throw new RouteError(
            'FORBIDDEN',
            'Reports require pit_boss or admin role',
          );
        }

        const casinoId = mwCtx.rlsContext!.casinoId;

        // Look up casino name and settings for report header + shift windows
        const { data: casino } = await mwCtx.supabase
          .from('casino')
          .select('name')
          .eq('id', casinoId)
          .single();

        const { data: settings } = await mwCtx.supabase
          .from('casino_settings')
          .select('gaming_day_start_time, timezone')
          .eq('casino_id', casinoId)
          .single();

        const casinoName = casino?.name ?? 'Casino';
        const gamingDayStart = settings?.gaming_day_start_time ?? '06:00';

        // Derive shift time windows from gaming_day + shift_boundary
        const { startTs, endTs } = computeShiftWindow(
          body.gaming_day,
          body.shift_boundary,
          gamingDayStart,
        );

        // Assemble the report DTO
        const service = createShiftReportService(mwCtx.supabase);
        const dto = await service.assembleShiftReport({
          casinoId,
          casinoName,
          gamingDay: body.gaming_day,
          shiftBoundary: body.shift_boundary,
          startTs,
          endTs,
        } satisfies ShiftReportParams);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: { dto, casinoName },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'reporting',
        action: 'shift-report.pdf',
        correlationId: ctx.requestId,
        requireIdempotency: true,
        idempotencyKey,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Render PDF from the assembled DTO
    const { dto, casinoName } = result.data!;
    const element = React.createElement(ShiftReportPdf, {
      report: dto,
    }) as Parameters<typeof renderToBuffer>[0];
    const pdfBuffer = await renderToBuffer(element);

    const filename = buildFilename(
      casinoName,
      body.gaming_day,
      body.shift_boundary,
    );

    // Convert Buffer to Uint8Array for Response body compatibility
    const body8 = new Uint8Array(pdfBuffer);
    return new Response(body8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Request-Id': ctx.requestId,
      },
    });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function computeShiftWindow(
  gamingDay: string,
  shiftBoundary: string,
  gamingDayStartTime: string,
): { startTs: string; endTs: string } {
  const offsets = SHIFT_OFFSETS_HOURS[shiftBoundary];
  if (!offsets) {
    throw new RouteError(
      'VALIDATION_ERROR',
      `Invalid shift boundary: ${shiftBoundary}`,
    );
  }

  const [startHour, startMinute] = gamingDayStartTime.split(':').map(Number);
  const anchor = new Date(
    `${gamingDay}T${String(startHour).padStart(2, '0')}:${String(startMinute ?? 0).padStart(2, '0')}:00`,
  );

  const startDate = new Date(anchor.getTime() + offsets.startOffset * 3600_000);
  const endDate = new Date(anchor.getTime() + offsets.endOffset * 3600_000);

  return {
    startTs: startDate.toISOString(),
    endTs: endDate.toISOString(),
  };
}

function buildFilename(
  casinoName: string,
  gamingDay: string,
  shiftBoundary: string,
): string {
  return `shift-report-${casinoName}-${gamingDay}-${shiftBoundary}.pdf`.replace(
    /[^a-zA-Z0-9._-]/g,
    '_',
  );
}
