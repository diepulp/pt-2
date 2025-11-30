/**
 * Casino Query Hooks
 *
 * Hooks for fetching casino list and detail data.
 *
 * @see services/casino/http.ts - HTTP fetchers
 * @see services/casino/keys.ts - Query key factories
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  CasinoDTO,
  CasinoListFilters,
  CreateCasinoDTO,
  UpdateCasinoDTO,
} from "@/services/casino/dtos";
import {
  getCasinos,
  getCasino,
  createCasino,
  updateCasino,
  deleteCasino,
} from "@/services/casino/http";
import { casinoKeys } from "@/services/casino/keys";

/**
 * Fetches a paginated list of casinos.
 *
 * @param filters - Optional filters for status, cursor, limit
 */
export function useCasinos(filters: CasinoListFilters = {}) {
  return useQuery({
    queryKey: casinoKeys.list(filters),
    queryFn: () => getCasinos(filters),
  });
}

/**
 * Fetches a single casino by ID.
 *
 * @param casinoId - Casino UUID
 */
export function useCasino(casinoId: string) {
  return useQuery({
    queryKey: casinoKeys.detail(casinoId),
    queryFn: () => getCasino(casinoId),
    enabled: !!casinoId,
  });
}

/**
 * Creates a new casino.
 * Invalidates the casino list on success.
 */
export function useCreateCasino() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCasinoDTO) => createCasino(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: casinoKeys.list.scope });
    },
  });
}

/**
 * Updates an existing casino.
 * Invalidates both the list and detail cache on success.
 */
export function useUpdateCasino() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCasinoDTO }) =>
      updateCasino(id, input),
    onSuccess: (data: CasinoDTO) => {
      queryClient.invalidateQueries({ queryKey: casinoKeys.list.scope });
      queryClient.invalidateQueries({ queryKey: casinoKeys.detail(data.id) });
    },
  });
}

/**
 * Deletes a casino.
 * Invalidates the casino list on success.
 */
export function useDeleteCasino() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCasino(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: casinoKeys.list.scope });
    },
  });
}
