'use client';

/**
 * Recognition mutation hooks — local activation + redemption.
 *
 * Both invalidate recognition queries on success.
 * Redemption also invalidates loyalty queries.
 *
 * @see PRD-051 / EXEC-051 WS4
 * @see ADR-044 D3 (activate), D6 (redeem)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { loyaltyKeys } from '@/services/loyalty/keys';
import {
  activatePlayerLocally,
  redeemLoyaltyLocally,
  recognitionKeys,
} from '@/services/recognition';
import type {
  ActivationResultDTO,
  RedemptionResultDTO,
} from '@/services/recognition';

// === Activate Locally ===

export function useActivateLocally() {
  const queryClient = useQueryClient();

  return useMutation<ActivationResultDTO, Error, string>({
    mutationKey: recognitionKeys.activate(),
    mutationFn: (playerId: string) => activatePlayerLocally(playerId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: recognitionKeys.root,
      });
    },
  });
}

// === Redeem Locally ===

interface RedeemParams {
  playerId: string;
  amount: number;
  reason: string;
}

export function useRedeemLocally() {
  const queryClient = useQueryClient();

  return useMutation<RedemptionResultDTO, Error, RedeemParams>({
    mutationKey: recognitionKeys.redeem(),
    mutationFn: ({ playerId, amount, reason }: RedeemParams) =>
      redeemLoyaltyLocally(playerId, amount, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: recognitionKeys.root,
      });
      queryClient.invalidateQueries({
        queryKey: loyaltyKeys.root,
      });
    },
  });
}
