/**
 * LoyaltyService Promo Instrument CRUD Operations
 *
 * Database operations for promo program and coupon management.
 * Uses RPCs for all write operations (SECURITY DEFINER with ADR-024 context injection).
 * Pattern A (Contract-First): Manual DTOs for cross-context consumption.
 *
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS2
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  CouponInventoryOutput,
  CouponInventoryQuery,
  CreatePromoProgramInput,
  IssueCouponInput,
  IssueCouponOutput,
  PromoCouponDTO,
  PromoCouponListQuery,
  PromoProgramDTO,
  PromoProgramListQuery,
  ReplaceCouponInput,
  ReplaceCouponOutput,
  UpdatePromoProgramInput,
  VoidCouponInput,
  VoidCouponOutput,
} from './dtos';
import {
  parseInventoryResponse,
  parseIssueCouponResponse,
  parsePromoCouponRow,
  parsePromoProgramRow,
  parseReplaceCouponResponse,
  parseVoidCouponResponse,
  toErrorShape,
} from './mappers';

// === Error Mapping ===

/**
 * Maps Postgres error codes and RPC error messages to domain errors.
 * Extends base loyalty error mapping with promo-specific errors.
 */
function mapPromoError(error: { code?: string; message: string }): DomainError {
  const message = error.message || '';

  // Handle RPC-raised exceptions
  if (message.includes('UNAUTHORIZED')) {
    return new DomainError(
      'UNAUTHORIZED',
      'RLS context not set (authentication required)',
    );
  }

  if (message.includes('PROMO_PROGRAM_NOT_FOUND')) {
    return new DomainError(
      'PROMO_PROGRAM_NOT_FOUND',
      'Promo program does not exist or belongs to different casino',
    );
  }

  if (message.includes('PROMO_PROGRAM_INACTIVE')) {
    return new DomainError(
      'PROMO_PROGRAM_INACTIVE',
      'Promo program is not active',
    );
  }

  if (message.includes('PROMO_PROGRAM_NOT_STARTED')) {
    return new DomainError(
      'PROMO_PROGRAM_NOT_STARTED',
      'Promo program has not started yet',
    );
  }

  if (message.includes('PROMO_PROGRAM_ENDED')) {
    return new DomainError('PROMO_PROGRAM_ENDED', 'Promo program has ended');
  }

  if (message.includes('COUPON_NOT_FOUND')) {
    return new DomainError(
      'COUPON_NOT_FOUND',
      'Coupon does not exist or belongs to different casino',
    );
  }

  if (message.includes('INVALID_COUPON_STATUS')) {
    return new DomainError(
      'INVALID_COUPON_STATUS',
      'Coupon cannot be modified in its current status',
    );
  }

  if (message.includes('ANONYMOUS_ISSUANCE_DISABLED')) {
    return new DomainError(
      'ANONYMOUS_ISSUANCE_DISABLED',
      'Casino requires player for promo issuance',
    );
  }

  if (message.includes('PLAYER_NOT_ENROLLED')) {
    return new DomainError(
      'PLAYER_NOT_ENROLLED',
      'Player is not enrolled at this casino',
    );
  }

  if (message.includes('VISIT_NOT_FOUND')) {
    return new DomainError(
      'VISIT_NOT_FOUND',
      'Visit does not exist at this casino',
    );
  }

  if (message.includes('FORBIDDEN')) {
    const roleMatch = message.match(/Role (\w+) cannot/);
    const roleInfo = roleMatch ? ` (current role: ${roleMatch[1]})` : '';
    return new DomainError('FORBIDDEN', `Insufficient permissions${roleInfo}`);
  }

  // Handle Postgres error codes
  if (error.code === '23505') {
    if (
      message.includes('validation_number') ||
      message.includes('idempotency_key')
    ) {
      return new DomainError(
        'DUPLICATE_VALIDATION_NUMBER',
        'A coupon with this validation number or idempotency key already exists',
      );
    }
    return new DomainError('DUPLICATE_ENTRY', 'Duplicate entry detected');
  }

  if (error.code === '23503') {
    if (message.includes('promo_program_id')) {
      return new DomainError(
        'PROMO_PROGRAM_NOT_FOUND',
        'Promo program not found',
      );
    }
    if (message.includes('player_id')) {
      return new DomainError('PLAYER_NOT_FOUND', 'Player not found');
    }
    if (message.includes('visit_id')) {
      return new DomainError('VISIT_NOT_FOUND', 'Visit not found');
    }
    return new DomainError(
      'FOREIGN_KEY_VIOLATION',
      'Referenced record not found',
    );
  }

  if (error.code === 'PGRST116' || message.includes('No rows found')) {
    return new DomainError('NOT_FOUND', 'Requested record not found');
  }

  return new DomainError('INTERNAL_ERROR', message, { details: error });
}

// === Promo Program Operations ===

/**
 * Lists promo programs for the current casino.
 *
 * @param supabase - Supabase client with RLS context
 * @param query - Query filters
 * @returns Array of PromoProgramDTO
 */
export async function listPrograms(
  supabase: SupabaseClient<Database>,
  query: PromoProgramListQuery = {},
): Promise<PromoProgramDTO[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Table not in types until migration applied
    let builder = (supabase as any)
      .from('promo_program')
      .select('*')
      .order('created_at', { ascending: false });

    if (query.status) {
      builder = builder.eq('status', query.status);
    }

    if (query.activeOnly) {
      const now = new Date().toISOString();
      builder = builder
        .eq('status', 'active')
        .or(`start_at.is.null,start_at.lte.${now}`)
        .or(`end_at.is.null,end_at.gte.${now}`);
    }

    const limit = Math.min(query.limit ?? 50, 100);
    builder = builder.limit(limit);

    if (query.offset) {
      builder = builder.range(query.offset, query.offset + limit - 1);
    }

    const { data, error } = await builder;

    if (error) {
      throw mapPromoError(error);
    }

    return (data ?? []).map((row: unknown) => parsePromoProgramRow(row));
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapPromoError(toErrorShape(error));
  }
}

/**
 * Gets a single promo program by ID.
 *
 * @param supabase - Supabase client with RLS context
 * @param programId - Program UUID
 * @returns PromoProgramDTO or null if not found
 */
export async function getProgram(
  supabase: SupabaseClient<Database>,
  programId: string,
): Promise<PromoProgramDTO | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Table not in types until migration applied
    const { data, error } = await (supabase as any)
      .from('promo_program')
      .select('*')
      .eq('id', programId)
      .maybeSingle();

    if (error) {
      throw mapPromoError(error);
    }

    if (!data) {
      return null;
    }

    return parsePromoProgramRow(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapPromoError(toErrorShape(error));
  }
}

/**
 * Creates a new promo program.
 *
 * @param supabase - Supabase client with RLS context
 * @param input - Program creation input
 * @returns Created PromoProgramDTO
 * @throws FORBIDDEN if caller lacks pit_boss/admin role
 */
export async function createProgram(
  supabase: SupabaseClient<Database>,
  input: CreatePromoProgramInput,
): Promise<PromoProgramDTO> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Table not in types until migration applied
    const { data, error } = await (supabase as any)
      .from('promo_program')
      .insert({
        name: input.name,
        promo_type: input.promoType ?? 'match_play',
        face_value_amount: input.faceValueAmount,
        required_match_wager_amount: input.requiredMatchWagerAmount,
        start_at: input.startAt ?? null,
        end_at: input.endAt ?? null,
        status: 'active',
      })
      .select('*')
      .single();

    if (error) {
      throw mapPromoError(error);
    }

    return parsePromoProgramRow(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapPromoError(toErrorShape(error));
  }
}

/**
 * Updates a promo program.
 *
 * @param supabase - Supabase client with RLS context
 * @param input - Program update input
 * @returns Updated PromoProgramDTO
 * @throws PROMO_PROGRAM_NOT_FOUND if program doesn't exist
 * @throws FORBIDDEN if caller lacks pit_boss/admin role
 */
export async function updateProgram(
  supabase: SupabaseClient<Database>,
  input: UpdatePromoProgramInput,
): Promise<PromoProgramDTO> {
  try {
    const updates: Record<string, unknown> = {};

    if (input.name !== undefined) updates.name = input.name;
    if (input.status !== undefined) updates.status = input.status;
    if (input.startAt !== undefined) updates.start_at = input.startAt;
    if (input.endAt !== undefined) updates.end_at = input.endAt;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Table not in types until migration applied
    const { data, error } = await (supabase as any)
      .from('promo_program')
      .update(updates)
      .eq('id', input.id)
      .select('*')
      .single();

    if (error) {
      throw mapPromoError(error);
    }

    return parsePromoProgramRow(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapPromoError(toErrorShape(error));
  }
}

// === Promo Coupon Operations ===

/**
 * Issues a promotional coupon via RPC.
 * ADR-024 compliant: RPC uses set_rls_context_from_staff().
 *
 * @param supabase - Supabase client with RLS context
 * @param input - Coupon issuance input
 * @returns IssueCouponOutput with coupon details
 * @throws PROMO_PROGRAM_NOT_FOUND if program doesn't exist
 * @throws PROMO_PROGRAM_INACTIVE if program is not active
 * @throws ANONYMOUS_ISSUANCE_DISABLED if casino requires player
 * @throws PLAYER_NOT_ENROLLED if player not at this casino
 */
export async function issueCoupon(
  supabase: SupabaseClient<Database>,
  input: IssueCouponInput,
): Promise<IssueCouponOutput> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in types until migration applied
    const { data, error } = await (supabase.rpc as any)(
      'rpc_issue_promo_coupon',
      {
        p_promo_program_id: input.promoProgramId,
        p_validation_number: input.validationNumber,
        p_idempotency_key: input.idempotencyKey,
        p_player_id: input.playerId ?? null,
        p_visit_id: input.visitId ?? null,
        p_expires_at: input.expiresAt ?? null,
        p_correlation_id: input.correlationId ?? null,
      },
    );

    if (error) {
      throw mapPromoError(error);
    }

    if (!data) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for coupon issuance',
      );
    }

    return parseIssueCouponResponse(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapPromoError(toErrorShape(error));
  }
}

/**
 * Voids a promotional coupon via RPC.
 * ADR-024 compliant: RPC uses set_rls_context_from_staff().
 *
 * @param supabase - Supabase client with RLS context
 * @param input - Coupon void input
 * @returns VoidCouponOutput with voided coupon details
 * @throws COUPON_NOT_FOUND if coupon doesn't exist
 * @throws INVALID_COUPON_STATUS if coupon cannot be voided
 */
export async function voidCoupon(
  supabase: SupabaseClient<Database>,
  input: VoidCouponInput,
): Promise<VoidCouponOutput> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in types until migration applied
    const { data, error } = await (supabase.rpc as any)(
      'rpc_void_promo_coupon',
      {
        p_coupon_id: input.couponId,
        p_idempotency_key: input.idempotencyKey,
        p_correlation_id: input.correlationId ?? null,
      },
    );

    if (error) {
      throw mapPromoError(error);
    }

    if (!data) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for coupon void',
      );
    }

    return parseVoidCouponResponse(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapPromoError(toErrorShape(error));
  }
}

/**
 * Replaces a promotional coupon via RPC.
 * ADR-024 compliant: RPC uses set_rls_context_from_staff().
 *
 * @param supabase - Supabase client with RLS context
 * @param input - Coupon replacement input
 * @returns ReplaceCouponOutput with old and new coupon details
 * @throws COUPON_NOT_FOUND if coupon doesn't exist
 * @throws INVALID_COUPON_STATUS if coupon cannot be replaced
 */
export async function replaceCoupon(
  supabase: SupabaseClient<Database>,
  input: ReplaceCouponInput,
): Promise<ReplaceCouponOutput> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in types until migration applied
    const { data, error } = await (supabase.rpc as any)(
      'rpc_replace_promo_coupon',
      {
        p_coupon_id: input.couponId,
        p_new_validation_number: input.newValidationNumber,
        p_idempotency_key: input.idempotencyKey,
        p_new_expires_at: input.newExpiresAt ?? null,
        p_correlation_id: input.correlationId ?? null,
      },
    );

    if (error) {
      throw mapPromoError(error);
    }

    if (!data) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for coupon replacement',
      );
    }

    return parseReplaceCouponResponse(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapPromoError(toErrorShape(error));
  }
}

/**
 * Gets coupon inventory summary by status.
 * SECURITY INVOKER: Uses caller's RLS context.
 *
 * @param supabase - Supabase client with RLS context
 * @param query - Inventory query filters
 * @returns CouponInventoryOutput with status breakdown
 */
export async function getCouponInventory(
  supabase: SupabaseClient<Database>,
  query: CouponInventoryQuery = {},
): Promise<CouponInventoryOutput> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in types until migration applied
    const { data, error } = await (supabase.rpc as any)(
      'rpc_promo_coupon_inventory',
      {
        p_promo_program_id: query.promoProgramId ?? null,
        p_status: query.status ?? null,
      },
    );

    if (error) {
      throw mapPromoError(error);
    }

    return parseInventoryResponse(data ?? []);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapPromoError(toErrorShape(error));
  }
}

/**
 * Lists promo coupons with filters.
 *
 * @param supabase - Supabase client with RLS context
 * @param query - Query filters
 * @returns Array of PromoCouponDTO
 */
export async function listCoupons(
  supabase: SupabaseClient<Database>,
  query: PromoCouponListQuery = {},
): Promise<PromoCouponDTO[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Table not in types until migration applied
    let builder = (supabase as any)
      .from('promo_coupon')
      .select('*')
      .order('issued_at', { ascending: false });

    if (query.promoProgramId) {
      builder = builder.eq('promo_program_id', query.promoProgramId);
    }

    if (query.status) {
      builder = builder.eq('status', query.status);
    }

    if (query.playerId) {
      builder = builder.eq('player_id', query.playerId);
    }

    if (query.visitId) {
      builder = builder.eq('visit_id', query.visitId);
    }

    if (query.expiringBefore) {
      builder = builder
        .eq('status', 'issued')
        .lt('expires_at', query.expiringBefore);
    }

    const limit = Math.min(query.limit ?? 50, 100);
    builder = builder.limit(limit);

    if (query.offset) {
      builder = builder.range(query.offset, query.offset + limit - 1);
    }

    const { data, error } = await builder;

    if (error) {
      throw mapPromoError(error);
    }

    return (data ?? []).map((row: unknown) => parsePromoCouponRow(row));
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapPromoError(toErrorShape(error));
  }
}

/**
 * Gets a single coupon by ID.
 *
 * @param supabase - Supabase client with RLS context
 * @param couponId - Coupon UUID
 * @returns PromoCouponDTO or null if not found
 */
export async function getCoupon(
  supabase: SupabaseClient<Database>,
  couponId: string,
): Promise<PromoCouponDTO | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Table not in types until migration applied
    const { data, error } = await (supabase as any)
      .from('promo_coupon')
      .select('*')
      .eq('id', couponId)
      .maybeSingle();

    if (error) {
      throw mapPromoError(error);
    }

    if (!data) {
      return null;
    }

    return parsePromoCouponRow(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapPromoError(toErrorShape(error));
  }
}

/**
 * Gets a coupon by validation number.
 *
 * @param supabase - Supabase client with RLS context
 * @param validationNumber - Coupon validation number
 * @returns PromoCouponDTO or null if not found
 */
export async function getCouponByValidationNumber(
  supabase: SupabaseClient<Database>,
  validationNumber: string,
): Promise<PromoCouponDTO | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Table not in types until migration applied
    const { data, error } = await (supabase as any)
      .from('promo_coupon')
      .select('*')
      .eq('validation_number', validationNumber)
      .maybeSingle();

    if (error) {
      throw mapPromoError(error);
    }

    if (!data) {
      return null;
    }

    return parsePromoCouponRow(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapPromoError(toErrorShape(error));
  }
}
