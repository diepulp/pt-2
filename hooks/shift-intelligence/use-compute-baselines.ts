'use client';

/**
 * Compute Baselines Mutation Hook (PRD-055 WS6)
 *
 * React Query mutation wrapping POST /api/shift-intelligence/compute-baselines.
 * On success, invalidates anomaly alerts cache so the dashboard refreshes
 * with re-evaluated baselines.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  BaselineComputeResultDTO,
  ComputeBaselineInput,
} from '@/services/shift-intelligence/dtos';
import { fetchComputeBaselines } from '@/services/shift-intelligence/http';
import { shiftIntelligenceKeys } from '@/services/shift-intelligence/keys';

export function useComputeBaselines() {
  const queryClient = useQueryClient();

  return useMutation<BaselineComputeResultDTO, Error, ComputeBaselineInput>({
    mutationFn: (input: ComputeBaselineInput) => fetchComputeBaselines(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: shiftIntelligenceKeys.anomalyAlerts.scope,
      });
    },
  });
}
