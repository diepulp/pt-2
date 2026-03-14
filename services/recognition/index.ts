/**
 * RecognitionService — Cross-Property Player Recognition + Entitlement
 *
 * Cross-cutting service spanning Player, Casino, Loyalty, Visit contexts.
 * Wraps 3 SECURITY DEFINER RPCs. All context derivation is server-side (ADR-024).
 *
 * Pattern A (Contract-First): Manual DTOs for composite RPC results.
 * Functional factory: createRecognitionService(supabase).
 *
 * @see PRD-051 Cross-Property Player Recognition and Loyalty Entitlement
 * @see ADR-044 Decisions D3, D4, D6, D7
 * @see EXEC-051 WS2
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { activateLocally, lookupCompany, redeemLocally } from './crud';
import type {
  ActivationResultDTO,
  RecognitionResultDTO,
  RedemptionResultDTO,
} from './dtos';

// === Service Interface ===

export interface RecognitionServiceInterface {
  /** Company-scoped player lookup (ADR-044 D4) */
  lookupCompany(searchTerm: string): Promise<RecognitionResultDTO[]>;

  /** Local activation — creates enrollment + loyalty row (ADR-044 D3) */
  activateLocally(playerId: string): Promise<ActivationResultDTO>;

  /** Local redemption — atomic balance debit (ADR-044 D6) */
  redeemLocally(
    playerId: string,
    amount: number,
    reason: string,
  ): Promise<RedemptionResultDTO>;
}

// === Service Factory ===

export function createRecognitionService(
  supabase: SupabaseClient<Database>,
): RecognitionServiceInterface {
  return {
    lookupCompany: (searchTerm) => lookupCompany(supabase, searchTerm),
    activateLocally: (playerId) => activateLocally(supabase, playerId),
    redeemLocally: (playerId, amount, reason) =>
      redeemLocally(supabase, playerId, amount, reason),
  };
}

// === Re-exports ===

export type {
  ActivationResultDTO,
  EnrolledCasinoDTO,
  LoyaltyEntitlementDTO,
  PropertyLoyaltyDTO,
  RecognitionResultDTO,
  RedemptionResultDTO,
} from './dtos';

export { recognitionKeys } from './keys';

export {
  ActivateLocallyInput,
  LookupCompanyInput,
  RedeemLoyaltyInput,
} from './schemas';

export type {
  ActivateLocallyInputType,
  LookupCompanyInputType,
  RedeemLoyaltyInputType,
} from './schemas';

export {
  activatePlayerLocally,
  lookupPlayerCompany,
  redeemLoyaltyLocally,
} from './http';
