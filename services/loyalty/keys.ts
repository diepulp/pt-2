import { serializeKeyFilters } from "@/services/shared/key-utils";

export type LoyaltyLedgerFilters = {
  casinoId?: string;
  playerId?: string;
  ratingSlipId?: string;
  cursor?: string;
  limit?: number;
};

const ROOT = ["loyalty"] as const;
const serialize = (filters: LoyaltyLedgerFilters = {}) =>
  serializeKeyFilters(filters);

export const loyaltyKeys = {
  root: ROOT,
  playerSummary: (playerId: string) => [...ROOT, "player", playerId] as const,
  playerBalance: (playerId: string, casinoId: string) =>
    [...ROOT, "balance", playerId, casinoId] as const,
  ledger: Object.assign(
    (filters: LoyaltyLedgerFilters = {}) =>
      [...ROOT, "ledger", serialize(filters)] as const,
    { scope: [...ROOT, "ledger"] as const },
  ),
  midSessionReward: (ratingSlipId: string) =>
    [...ROOT, "mid-session-reward", ratingSlipId] as const,
  recalculation: (playerId: string) => [...ROOT, "recalc", playerId] as const,
};
