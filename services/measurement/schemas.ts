/**
 * Measurement Zod Validation Schemas
 *
 * @see ADR-013 Zod Validation Schemas Standard
 * @see EXEC-046 WS2 Route Handler
 */

import { z } from 'zod';

/**
 * Query parameter schema for GET /api/v1/measurement/summary
 */
export const measurementSummaryQuerySchema = z.object({
  pit_id: z.string().uuid().optional(),
  table_id: z.string().uuid().optional(),
});
