import type { SupabaseClient } from "@supabase/supabase-js";

type Nullable<T> = T | null | undefined;

export type CreateFinancialTxnArgs = {
  casinoId: string;
  playerId: string;
  amount: number;
  tenderType?: Nullable<string>;
  createdAt?: Nullable<string>;
  visitId?: Nullable<string>;
  ratingSlipId?: Nullable<string>;
};

export async function createFinancialTransaction(
  supabase: SupabaseClient,
  {
    casinoId,
    playerId,
    amount,
    tenderType,
    createdAt,
    visitId,
    ratingSlipId,
  }: CreateFinancialTxnArgs,
) {
  const { data, error } = await supabase.rpc("rpc_create_financial_txn", {
    p_casino_id: casinoId,
    p_player_id: playerId,
    p_amount: amount,
    p_tender_type: tenderType ?? null,
    p_created_at: createdAt ?? null,
    p_visit_id: visitId ?? null,
    p_rating_slip_id: ratingSlipId ?? null,
  });

  if (error) {
    throw error;
  }

  return data;
}
