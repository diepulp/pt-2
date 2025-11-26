import { useQuery } from '@tanstack/react-query';
import { casinoKeys } from '@/services/casino/keys';
import { getStaffByCasino, getCasinoSettings, computeGamingDay, type StaffDTO, type CasinoSettingsDTO } from '@/app/actions/casino';

export function useCasinoStaff(casinoId: string) {
  return useQuery({
    queryKey: casinoKeys.staff(casinoId),
    queryFn: () => getStaffByCasino(casinoId),
    enabled: !!casinoId,
  });
}

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

export type { StaffDTO, CasinoSettingsDTO };
