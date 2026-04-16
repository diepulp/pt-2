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
