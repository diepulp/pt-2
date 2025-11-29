import { serializeKeyFilters } from "@/services/shared/key-utils";

export type RatingSlipListFilters = {
  casinoId?: string;
  visitId?: string;
  playerId?: string;
  status?: "OPEN" | "PAUSED" | "CLOSED";
  cursor?: string;
  limit?: number;
};

type VisitScopedFilters = Pick<
  RatingSlipListFilters,
  "cursor" | "limit" | "status"
>;

const ROOT = ["rating-slip"] as const;
const serialize = (filters: RatingSlipListFilters = {}) =>
  serializeKeyFilters(filters);

export const ratingSlipKeys = {
  root: ROOT,
  list: Object.assign(
    (filters: RatingSlipListFilters = {}) =>
      [...ROOT, "list", serialize(filters)] as const,
    { scope: [...ROOT, "list"] as const },
  ),
  detail: (ratingSlipId: string) => [...ROOT, "detail", ratingSlipId] as const,
  byVisit: (visitId: string, filters: VisitScopedFilters = {}) =>
    [...ROOT, "by-visit", visitId, serializeKeyFilters(filters)] as const,
  byPlayer: (playerId: string, filters: VisitScopedFilters = {}) =>
    [...ROOT, "by-player", playerId, serializeKeyFilters(filters)] as const,
  create: () => [...ROOT, "create"] as const,
  update: (ratingSlipId: string) => [...ROOT, "update", ratingSlipId] as const,
  close: (ratingSlipId: string) => [...ROOT, "close", ratingSlipId] as const,
  loyaltyImpact: (ratingSlipId: string) =>
    [...ROOT, "loyalty-impact", ratingSlipId] as const,
  // Lifecycle mutations
  start: () => [...ROOT, "mutations", "start"] as const,
  pause: (slipId: string) => [...ROOT, "mutations", "pause", slipId] as const,
  resume: (slipId: string) => [...ROOT, "mutations", "resume", slipId] as const,
  // Queries
  duration: (slipId: string) => [...ROOT, "duration", slipId] as const,
};
