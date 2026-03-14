/**
 * RecognitionService Zod Schemas
 *
 * Input validation for recognition API endpoints (ADR-013).
 * Located in service directory, NOT inline in route handlers.
 *
 * @see PRD-051 / EXEC-051 WS3
 */

import { z } from 'zod';

/** Company player lookup input */
export const LookupCompanyInput = z.object({
  search_term: z
    .string()
    .min(2, 'Search term must be at least 2 characters')
    .max(100, 'Search term must be at most 100 characters'),
});

export type LookupCompanyInputType = z.infer<typeof LookupCompanyInput>;

/** Local activation input */
export const ActivateLocallyInput = z.object({
  player_id: z.string().uuid('Invalid player ID format'),
});

export type ActivateLocallyInputType = z.infer<typeof ActivateLocallyInput>;

/** Local redemption input */
export const RedeemLoyaltyInput = z.object({
  player_id: z.string().uuid('Invalid player ID format'),
  amount: z
    .number()
    .int('Amount must be a whole number')
    .positive('Amount must be positive'),
  reason: z
    .string()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be at most 500 characters'),
});

export type RedeemLoyaltyInputType = z.infer<typeof RedeemLoyaltyInput>;
