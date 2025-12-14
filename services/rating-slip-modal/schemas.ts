/**
 * RatingSlipModal BFF Schemas
 *
 * Zod schemas for request validation and type inference.
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see EXECUTION-SPEC-PRD-008.md WS3
 */

import { z } from "zod";

import { uuidSchema } from "@/lib/validation";

// === Route Params Schema ===

/**
 * Schema for modal-data route params.
 */
export const modalDataRouteParamsSchema = z.object({
  id: uuidSchema("Rating slip ID"),
});

export type ModalDataRouteParams = z.infer<typeof modalDataRouteParamsSchema>;

// === Response Schemas (for runtime validation if needed) ===

/**
 * Slip section schema.
 */
export const slipSectionSchema = z.object({
  id: uuidSchema("slip ID"),
  visitId: uuidSchema("visit ID"),
  tableId: uuidSchema("table ID"),
  tableLabel: z.string(),
  tableType: z.string(),
  seatNumber: z.string().nullable(),
  averageBet: z.number(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  status: z.enum(["open", "paused", "closed"]),
  gamingDay: z.string(),
  durationSeconds: z.number(),
});

/**
 * Player section schema.
 */
export const playerSectionSchema = z.object({
  id: uuidSchema("player ID"),
  firstName: z.string(),
  lastName: z.string(),
  cardNumber: z.string().nullable(),
});

/**
 * Loyalty suggestion schema.
 */
export const loyaltySuggestionSchema = z.object({
  suggestedPoints: z.number(),
  suggestedTheo: z.number(),
  policyVersion: z.string(),
});

/**
 * Loyalty section schema.
 */
export const loyaltySectionSchema = z.object({
  currentBalance: z.number(),
  tier: z.string().nullable(),
  suggestion: loyaltySuggestionSchema.nullable(),
});

/**
 * Financial section schema.
 */
export const financialSectionSchema = z.object({
  totalCashIn: z.number(),
  totalChipsOut: z.number(),
  netPosition: z.number(),
});

/**
 * Table option schema.
 */
export const tableOptionSchema = z.object({
  id: uuidSchema("table ID"),
  label: z.string(),
  type: z.string(),
  status: z.string(),
  occupiedSeats: z.array(z.string()),
});

/**
 * Full modal data response schema.
 */
export const ratingSlipModalSchema = z.object({
  slip: slipSectionSchema,
  player: playerSectionSchema.nullable(),
  loyalty: loyaltySectionSchema.nullable(),
  financial: financialSectionSchema,
  tables: z.array(tableOptionSchema),
});

export type RatingSlipModalResponse = z.infer<typeof ratingSlipModalSchema>;

// === Move Player Schemas (WS5) ===

/**
 * Schema for move player request body.
 * @see app/api/v1/rating-slips/[id]/move/route.ts
 */
export const movePlayerSchema = z.object({
  /** Target table UUID */
  destinationTableId: uuidSchema("destination table ID"),
  /** Target seat number (optional, null for unseated) */
  destinationSeatNumber: z
    .string()
    .max(20, "Seat number must be 20 characters or fewer")
    .nullable()
    .optional(),
  /** Optional: final average bet for the current slip being closed */
  averageBet: z.number().positive("Average bet must be positive").optional(),
});

export type MovePlayerInput = z.infer<typeof movePlayerSchema>;
