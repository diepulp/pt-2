/**
 * Casino Staff Query Hooks
 *
 * Hooks for fetching staff data for the authenticated user's casino.
 * Uses RLS-scoped endpoint (no casinoId parameter needed).
 *
 * @see services/casino/http.ts - HTTP fetchers
 * @see services/casino/keys.ts - Query key factories
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  CasinoStaffFilters,
  CreateStaffDTO,
} from '@/services/casino/dtos';
import { getCasinoStaff, createStaff } from '@/services/casino/http';
import { casinoKeys } from '@/services/casino/keys';

/**
 * Fetches a paginated list of staff for the authenticated user's casino.
 * RLS automatically scopes to the user's casino.
 *
 * @param filters - Optional filters for status, role, cursor, limit
 */
export function useCasinoStaff(filters: CasinoStaffFilters = {}) {
  return useQuery({
    queryKey: casinoKeys.staff(filters),
    queryFn: () => getCasinoStaff(filters),
  });
}

/**
 * Creates a new staff member.
 * Invalidates the staff list cache on success.
 *
 * Role constraint enforced:
 * - Dealer: Cannot have user_id (non-authenticated)
 * - Pit Boss/Admin: Must have user_id (authenticated)
 */
export function useCreateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateStaffDTO) => createStaff(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: casinoKeys.staff.scope });
    },
  });
}
