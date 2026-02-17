/**
 * LoyaltyService Promo Exposure Rollup Queries
 *
 * TypeScript wrappers for promo rollup RPC queries.
 * Used by shift dashboards for "Promo Lens" section (separate from cash KPIs).
 *
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS7
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  PromoExposureRollupDTO,
  PromoExposureRollupQuery,
} from './promo/dtos';

// Re-export for consumers
export type { PromoExposureRollupDTO, PromoExposureRollupQuery };

// === RPC Response Type ===

interface PromoExposureRpcResponse {
  casino_id: string;
  gaming_day: string | null;
  from_ts: string;
  to_ts: string;
  issued_count: number;
  total_issued_face_value: number;
  total_issued_patron_risk: number;
  outstanding_count: number;
  outstanding_face_value: number;
  voided_count: number;
  replaced_count: number;
  expiring_soon_count: number;
}

// === Type Guard ===

function isPromoExposureRpcResponse(v: unknown): v is PromoExposureRpcResponse {
  return (
    typeof v === 'object' &&
    v !== null &&
    'casino_id' in v &&
    'from_ts' in v &&
    'to_ts' in v &&
    'issued_count' in v &&
    'outstanding_count' in v
  );
}

// === Mapper ===

/**
 * Maps RPC response to PromoExposureRollupDTO.
 */
function toPromoExposureRollupDTO(
  response: PromoExposureRpcResponse,
): PromoExposureRollupDTO {
  return {
    casinoId: response.casino_id,
    gamingDay: response.gaming_day,
    fromTs: response.from_ts,
    toTs: response.to_ts,
    issuedCount: Number(response.issued_count),
    totalIssuedFaceValue: Number(response.total_issued_face_value),
    totalIssuedPatronRisk: Number(response.total_issued_patron_risk),
    outstandingCount: Number(response.outstanding_count),
    outstandingFaceValue: Number(response.outstanding_face_value),
    voidedCount: Number(response.voided_count),
    replacedCount: Number(response.replaced_count),
    expiringSoonCount: Number(response.expiring_soon_count),
  };
}

/**
 * Parses unknown RPC response to PromoExposureRollupDTO.
 * @throws Error if response shape is invalid
 */
function parsePromoExposureResponse(data: unknown): PromoExposureRollupDTO {
  if (!isPromoExposureRpcResponse(data)) {
    throw new Error('Invalid PromoExposureRollup RPC response structure');
  }
  return toPromoExposureRollupDTO(data);
}

// === Error Mapping ===

/**
 * Extracts error shape from unknown error.
 */

function toErrorShape(error: unknown): { code?: string; message: string } {
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    const message =
      typeof errObj.message === 'string' ? errObj.message : String(error);
    const code = typeof errObj.code === 'string' ? errObj.code : undefined;
    return { code, message };
  }
  return { message: String(error) };
}

function mapRollupError(error: {
  code?: string;
  message: string;
}): DomainError {
  const message = error.message || '';

  if (message.includes('UNAUTHORIZED')) {
    return new DomainError(
      'UNAUTHORIZED',
      'Casino context not available (authentication required)',
    );
  }

  return new DomainError('INTERNAL_ERROR', message, { details: error });
}

// === Rollup Query ===

/**
 * Gets promo exposure rollup metrics for shift dashboards.
 * SECURITY INVOKER: Uses caller's RLS context.
 *
 * @param supabase - Supabase client with RLS context
 * @param query - Optional query filters (gamingDay, shiftId, fromTs, toTs)
 * @returns PromoExposureRollupDTO with promo exposure metrics
 * @throws UNAUTHORIZED if casino context not set
 */
export async function getPromoExposureRollup(
  supabase: SupabaseClient<Database>,
  query: PromoExposureRollupQuery = {},
): Promise<PromoExposureRollupDTO> {
  try {
    const { data, error } = await supabase.rpc('rpc_promo_exposure_rollup', {
      p_gaming_day: query.gamingDay ?? undefined,
      p_shift_id: query.shiftId ?? undefined,
      p_from_ts: query.fromTs ?? undefined,
      p_to_ts: query.toTs ?? undefined,
    });

    if (error) {
      throw mapRollupError(error);
    }

    if (!data) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for promo exposure rollup',
      );
    }

    return parsePromoExposureResponse(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapRollupError(toErrorShape(error));
  }
}
