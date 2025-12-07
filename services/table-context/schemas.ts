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

import { z } from "zod";

// === Enum Schemas ===

export const tableStatusSchema = z.enum(["inactive", "active", "closed"]);
export const gameTypeSchema = z.enum([
  "blackjack",
  "poker",
  "roulette",
  "baccarat",
]);
export const snapshotTypeSchema = z.enum(["open", "close", "rundown"]);

// === Chipset Schema ===

/**
 * Validates chipset payload (denomination to quantity).
 * Keys should be string denominations, values positive integers.
 */
export const chipsetSchema = z.record(
  z.string(),
  z.number().int().min(0, "Chip quantity must be non-negative"),
);

// === Table Lifecycle Schemas ===

export const activateTableSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
});

export const deactivateTableSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
});

export const closeTableSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
});

// === Dealer Schemas ===

export const assignDealerSchema = z.object({
  staff_id: z.string().uuid("Invalid staff ID format"),
});

// === Inventory Snapshot Schema ===

export const logInventorySnapshotSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
  snapshot_type: snapshotTypeSchema,
  chipset: chipsetSchema,
  counted_by: z.string().uuid().optional(),
  verified_by: z.string().uuid().optional(),
  discrepancy_cents: z.number().int().optional(),
  note: z.string().max(500).optional(),
});

// === Fill/Credit Schemas ===

export const requestTableFillSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
  request_id: z.string().min(1, "Request ID is required"), // Idempotency key
  chipset: chipsetSchema,
  amount_cents: z.number().int().positive("Amount must be positive"),
  requested_by: z.string().uuid("Invalid staff ID format"),
  delivered_by: z.string().uuid("Invalid staff ID format"),
  received_by: z.string().uuid("Invalid staff ID format"),
  slip_no: z.string().min(1, "Slip number is required"),
});

export const requestTableCreditSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
  request_id: z.string().min(1, "Request ID is required"), // Idempotency key
  chipset: chipsetSchema,
  amount_cents: z.number().int().positive("Amount must be positive"),
  authorized_by: z.string().uuid("Invalid staff ID format"),
  sent_by: z.string().uuid("Invalid staff ID format"),
  received_by: z.string().uuid("Invalid staff ID format"),
  slip_no: z.string().min(1, "Slip number is required"),
});

// === Drop Event Schema ===

export const logDropEventSchema = z.object({
  table_id: z.string().uuid("Invalid table ID format"),
  drop_box_id: z.string().min(1, "Drop box ID is required"),
  seal_no: z.string().min(1, "Seal number is required"),
  removed_by: z.string().uuid("Invalid staff ID format"),
  witnessed_by: z.string().uuid("Invalid staff ID format"),
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
  tableId: z.string().uuid("Invalid table ID format"),
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
