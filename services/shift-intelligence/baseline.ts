/**
 * ShiftIntelligenceService — Baseline Computation (PRD-055)
 * Calls rpc_compute_rolling_baseline to compute/refresh baselines.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { Database } from '@/types/database.types';

import type { BaselineComputeResultDTO, ComputeBaselineInput } from './dtos';
import { mapComputeResult } from './mappers';

export async function computeBaselines(
  supabase: SupabaseClient<Database>,
  input?: ComputeBaselineInput,
): Promise<BaselineComputeResultDTO> {
  const { data, error } = await supabase.rpc('rpc_compute_rolling_baseline', {
    p_gaming_day: input?.gaming_day,
    p_table_id: input?.table_id,
  });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to compute baselines: ${error.message}`,
      { details: safeErrorDetails(error) },
    );
  }

  if (!data || data.length === 0) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'Baseline computation returned no result',
    );
  }

  return mapComputeResult(data[0]);
}
