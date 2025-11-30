/**
 * Casino Settings Query Hooks
 *
 * Hooks for fetching and updating casino settings.
 * Uses RLS-scoped endpoint (no casinoId parameter needed).
 *
 * @see services/casino/http.ts - HTTP fetchers
 * @see services/casino/keys.ts - Query key factories
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import type { UpdateCasinoSettingsDTO } from "@/services/casino/dtos";
import {
  getCasinoSettings,
  updateCasinoSettings,
} from "@/services/casino/http";
import { casinoKeys } from "@/services/casino/keys";

/**
 * Fetches settings for the authenticated user's casino.
 * RLS automatically scopes to the user's casino.
 */
export function useCasinoSettings() {
  return useQuery({
    queryKey: casinoKeys.settings(),
    queryFn: getCasinoSettings,
  });
}

/**
 * Updates settings for the authenticated user's casino.
 * Invalidates the settings cache on success.
 *
 * Warning: Changing timezone or gaming_day_start_time affects all
 * downstream services. UI should warn operators before changes.
 */
export function useUpdateCasinoSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateCasinoSettingsDTO) => updateCasinoSettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: casinoKeys.settings() });
      // Also invalidate gaming day since timezone/start time may have changed
      queryClient.invalidateQueries({ queryKey: casinoKeys.root });
    },
  });
}
