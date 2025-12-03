import { serializeKeyFilters } from "@/services/shared/key-utils";

import type { PlayerListFilters } from "./dtos";

const ROOT = ["player"] as const;
const serialize = (filters: PlayerListFilters = {}) =>
  serializeKeyFilters(filters);

export const playerKeys = {
  root: ROOT,
  list: Object.assign(
    (filters: PlayerListFilters = {}) =>
      [...ROOT, "list", serialize(filters)] as const,
    { scope: [...ROOT, "list"] as const },
  ),
  infinite: (filters: PlayerListFilters = {}) =>
    [...ROOT, "infinite", serialize(filters)] as const,
  detail: (playerId: string) => [...ROOT, "detail", playerId] as const,
  search: (query: string) => [...ROOT, "search", query] as const,
  create: () => [...ROOT, "create"] as const,
  update: (playerId: string) => [...ROOT, "update", playerId] as const,
  loyaltySnapshot: (playerId: string) =>
    [...ROOT, "loyalty", playerId] as const,
};
