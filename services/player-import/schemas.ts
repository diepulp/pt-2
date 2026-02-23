/**
 * PlayerImportService Zod Schemas
 *
 * Validation schemas for import API operations.
 * Used by route handlers for request validation.
 *
 * @see PRD-037 CSV Player Import
 * @see ADR-013 Zod Validation Schemas
 */

import { z } from 'zod';

import { uuidSchema } from '@/lib/validation';

// === ImportPlayerV1 Schema ===

/** Schema for the canonical import payload (ADR-036 D2) */
export const importPlayerV1Schema = z
  .object({
    contract_version: z.literal('v1'),
    source: z
      .object({
        vendor: z.string().optional(),
        file_name: z.string().optional(),
      })
      .optional()
      .default({}),
    row_ref: z.object({
      row_number: z.number().int().min(1, 'Row number must be >= 1'),
    }),
    identifiers: z.object({
      email: z.string().email('Invalid email format').optional(),
      phone: z.string().min(7).max(20).optional(),
      external_id: z.string().optional(),
    }),
    profile: z
      .object({
        first_name: z.string().max(100).optional(),
        last_name: z.string().max(100).optional(),
        dob: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'DOB must be YYYY-MM-DD format')
          .nullable()
          .optional(),
      })
      .optional()
      .default({}),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (data) =>
      (data.identifiers.email !== undefined &&
        data.identifiers.email.length > 0) ||
      (data.identifiers.phone !== undefined &&
        data.identifiers.phone.length > 0),
    {
      message: 'At least one of email or phone must be provided',
      path: ['identifiers'],
    },
  );

// === Batch Schemas ===

/** Schema for creating a new import batch */
export const createBatchSchema = z.object({
  idempotency_key: z.string().min(1, 'Idempotency key is required').max(255),
  file_name: z.string().min(1, 'File name is required').max(255),
  vendor_label: z.string().max(255).optional(),
  column_mapping: z.record(z.string(), z.string()).default({}),
});

/** Schema for staging rows into a batch */
export const stageRowsSchema = z.object({
  rows: z
    .array(
      z.object({
        row_number: z.number().int().min(1),
        raw_row: z.record(z.string(), z.unknown()),
        normalized_payload: importPlayerV1Schema,
      }),
    )
    .min(1, 'At least one row is required')
    .max(2000, 'Maximum 2000 rows per chunk'),
});

// === Route Param Schemas ===

/** Schema for batch ID route parameter */
export const batchIdParamSchema = z.object({
  id: uuidSchema('batch ID'),
});

// === Query Schemas ===

/** Schema for batch list query parameters */
export const batchListQuerySchema = z.object({
  status: z.enum(['staging', 'executing', 'completed', 'failed']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Schema for row list query parameters */
export const rowListQuerySchema = z.object({
  status: z
    .enum(['staged', 'created', 'linked', 'skipped', 'conflict', 'error'])
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// === Type Exports ===

export type ImportPlayerV1Input = z.infer<typeof importPlayerV1Schema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type StageRowsInput = z.infer<typeof stageRowsSchema>;
export type BatchListQuery = z.infer<typeof batchListQuerySchema>;
export type RowListQuery = z.infer<typeof rowListQuerySchema>;
