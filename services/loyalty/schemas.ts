/**
 * LoyaltyService Zod Schemas
 *
 * Validation schemas for loyalty API operations.
 * Used by route handlers for request validation.
 *
 * @see PRD-004 Loyalty Service
 * @see EXECUTION-SPEC-PRD-004.md WS3
 * @see LEDGER-PAGINATION-CONTRACT.md §7
 */

import { z } from 'zod';

import { UUID_REGEX, uuidSchema, uuidSchemaOptional } from '@/lib/validation';

import type { LedgerCursor } from './dtos';

// === Enum Schemas ===

/** Canonical loyalty reason codes (ADR-019 v2) */
export const loyaltyReasonSchema = z.enum([
  'base_accrual',
  'promotion',
  'redeem',
  'manual_reward',
  'adjustment',
  'reversal',
]);

// === Base Accrual Schemas ===

/** Schema for base accrual on rating slip close */
export const accrueOnCloseInputSchema = z.object({
  ratingSlipId: uuidSchema('rating slip ID'),
  casinoId: uuidSchema('casino ID'),
  idempotencyKey: uuidSchema('idempotency key'),
});

export type AccrueOnCloseInput = z.infer<typeof accrueOnCloseInputSchema>;

// === Redemption Schemas ===

/** Schema for comp redemption (debit) */
export const redeemInputSchema = z.object({
  casinoId: uuidSchema('casino ID'),
  playerId: uuidSchema('player ID'),
  points: z
    .number()
    .int('Points must be an integer')
    .positive('Points must be positive'),
  issuedByStaffId: uuidSchema('staff ID'),
  note: z.string().min(1, 'Note is required for redemptions'),
  idempotencyKey: uuidSchema('idempotency key'),
  allowOverdraw: z.boolean().default(false).optional(),
  rewardId: uuidSchemaOptional('reward ID'),
  reference: z.string().optional(),
});

export type RedeemInput = z.infer<typeof redeemInputSchema>;

// === Manual Credit Schemas ===

/** Schema for manual credit (service recovery) */
export const manualCreditInputSchema = z.object({
  casinoId: uuidSchema('casino ID'),
  playerId: uuidSchema('player ID'),
  points: z
    .number()
    .int('Points must be an integer')
    .positive('Points must be positive'),
  awardedByStaffId: uuidSchema('staff ID'),
  note: z.string().min(1, 'Note is required for manual credits'),
  idempotencyKey: uuidSchema('idempotency key'),
});

export type ManualCreditInput = z.infer<typeof manualCreditInputSchema>;

// === Promotion Schemas ===

/** Schema for promotional overlay credit */
export const applyPromotionInputSchema = z.object({
  casinoId: uuidSchema('casino ID'),
  ratingSlipId: uuidSchema('rating slip ID'),
  campaignId: z.string().min(1, 'Campaign ID is required'),
  promoMultiplier: z
    .number()
    .positive('Multiplier must be positive')
    .optional(),
  bonusPoints: z
    .number()
    .int('Bonus points must be an integer')
    .nonnegative('Bonus points must be non-negative'),
  idempotencyKey: uuidSchema('idempotency key'),
});

export type ApplyPromotionInput = z.infer<typeof applyPromotionInputSchema>;

// === Query Parameter Schemas (Route Handlers) ===

/** Schema for suggestion query params (GET /api/v1/loyalty/suggestion) */
export const suggestionQuerySchema = z.object({
  ratingSlipId: uuidSchema('rating slip ID'),
  asOfTs: z.string().optional(),
});

export type SuggestionQuery = z.infer<typeof suggestionQuerySchema>;

/** Schema for player balance query params (GET /api/v1/players/{playerId}/loyalty) */
export const balanceQuerySchema = z.object({
  casinoId: uuidSchema('casino ID'),
});

export type BalanceQuery = z.infer<typeof balanceQuerySchema>;

// === Ledger Pagination Schemas ===

/**
 * Schema for ledger list query parameters.
 *
 * @see LEDGER-PAGINATION-CONTRACT.md §7.1
 */
export const ledgerListQuerySchema = z.object({
  casinoId: uuidSchema('casino ID'),
  playerId: uuidSchema('player ID'),

  /**
   * Opaque pagination cursor (base64-encoded JSON).
   * Omit for first page.
   */
  cursor: z.string().optional(),

  /**
   * Results per page (default 20, max 100).
   * Server enforces max to prevent DoS.
   */
  limit: z.coerce.number().int().min(1).max(100).default(20),

  /**
   * Filter by rating slip (optional).
   */
  ratingSlipId: uuidSchemaOptional('rating slip ID'),

  /**
   * Filter by visit (optional).
   */
  visitId: uuidSchemaOptional('visit ID'),

  /**
   * Filter by reason (optional).
   */
  reason: loyaltyReasonSchema.optional(),

  /**
   * Filter by date range start (ISO date: YYYY-MM-DD).
   */
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'fromDate must be YYYY-MM-DD format')
    .optional(),

  /**
   * Filter by date range end (ISO date: YYYY-MM-DD).
   */
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'toDate must be YYYY-MM-DD format')
    .optional(),
});

export type LedgerListQuery = z.infer<typeof ledgerListQuerySchema>;

// === Cursor Encoding/Decoding Helpers ===

/**
 * Encode ledger cursor to opaque base64url string.
 *
 * @see LEDGER-PAGINATION-CONTRACT.md §2.1
 */
export function encodeLedgerCursor(createdAt: string, id: string): string {
  const cursor: LedgerCursor = {
    created_at: createdAt,
    id,
  };

  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/**
 * Decode and validate ledger cursor from base64url string.
 * Throws error if cursor is malformed or invalid.
 *
 * @see LEDGER-PAGINATION-CONTRACT.md §2.1
 * @throws {Error} If cursor format is invalid
 */
export function decodeLedgerCursor(cursor: string): LedgerCursor {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf-8'),
    );

    // Validate structure
    if (!decoded.created_at || !decoded.id) {
      throw new Error('Cursor missing required fields (created_at, id)');
    }

    // Validate created_at is valid ISO timestamp
    if (isNaN(Date.parse(decoded.created_at))) {
      throw new Error('Invalid created_at timestamp in cursor');
    }

    // Validate id is valid UUID
    if (!UUID_REGEX.test(decoded.id)) {
      throw new Error('Invalid id UUID format in cursor');
    }

    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- Runtime validated above
    return decoded as LedgerCursor;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Invalid cursor format: ${message}`);
  }
}
