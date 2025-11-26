import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { casinoKeys, type CasinoFilters } from '@/services/casino/keys';
import {
  getCasinos,
  getCasinoById,
  createCasino,
  updateCasino,
  deleteCasino,
  getStaffByCasino,
  getCasinoSettings,
  computeGamingDay,
  type CasinoDTO,
  type CasinoCreateDTO,
  type CasinoUpdateDTO,
  type StaffDTO,
  type CasinoSettingsDTO,
} from '@/app/actions/casino';

// ============================================================================
// Casino CRUD Hooks
// ============================================================================

export function useCasinos(filters?: CasinoFilters) {
  return useQuery({
    queryKey: casinoKeys.list(filters),
    queryFn: () => getCasinos(filters),
  });
}

export function useCasino(casinoId: string) {
  return useQuery({
    queryKey: casinoKeys.detail(casinoId),
    queryFn: () => getCasinoById(casinoId),
    enabled: !!casinoId,
  });
}

export function useCreateCasino() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CasinoCreateDTO) => createCasino(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: casinoKeys.list.scope,
      });
    },
  });
}

export function useUpdateCasino() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CasinoUpdateDTO }) =>
      updateCasino(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: casinoKeys.list.scope,
      });
      queryClient.invalidateQueries({
        queryKey: casinoKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteCasino() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCasino(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: casinoKeys.list.scope,
      });
    },
  });
}

// ============================================================================
// Staff Hooks
// ============================================================================

export function useCasinoStaff(casinoId: string) {
  return useQuery({
    queryKey: casinoKeys.staff(casinoId),
    queryFn: () => getStaffByCasino(casinoId),
    enabled: !!casinoId,
  });
}

// ============================================================================
// Settings Hooks
// ============================================================================

export function useCasinoSettings(casinoId: string) {
  return useQuery({
    queryKey: casinoKeys.settings(casinoId),
    queryFn: () => getCasinoSettings(casinoId),
    enabled: !!casinoId,
  });
}

export function useGamingDay(casinoId: string) {
  return useQuery({
    queryKey: [...casinoKeys.settings(casinoId), 'gaming-day'],
    queryFn: () => computeGamingDay(casinoId),
    enabled: !!casinoId,
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// Type Exports
// ============================================================================

export type { CasinoDTO, CasinoCreateDTO, CasinoUpdateDTO, StaffDTO, CasinoSettingsDTO };
