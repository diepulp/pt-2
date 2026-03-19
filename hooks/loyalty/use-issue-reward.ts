/**
 * Issue Reward Mutation Hook
 *
 * Mutation hook for issuing rewards (comps and entitlements) via the
 * unified POST /api/v1/loyalty/issue endpoint.
 *
 * Uses useTransition for non-blocking UI (React 19 pattern).
 * Generates idempotency key as crypto.randomUUID() per mutation call.
 *
 * @see PRD-052 WS4 — Issuance UI
 * @see services/loyalty/dtos.ts — IssuanceResultDTO
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTransition, useCallback, useRef, useState } from 'react';

import { mutateJSON } from '@/lib/http/fetch-json';
import type { IssuanceResultDTO } from '@/services/loyalty/dtos';
import { loyaltyKeys } from '@/services/loyalty/keys';
import { player360DashboardKeys } from '@/services/player360-dashboard/keys';

// === Types ===

/** Input for the issue reward mutation */
export interface IssueRewardInput {
  /** Player ID to issue reward to */
  playerId: string;

  /** Reward catalog item ID */
  rewardId: string;

  /** Associated visit (optional) */
  visitId?: string;
}

/** Return value from useIssueReward hook */
export interface UseIssueRewardReturn {
  /** Triggers the issuance mutation */
  issueReward: (input: IssueRewardInput) => void;

  /** Whether the mutation is in progress (from useTransition) */
  isPending: boolean;

  /** The result of the last successful mutation */
  data: IssuanceResultDTO | null;

  /** Error from the last mutation attempt */
  error: Error | null;

  /** Reset result and error state */
  reset: () => void;
}

const ISSUE_ENDPOINT = '/api/v1/loyalty/issue';

// === Hook ===

/**
 * Mutation hook for issuing rewards via the unified issuance endpoint.
 *
 * - Generates a fresh idempotency key (crypto.randomUUID()) per call
 * - Uses useTransition for non-blocking UI updates
 * - On success: invalidates loyalty balance, ledger, and reward history queries
 * - Returns typed IssuanceResultDTO discriminated by `family` field
 *
 * @example
 * ```tsx
 * const { issueReward, isPending, data, error } = useIssueReward();
 *
 * <Button onClick={() => issueReward({ playerId, rewardId })} disabled={isPending}>
 *   {isPending ? 'Issuing...' : 'Confirm'}
 * </Button>
 * ```
 */
export function useIssueReward(): UseIssueRewardReturn {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<IssuanceResultDTO | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Ref to track the latest call and avoid stale closures
  const callIdRef = useRef(0);

  const issueReward = useCallback(
    (input: IssueRewardInput) => {
      const callId = ++callIdRef.current;
      const idempotencyKey = crypto.randomUUID();

      startTransition(async () => {
        try {
          const result = await mutateJSON<
            IssuanceResultDTO,
            {
              player_id: string;
              reward_id: string;
              visit_id?: string;
              idempotency_key: string;
            }
          >(
            ISSUE_ENDPOINT,
            {
              player_id: input.playerId,
              reward_id: input.rewardId,
              visit_id: input.visitId,
              idempotency_key: idempotencyKey,
            },
            idempotencyKey,
          );

          // Guard against stale callbacks
          if (callId !== callIdRef.current) return;

          setData(result);
          setError(null);

          // Invalidate loyalty queries on success
          queryClient.invalidateQueries({
            queryKey: loyaltyKeys.ledger.scope,
          });

          // Invalidate all balance queries (we have playerId but not casinoId in this context)
          queryClient.invalidateQueries({
            predicate: (query) =>
              query.queryKey[0] === 'loyalty' &&
              query.queryKey[1] === 'balance',
          });

          // Invalidate reward history
          queryClient.invalidateQueries({
            queryKey: player360DashboardKeys.rewardHistory.scope,
          });
        } catch (err) {
          // Guard against stale callbacks
          if (callId !== callIdRef.current) return;

          setError(err instanceof Error ? err : new Error(String(err)));
          setData(null);
        }
      });
    },
    [queryClient],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { issueReward, isPending, data, error, reset };
}
