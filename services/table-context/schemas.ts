/**
 * TableContextService Zod Schemas
 *
 * Validation schemas for API operations.
 * Used by route handlers for request validation per ADR-013.
 *
 * NOTE: Schemas stay snake_case to mirror HTTP payloads; service-layer DTOs remain
 * camelCase in `dtos.ts`. Route handlers must map schema outputs to DTO inputs.
 *
 * @see PRD-007 Table Context Service
 */

import { z } from 'zod';

import { uuidSchema } from '@/lib/validation';
import type { Database } from '@/types/database.types';

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

export const tableStatusSchema = z.enum(['inactive', 'active', 'closed']);

/**
 * Game type enum — derived from Database Enums to prevent drift (PRD-030 delta v1 §3).
 * When a new game_type is added to the DB enum, update this list and `satisfies` will
 * catch any mismatch at compile time.
 */
type GameType = Database['public']['Enums']['game_type'];
const GAME_TYPES = [
  'blackjack',
  'poker',
  'roulette',
  'baccarat',
  'pai_gow',
  'carnival',
] as const satisfies readonly GameType[];
export const gameTypeSchema = z.enum(GAME_TYPES);

export const snapshotTypeSchema = z.enum(['open', 'close', 'rundown']);

/**
 * Close reason enum schema (PRD-038A Gap B).
 * Derived from Database Enums to prevent drift.
 */
type CloseReasonType = Database['public']['Enums']['close_reason_type'];
const CLOSE_REASONS = [
  'end_of_shift',
  'maintenance',
  'game_change',
  'dealer_unavailable',
  'low_demand',
  'security_hold',
  'emergency',
  'other',
] as const satisfies readonly CloseReasonType[];
export const closeReasonSchema = z.enum(CLOSE_REASONS);

// === Chipset Schema ===

/**
 * Validates chipset payload (denomination to quantity).
 * Keys should be string denominations, values positive integers.
 */
export const chipsetSchema = z.record(
  z.string(),
  z.number().int().min(0, 'Chip quantity must be non-negative'),
);

// === Table Lifecycle Schemas ===

export const activateTableSchema = z.object({
  table_id: uuidFormat('table ID'),
});

export const deactivateTableSchema = z.object({
  table_id: uuidFormat('table ID'),
});

export const closeTableSchema = z.object({
  table_id: uuidFormat('table ID'),
});

// === Dealer Schemas ===

export const assignDealerSchema = z.object({
  staff_id: uuidFormat('staff ID'),
});

// === Inventory Snapshot Schema ===

export const logInventorySnapshotSchema = z.object({
  table_id: uuidFormat('table ID'),
  snapshot_type: snapshotTypeSchema,
  chipset: chipsetSchema,
  verified_by: uuidFormat('staff ID').optional(),
  discrepancy_cents: z.number().int().optional(),
  note: z.string().max(500).optional(),
});

// === Fill/Credit Schemas ===

export const requestTableFillSchema = z.object({
  table_id: uuidFormat('table ID'),
  request_id: z.string().min(1, 'Request ID is required'), // Idempotency key
  chipset: chipsetSchema,
  amount_cents: z.number().int().positive('Amount must be positive'),
  delivered_by: uuidFormat('staff ID'),
  received_by: uuidFormat('staff ID'),
  slip_no: z.string().min(1, 'Slip number is required'),
});

export const requestTableCreditSchema = z.object({
  table_id: uuidFormat('table ID'),
  request_id: z.string().min(1, 'Request ID is required'), // Idempotency key
  chipset: chipsetSchema,
  amount_cents: z.number().int().positive('Amount must be positive'),
  sent_by: uuidFormat('staff ID'),
  received_by: uuidFormat('staff ID'),
  slip_no: z.string().min(1, 'Slip number is required'),
});

// === Drop Event Schema ===

export const logDropEventSchema = z.object({
  table_id: uuidFormat('table ID'),
  drop_box_id: z.string().min(1, 'Drop box ID is required'),
  seal_no: z.string().min(1, 'Seal number is required'),
  witnessed_by: uuidFormat('staff ID'),
  removed_at: z.string().datetime().optional(),
  delivered_at: z.string().datetime().optional(),
  delivered_scan_at: z.string().datetime().optional(),
  gaming_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  seq_no: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

// === Query Schemas ===

export const tableListQuerySchema = z.object({
  status: tableStatusSchema.optional(),
  pit: z.string().optional(),
  type: gameTypeSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const tableRouteParamsSchema = z.object({
  tableId: uuidFormat('table ID'),
});

// === Transport Type Exports (HTTP-only; map to camelCase DTOs in services) ===

export type ActivateTableRequestBody = z.infer<typeof activateTableSchema>;
export type DeactivateTableRequestBody = z.infer<typeof deactivateTableSchema>;
export type CloseTableRequestBody = z.infer<typeof closeTableSchema>;
export type AssignDealerRequestBody = z.infer<typeof assignDealerSchema>;
export type LogInventorySnapshotRequestBody = z.infer<
  typeof logInventorySnapshotSchema
>;
export type RequestTableFillRequestBody = z.infer<
  typeof requestTableFillSchema
>;
export type RequestTableCreditRequestBody = z.infer<
  typeof requestTableCreditSchema
>;
export type LogDropEventRequestBody = z.infer<typeof logDropEventSchema>;
export type TableListQueryParams = z.infer<typeof tableListQuerySchema>;
export type TableRouteParams = z.infer<typeof tableRouteParamsSchema>;

// === Table Settings (Betting Limits) Schemas ===

export const updateTableLimitsSchema = z
  .object({
    min_bet: z.number().nonnegative('Min bet must be non-negative'),
    max_bet: z.number().nonnegative('Max bet must be non-negative'),
  })
  .refine((data) => data.min_bet <= data.max_bet, {
    message: 'min_bet must be less than or equal to max_bet',
    path: ['min_bet'],
  });

export type UpdateTableLimitsRequestBody = z.infer<
  typeof updateTableLimitsSchema
>;

// === Table Session Schemas (PRD-TABLE-SESSION-LIFECYCLE-MVP) ===

export const tableSessionStatusSchema = z.enum([
  'OPEN',
  'ACTIVE',
  'RUNDOWN',
  'CLOSED',
]);

/**
 * Schema for opening a new table session.
 * POST /api/v1/table-sessions
 */
export const openTableSessionSchema = z.object({
  gaming_table_id: uuidFormat('gaming table ID'),
});

/**
 * Schema for starting rundown on a session.
 * PATCH /api/v1/table-sessions/[id]/rundown
 */
export const startTableRundownSchema = z.object({
  // No body required - session ID from URL
});

/**
 * Schema for closing a table session.
 * PATCH /api/v1/table-sessions/[id]/close
 * At least one of drop_event_id or closing_inventory_snapshot_id required.
 * PRD-038A: close_reason is required; close_note required when close_reason='other'.
 */
export const closeTableSessionSchema = z
  .object({
    drop_event_id: uuidFormat('drop event ID').optional(),
    closing_inventory_snapshot_id: uuidFormat(
      'closing inventory snapshot ID',
    ).optional(),
    notes: z.string().max(2000).optional(),
    close_reason: closeReasonSchema,
    close_note: z.string().max(2000).optional(),
  })
  .refine((data) => data.drop_event_id || data.closing_inventory_snapshot_id, {
    message:
      'At least one of drop_event_id or closing_inventory_snapshot_id is required',
    path: ['drop_event_id'],
  })
  .refine(
    (data) =>
      data.close_reason !== 'other' ||
      (data.close_note != null && data.close_note.trim().length > 0),
    {
      message: 'close_note is required when close_reason is "other"',
      path: ['close_note'],
    },
  );

/**
 * Schema for force-closing a table session (PRD-038A Gap A).
 * POST /api/v1/table-sessions/[id]/force-close
 * Privileged operation: pit_boss/admin only.
 */
export const forceCloseTableSessionSchema = z
  .object({
    close_reason: closeReasonSchema,
    close_note: z.string().max(2000).optional(),
  })
  .refine(
    (data) =>
      data.close_reason !== 'other' ||
      (data.close_note != null && data.close_note.trim().length > 0),
    {
      message: 'close_note is required when close_reason is "other"',
      path: ['close_note'],
    },
  );

/**
 * Route params schema for session ID.
 */
export const tableSessionRouteParamsSchema = z.object({
  id: uuidFormat('session ID'),
});

/**
 * Route params schema for current session lookup by table ID.
 */
export const currentSessionRouteParamsSchema = z.object({
  tableId: uuidFormat('table ID'),
});

// Transport type exports
export type OpenTableSessionRequestBody = z.infer<
  typeof openTableSessionSchema
>;
export type StartTableRundownRequestBody = z.infer<
  typeof startTableRundownSchema
>;
export type CloseTableSessionRequestBody = z.infer<
  typeof closeTableSessionSchema
>;
export type ForceCloseTableSessionRequestBody = z.infer<
  typeof forceCloseTableSessionSchema
>;
export type TableSessionRouteParams = z.infer<
  typeof tableSessionRouteParamsSchema
>;
export type CurrentSessionRouteParams = z.infer<
  typeof currentSessionRouteParamsSchema
>;

// === Setup Wizard Schemas (PRD-030) ===

/** Setup wizard: create/upsert a gaming table (Step 3) */
export const createGamingTableSchema = z.object({
  label: z.string().min(1, 'Table label is required').max(50),
  type: gameTypeSchema,
  pit: z.string().max(50).optional(),
  game_settings_id: z.string().uuid('Invalid game settings ID').optional(),
});

/** Setup wizard: update table par target (Step 4) */
export const updateTableParSchema = z.object({
  tableId: uuidSchema('table ID'),
  parTotalCents: z.number().int().min(0).nullable(),
});

// Setup Wizard type exports (PRD-030)
export type CreateGamingTableInput = z.infer<typeof createGamingTableSchema>;
export type UpdateTableParInput = z.infer<typeof updateTableParSchema>;

// === Cashier Route Params (PRD-033) ===

/** Route params schema for cashier confirmation endpoints ([id] param). */
export const cashierRouteParamsSchema = z.object({
  id: uuidFormat('ID'),
});

export type CashierRouteParams = z.infer<typeof cashierRouteParamsSchema>;

// === Cashier Confirmation Schemas (PRD-033) ===

export const confirmTableFillSchema = z.object({
  confirmed_amount_cents: z.number().int().positive('Amount must be positive'),
  discrepancy_note: z.string().min(1).max(500).optional(),
});

export const confirmTableCreditSchema = z.object({
  confirmed_amount_cents: z.number().int().positive('Amount must be positive'),
  discrepancy_note: z.string().min(1).max(500).optional(),
});

// No body schema needed for drop acknowledgement (just URL param)

export const fillListQuerySchema = z.object({
  status: z.enum(['requested', 'confirmed']).optional(),
  gaming_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const creditListQuerySchema = z.object({
  status: z.enum(['requested', 'confirmed']).optional(),
  gaming_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const dropListQuerySchema = z.object({
  cage_received: z.enum(['true', 'false']).optional(),
  gaming_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// Cashier confirmation transport type exports (PRD-033)
export type ConfirmTableFillRequestBody = z.infer<
  typeof confirmTableFillSchema
>;
export type ConfirmTableCreditRequestBody = z.infer<
  typeof confirmTableCreditSchema
>;
export type FillListQueryParams = z.infer<typeof fillListQuerySchema>;
export type CreditListQueryParams = z.infer<typeof creditListQuerySchema>;
export type DropListQueryParams = z.infer<typeof dropListQuerySchema>;
