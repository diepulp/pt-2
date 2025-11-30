/**
 * Casino React Query Hooks (Compatibility Layer)
 *
 * Re-exports from the new hooks/casino module for backward compatibility.
 * Components using these hooks will work unchanged, but new code should
 * import directly from '@/hooks/casino'.
 *
 * @deprecated Import from '@/hooks/casino' instead for new code.
 * @see hooks/casino/index.ts - New hook location
 * @see services/casino/http.ts - HTTP fetchers
 * @see services/casino/keys.ts - Query key factories
 */

import { useQuery } from "@tanstack/react-query";

import type {
  CasinoSettingsDTO,
  CasinoStaffFilters,
  GamingDayDTO,
  StaffDTO,
} from "@/services/casino/dtos";
import {
  getCasinoStaff,
  getCasinoSettings,
  getGamingDay,
} from "@/services/casino/http";
import { casinoKeys } from "@/services/casino/keys";

/**
 * Fetches staff for the authenticated user's casino.
 *
 * @param casinoId - Casino ID (kept for backward compatibility, ignored for RLS-scoped queries)
 * @param filters - Optional filters for status and role
 * @deprecated Use useCasinoStaff from '@/hooks/casino' instead
 */
export function useCasinoStaff(
  casinoId: string,
  filters: Omit<CasinoStaffFilters, "cursor" | "limit"> = {},
) {
  return useQuery({
    // Include casinoId in key for cache differentiation during migration
    queryKey: [...casinoKeys.staff(filters), casinoId],
    queryFn: async () => {
      const result = await getCasinoStaff(filters);
      return result.items;
    },
    enabled: !!casinoId,
  });
}

/**
 * Fetches settings for the authenticated user's casino.
 *
 * @param casinoId - Casino ID (kept for backward compatibility, ignored for RLS-scoped queries)
 * @deprecated Use useCasinoSettings from '@/hooks/casino' instead
 */
export function useCasinoSettings(casinoId: string) {
  return useQuery({
    // Include casinoId in key for cache differentiation during migration
    queryKey: [...casinoKeys.settings(), casinoId],
    queryFn: getCasinoSettings,
    enabled: !!casinoId,
  });
}

/**
 * Computes the current gaming day for the casino.
 *
 * @param casinoId - Casino ID (kept for backward compatibility, ignored for RLS-scoped queries)
 * @deprecated Use useGamingDay from '@/hooks/casino' instead
 */
export function useGamingDay(casinoId: string) {
  return useQuery({
    queryKey: casinoKeys.gamingDay(),
    queryFn: async (): Promise<string> => {
      const result: GamingDayDTO = await getGamingDay();
      return result.gaming_day;
    },
    enabled: !!casinoId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export type { StaffDTO, CasinoSettingsDTO };
