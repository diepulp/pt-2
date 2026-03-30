/**
 * RecognitionService CRUD Operations
 *
 * Thin wrappers around 3 SECURITY DEFINER RPCs.
 * All context derivation happens inside the RPCs (ADR-024).
 * Json results parsed via mappers (no type assertions per SLAD §327-359).
 *
 * @see PRD-051 / EXEC-051 WS2
 * @see ADR-044 D3 (activate), D4 (lookup), D6 (redeem)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type {
  ActivationResultDTO,
  RecognitionResultDTO,
  RedemptionResultDTO,
} from './dtos';
import {
  mapActivationResult,
  mapRecognitionRpcResult,
  mapRedemptionResult,
  toRecord,
} from './mappers';

// ADR-044 Phase 2: These RPCs exist on the remote DB but are not yet in locally-generated types.
// Using untyped RPC caller until `npm run db:types` catches up after the company-scoped migrations land locally.
function callRpc(
  supabase: SupabaseClient<Database>,
  name: string,
  params?: Record<string, unknown>,
) {
  // @ts-expect-error — RPC name not in generated types; exists on remote DB (ADR-044 Phase 2)
  return supabase.rpc(name, params);
}

// === Lookup ===

export async function lookupCompany(
  supabase: SupabaseClient<Database>,
  searchTerm: string,
): Promise<RecognitionResultDTO[]> {
  const { data, error } = await callRpc(supabase, 'rpc_lookup_player_company', {
    p_search_term: searchTerm,
  });

  if (error) throw error;
  if (!data) return [];

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => mapRecognitionRpcResult(row));
}

// === Activate ===

export async function activateLocally(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<ActivationResultDTO> {
  const { data, error } = await callRpc(
    supabase,
    'rpc_activate_player_locally',
    {
      p_player_id: playerId,
    },
  );

  if (error) throw error;

  return mapActivationResult(toRecord(data));
}

// === Redeem ===

export async function redeemLocally(
  supabase: SupabaseClient<Database>,
  playerId: string,
  amount: number,
  reason: string,
): Promise<RedemptionResultDTO> {
  const { data, error } = await callRpc(
    supabase,
    'rpc_redeem_loyalty_locally',
    {
      p_player_id: playerId,
      p_amount: amount,
      p_reason: reason,
    },
  );

  if (error) throw error;

  return mapRedemptionResult(toRecord(data));
}
