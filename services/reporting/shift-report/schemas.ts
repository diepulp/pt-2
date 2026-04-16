/**
 * ShiftReportService Zod Schemas
 *
 * Validation schemas for shift report parameters.
 *
 * @see EXEC-065 WS1
 */

import { z } from 'zod';

import { dateSchema, datetimeSchema } from '@/lib/validation';
import { uuidSchema } from '@/lib/validation/uuid';

export const shiftBoundarySchema = z.enum(['swing', 'day', 'grave']);

export const shiftReportParamsSchema = z.object({
  casinoId: uuidSchema('casino ID'),
  casinoName: z.string().min(1, 'Casino name is required'),
  startTs: datetimeSchema('startTs'),
  endTs: datetimeSchema('endTs'),
  gamingDay: dateSchema('gamingDay'),
  shiftBoundary: shiftBoundarySchema,
});

export type ShiftReportParamsInput = z.infer<typeof shiftReportParamsSchema>;

// ── Route handler request schemas (ADR-013) ────────────────────────────────

export const pdfRequestSchema = z.object({
  gaming_day: dateSchema('gaming_day'),
  shift_boundary: shiftBoundarySchema,
});

export type PdfRequestInput = z.infer<typeof pdfRequestSchema>;

export const sendRequestSchema = z.object({
  gaming_day: dateSchema('gaming_day'),
  shift_boundary: shiftBoundarySchema,
  recipients: z
    .array(z.string().email('Invalid recipient email address'))
    .min(1, 'At least one recipient is required')
    .max(10, 'Maximum 10 recipients per send'),
  idempotency_key: uuidSchema('idempotency_key'),
});

export type SendRequestInput = z.infer<typeof sendRequestSchema>;
