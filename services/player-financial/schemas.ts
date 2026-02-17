/**
 * PlayerFinancialService Zod Schemas
 *
 * Validation schemas for financial transaction API operations.
 * Used by route handlers for request validation.
 *
 * @see PRD-009 Player Financial Service
 * @see ADR-013 Zod Validation Schemas
 */

import { z } from 'zod';

// === UUID Format Schema ===

/**
 * Permissive UUID format validation.
 *
 * Zod's built-in .uuid() validates RFC 4122 (version/variant bits),
 * which rejects valid database UUIDs that don't follow RFC strictly.
 * This regex validates the 8-4-4-4-12 format without version checks.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidFormat = (fieldName = 'ID') =>
  z.string().regex(UUID_REGEX, `Invalid ${fieldName} format`);

// === Enum Schemas ===

/**
 * Schema for financial_direction enum values.
 * Matches Database["public"]["Enums"]["financial_direction"].
 */
export const financialDirectionSchema = z.enum(['in', 'out']);

export type FinancialDirectionInput = z.infer<typeof financialDirectionSchema>;

/**
 * Schema for financial_source enum values.
 * Matches Database["public"]["Enums"]["financial_source"].
 */
export const financialSourceSchema = z.enum(['pit', 'cage', 'system']);

export type FinancialSourceInput = z.infer<typeof financialSourceSchema>;

/**
 * Schema for tender_type values.
 * Common values: cash, chips, marker, check, wire
 */
export const tenderTypeSchema = z
  .string()
  .min(1, 'Tender type cannot be empty')
  .max(50, 'Tender type must be 50 characters or fewer');

export type TenderTypeInput = z.infer<typeof tenderTypeSchema>;

// === Financial Transaction Create Schema ===

/**
 * Base schema for creating a financial transaction.
 * Additional role-based validation applied via .refine() below.
 */
const createFinancialTxnBaseSchema = z.object({
  /** Required: casino ID */
  casino_id: uuidFormat('casino ID'),
  /** Required: player ID */
  player_id: uuidFormat('player ID'),
  /** Required: visit ID */
  visit_id: uuidFormat('visit ID'),
  /** Required: transaction amount (must be positive) */
  amount: z.number().positive('Amount must be positive'),
  /** Required: transaction direction */
  direction: financialDirectionSchema,
  /** Required: transaction source */
  source: financialSourceSchema,
  /** Required: tender type */
  tender_type: tenderTypeSchema,
  /** Required: staff member creating transaction */
  created_by_staff_id: uuidFormat('created_by_staff_id'),
  /** Optional: associated rating slip */
  rating_slip_id: uuidFormat('rating slip ID').optional(),
  /** Optional: related transaction (for reversals) */
  related_transaction_id: uuidFormat('related transaction ID').optional(),
  /** Optional: idempotency key */
  idempotency_key: z
    .string()
    .max(255, 'Idempotency key must be 255 characters or fewer')
    .optional(),
  /** Optional: custom timestamp (ISO 8601 format) */
  created_at: z.string().datetime().optional(),
  /** Optional: receipt/ticket reference for cage transactions (PRD-033) */
  external_ref: z
    .string()
    .max(255, 'External ref must be 255 characters or fewer')
    .optional(),
});

/**
 * Schema for pit boss transaction creation.
 * Enforces: direction='in', source='pit', tender_type in ('cash','chips')
 */
export const createFinancialTxnPitBossSchema =
  createFinancialTxnBaseSchema.refine(
    (data) =>
      data.direction === 'in' &&
      data.source === 'pit' &&
      ['cash', 'chips'].includes(data.tender_type),
    {
      message:
        "Pit boss transactions must have direction='in', source='pit', and tender_type in ('cash', 'chips')",
      path: ['direction'],
    },
  );

/**
 * Schema for cashier transaction creation.
 * Enforces: source='cage', (direction='out' OR tender_type='marker')
 */
export const createFinancialTxnCashierSchema =
  createFinancialTxnBaseSchema.refine(
    (data) =>
      data.source === 'cage' &&
      (data.direction === 'out' || data.tender_type === 'marker'),
    {
      message:
        "Cashier transactions must have source='cage' and either direction='out' or tender_type='marker'",
      path: ['source'],
    },
  );

/**
 * Schema for admin transaction creation.
 * No additional constraints beyond base validation.
 */
export const createFinancialTxnAdminSchema = createFinancialTxnBaseSchema;

/**
 * Generic schema for transaction creation (no role-specific validation).
 * Use this when role validation is deferred to RPC layer.
 */
export const createFinancialTxnSchema = createFinancialTxnBaseSchema;

export type CreateFinancialTxnInput = z.infer<typeof createFinancialTxnSchema>;

// === Financial Transaction Query Schemas ===

/**
 * Schema for financial transaction list query params.
 */
export const financialTxnListQuerySchema = z.object({
  /** Filter by player */
  player_id: uuidFormat('player ID').optional(),
  /** Filter by visit */
  visit_id: uuidFormat('visit ID').optional(),
  /** Filter by gaming table (requires join with rating_slip) */
  table_id: uuidFormat('table ID').optional(),
  /** Filter by direction */
  direction: financialDirectionSchema.optional(),
  /** Filter by source */
  source: financialSourceSchema.optional(),
  /** Filter by tender type */
  tender_type: tenderTypeSchema.optional(),
  /** Filter by gaming day (ISO date format YYYY-MM-DD) */
  gaming_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')
    .optional(),
  /** Results per page (default 20, max 100) */
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Cursor for pagination (transaction ID) */
  cursor: uuidFormat('cursor').optional(),
});

export type FinancialTxnListQuery = z.infer<typeof financialTxnListQuerySchema>;

/**
 * Schema for visit financial summary query.
 */
export const visitTotalQuerySchema = z.object({
  /** Required: visit ID */
  visit_id: uuidFormat('visit ID'),
});

export type VisitTotalQuery = z.infer<typeof visitTotalQuerySchema>;

// === Route Param Schemas ===

/**
 * Schema for financial transaction detail route params.
 */
export const financialTxnRouteParamsSchema = z.object({
  id: uuidFormat('financial transaction ID'),
});

export type FinancialTxnRouteParams = z.infer<
  typeof financialTxnRouteParamsSchema
>;

/**
 * Schema for visit financial summary route params.
 */
export const visitFinancialSummaryRouteParamsSchema = z.object({
  visitId: uuidFormat('visit ID'),
});

export type VisitFinancialSummaryRouteParams = z.infer<
  typeof visitFinancialSummaryRouteParamsSchema
>;

// === Re-exports for route handler convenience ===

export { z };
