import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchAcceptInvite,
  fetchBootstrapCasino,
  fetchCreateInvite,
} from '@/services/casino/http';
import { casinoKeys } from '@/services/casino/keys';

/** Bootstrap a new casino tenant */
export function useBootstrapCasino() {
  return useMutation({
    mutationFn: fetchBootstrapCasino,
  });
}

/** Create a staff invite (admin-only) */
export function useCreateInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fetchCreateInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: casinoKeys.staffInvites.scope,
      });
    },
  });
}

/** Accept a staff invite */
export function useAcceptInvite() {
  return useMutation({
    mutationFn: fetchAcceptInvite,
  });
}
