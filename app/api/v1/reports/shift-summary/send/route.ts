/**
 * Shift Report Email Distribution Route
 *
 * POST /api/v1/reports/shift-summary/send
 *
 * Assembles the ShiftReportDTO, generates a canonical PDF in-memory,
 * and sends it as an email attachment via EmailService.
 *
 * Uses existing email_send_attempt tracking for idempotency.
 * Requires pit_boss or admin role. Idempotency-Key required per PRD-HZ-001.
 *
 * Request body:
 *   {
 *     gaming_day: "YYYY-MM-DD",
 *     shift_boundary: "swing"|"day"|"grave",
 *     recipients: ["email@example.com"],
 *     idempotency_key: "uuid"
 *   }
 *
 * Response: ServiceHttpResult<EmailSendResult>
 *
 * @see EXEC-065 WS4
 */

import { renderToBuffer } from '@react-pdf/renderer';
import type { NextRequest } from 'next/server';
import React from 'react';

import { createResendProvider } from '@/lib/email/resend-adapter';
import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  RouteError,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createEmailService } from '@/services/email';
import { createShiftReportService } from '@/services/reporting/shift-report';
import type { ShiftReportParams } from '@/services/reporting/shift-report/dtos';
import { ShiftReportPdf } from '@/services/reporting/shift-report/pdf/template';
import { sendRequestSchema } from '@/services/reporting/shift-report/schemas';

export const dynamic = 'force-dynamic';

// ── Constants ──────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['pit_boss', 'admin']);

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
    const parsed = sendRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorResponse(ctx, {
        code: 'VALIDATION_ERROR',
        status: 400,
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    const body = parsed.data;

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

        // Look up casino name and settings
        const [casinoResult, settingsResult] = await Promise.all([
          mwCtx.supabase
            .from('casino')
            .select('name')
            .eq('id', casinoId)
            .single(),
          mwCtx.supabase
            .from('casino_settings')
            .select('gaming_day_start_time, timezone')
            .eq('casino_id', casinoId)
            .single(),
        ]);

        const casinoName = casinoResult.data?.name ?? 'Casino';
        const gamingDayStart =
          settingsResult.data?.gaming_day_start_time ?? '06:00';

        // Derive shift time windows
        const { startTs, endTs } = computeShiftWindow(
          body.gaming_day,
          body.shift_boundary,
          gamingDayStart,
        );

        // 1. Assemble the report DTO
        const reportService = createShiftReportService(mwCtx.supabase);
        const dto = await reportService.assembleShiftReport({
          casinoId,
          casinoName,
          gamingDay: body.gaming_day,
          shiftBoundary: body.shift_boundary,
          startTs,
          endTs,
        } satisfies ShiftReportParams);

        // 2. Render canonical PDF in-memory
        const element = React.createElement(ShiftReportPdf, {
          report: dto,
        }) as Parameters<typeof renderToBuffer>[0];
        const pdfBuffer = await renderToBuffer(element);

        const filename = buildFilename(
          casinoName,
          body.gaming_day,
          body.shift_boundary,
        );

        // 3. Send via EmailService with PDF attachment
        const emailProvider = createResendProvider();
        const emailService = createEmailService(mwCtx.supabase, emailProvider);
        const sendResult = await emailService.sendShiftReport({
          casinoId,
          shiftId: `${body.gaming_day}-${body.shift_boundary}`,
          recipients: body.recipients,
          reportDate: body.gaming_day,
          attachment: {
            filename,
            content: new Uint8Array(pdfBuffer),
            contentType: 'application/pdf',
          },
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: sendResult,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'reporting',
        action: 'shift-report.send',
        correlationId: ctx.requestId,
        requireIdempotency: true,
        idempotencyKey,
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
