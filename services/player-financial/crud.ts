/**
 * PlayerFinancialService CRUD Operations
 *
 * Database operations for financial transaction management.
 * Uses RPC for idempotent transaction creation with validation.
 *
 * Pattern A (Contract-First): Manual DTOs for cross-context consumption.
 *
 * @see PRD-009 Player Financial Service
 * @see EXECUTION-SPEC-PRD-009.md WS2
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  CreateFinancialTxnInput,
  FinancialTransactionDTO,
  FinancialTxnListQuery,
  VisitFinancialSummaryDTO,
} from './dtos';
import {
  toFinancialTransactionDTO,
  toFinancialTransactionDTOFromRpc,
  toFinancialTransactionDTOList,
  toFinancialTransactionDTOOrNull,
  toVisitFinancialSummaryDTO,
  toVisitFinancialSummaryDTOOrNull,
} from './mappers';
import {
  FINANCIAL_TXN_SELECT,
  FINANCIAL_TXN_SELECT_LIST,
  VISIT_SUMMARY_SELECT,
} from './selects';

// === Error Mapping ===

/**
 * Maps Postgres error codes and RPC error messages to domain errors.
 * Prevents raw database errors from leaking to callers.
 */
function mapDatabaseError(error: {
  code?: string;
  message: string;
}): DomainError {
  const message = error.message || '';

  // Handle RPC-raised exceptions (from migration validation)
  if (message.includes('TRANSACTION_NOT_FOUND')) {
    return new DomainError(
      'TRANSACTION_NOT_FOUND',
      'Financial transaction not found',
    );
  }

  if (message.includes('PLAYER_NOT_FOUND')) {
    return new DomainError('PLAYER_NOT_FOUND', 'Player not found');
  }

  if (message.includes('VISIT_NOT_FOUND')) {
    return new DomainError('VISIT_NOT_FOUND', 'Visit not found');
  }

  if (message.includes('VISIT_NOT_OPEN')) {
    return new DomainError(
      'VISIT_NOT_OPEN',
      'Visit is not active. Cannot create transaction.',
    );
  }

  if (message.includes('TRANSACTION_AMOUNT_INVALID')) {
    return new DomainError(
      'TRANSACTION_AMOUNT_INVALID',
      'Transaction amount must be positive',
    );
  }

  // Handle Postgres error codes
  // 23505 = Unique constraint violation (idempotency key)
  if (error.code === '23505') {
    if (message.includes('idempotency_key')) {
      return new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'A transaction with this idempotency key already exists',
      );
    }
    return new DomainError(
      'UNIQUE_VIOLATION',
      'Duplicate financial transaction detected',
    );
  }

  // 23503 = Foreign key violation
  if (error.code === '23503') {
    if (message.includes('player_id')) {
      return new DomainError('PLAYER_NOT_FOUND', 'Player not found');
    }
    if (message.includes('visit_id')) {
      return new DomainError('VISIT_NOT_FOUND', 'Visit not found');
    }
    if (message.includes('rating_slip_id')) {
      return new DomainError('RATING_SLIP_NOT_FOUND', 'Rating slip not found');
    }
    return new DomainError(
      'FOREIGN_KEY_VIOLATION',
      'Referenced record not found',
    );
  }

  // PGRST116 = Not found (no rows returned)
  if (error.code === 'PGRST116' || message.includes('No rows found')) {
    return new DomainError(
      'TRANSACTION_NOT_FOUND',
      'Financial transaction not found',
    );
  }

  // Default to internal error
  return new DomainError('INTERNAL_ERROR', message, { details: error });
}

// === Create Operation (RPC-backed) ===

/**
 * Creates a new financial transaction via RPC with idempotency.
 * Uses rpc_create_financial_txn which validates visit status, amount, etc.
 *
 * @param supabase - Supabase client with RLS context
 * @param input - Transaction creation input
 * @returns Created transaction DTO
 * @throws TRANSACTION_AMOUNT_INVALID if amount <= 0
 * @throws VISIT_NOT_FOUND if visit doesn't exist
 * @throws VISIT_NOT_OPEN if visit is not active
 * @throws IDEMPOTENCY_CONFLICT if idempotency key already used
 */
export async function createTransaction(
  supabase: SupabaseClient<Database>,
  input: CreateFinancialTxnInput,
): Promise<FinancialTransactionDTO> {
  try {
    // Type assertion needed due to RPC overloads - we're using the full signature
    // that returns the complete transaction object (not just string ID)
    type RpcReturnType =
      Database['public']['Tables']['player_financial_transaction']['Row'];

    // Note: p_external_ref added by migration 20260217153443 (PRD-033). Type widening
    // via `as any` needed until db:types-local is run against the updated local DB.
    /* eslint-disable @typescript-eslint/no-explicit-any, custom-rules/no-dto-type-assertions -- RPC overload + pending types regen */
    const { data, error } = (await supabase.rpc('rpc_create_financial_txn', {
      p_casino_id: input.casino_id,
      p_player_id: input.player_id,
      p_visit_id: input.visit_id,
      p_amount: input.amount,
      p_direction: input.direction,
      p_source: input.source,
      p_tender_type: input.tender_type,
      p_created_by_staff_id: input.created_by_staff_id,
      p_rating_slip_id: input.rating_slip_id ?? undefined,
      p_related_transaction_id: input.related_transaction_id ?? undefined,
      p_idempotency_key: input.idempotency_key ?? undefined,
      p_created_at: input.created_at ?? undefined,
      ...(input.external_ref ? { p_external_ref: input.external_ref } : {}),
    } as any)) as {
      data: RpcReturnType | null;
      error: { code?: string; message: string } | null;
    };
    /* eslint-enable @typescript-eslint/no-explicit-any, custom-rules/no-dto-type-assertions */

    if (error) {
      throw mapDatabaseError(error);
    }

    if (!data) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'RPC returned no data for financial transaction creation',
      );
    }

    return toFinancialTransactionDTOFromRpc(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- catch block error typing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

// === Read Operations ===

/**
 * Gets a single financial transaction by ID.
 *
 * @param supabase - Supabase client with RLS context
 * @param id - Transaction UUID
 * @returns Transaction DTO or null if not found
 */
export async function getById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<FinancialTransactionDTO | null> {
  try {
    const { data, error } = await supabase
      .from('player_financial_transaction')
      .select(FINANCIAL_TXN_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      // PGRST116 means "no rows found" - return null instead of throwing
      if (error.code === 'PGRST116') {
        return null;
      }
      throw mapDatabaseError(error);
    }

    return toFinancialTransactionDTOOrNull(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- catch block error typing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

/**
 * Gets a financial transaction by idempotency key.
 * Used for duplicate detection in idempotent POST requests.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID for RLS scoping
 * @param idempotencyKey - Idempotency key to search for
 * @returns Transaction DTO or null if not found
 */
export async function getByIdempotencyKey(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  idempotencyKey: string,
): Promise<FinancialTransactionDTO | null> {
  try {
    const { data, error } = await supabase
      .from('player_financial_transaction')
      .select(FINANCIAL_TXN_SELECT)
      .eq('casino_id', casinoId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error);
    }

    return toFinancialTransactionDTOOrNull(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- catch block error typing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

/**
 * Lists financial transactions with pagination and filters.
 * RLS automatically scopes results to the casino.
 *
 * @param supabase - Supabase client with RLS context
 * @param query - List filters (player_id, visit_id, direction, source, etc.)
 * @returns Paginated transaction list with cursor
 */
export async function list(
  supabase: SupabaseClient<Database>,
  query: FinancialTxnListQuery = {},
): Promise<{ items: FinancialTransactionDTO[]; cursor: string | null }> {
  try {
    const {
      player_id,
      visit_id,
      table_id,
      direction,
      source,
      tender_type,
      gaming_day,
      limit = 20,
      cursor,
    } = query;

    // Start query builder
    let queryBuilder = supabase
      .from('player_financial_transaction')
      .select(FINANCIAL_TXN_SELECT_LIST)
      .order('created_at', { ascending: false });

    // Apply filters
    if (player_id) {
      queryBuilder = queryBuilder.eq('player_id', player_id);
    }
    if (visit_id) {
      queryBuilder = queryBuilder.eq('visit_id', visit_id);
    }
    if (direction) {
      queryBuilder = queryBuilder.eq('direction', direction);
    }
    if (source) {
      queryBuilder = queryBuilder.eq('source', source);
    }
    if (tender_type) {
      queryBuilder = queryBuilder.eq('tender_type', tender_type);
    }
    if (gaming_day) {
      queryBuilder = queryBuilder.eq('gaming_day', gaming_day);
    }

    // Handle table_id filter (requires join with rating_slip)
    if (table_id) {
      // Get rating slip IDs for this table
      const { data: slipData, error: slipError } = await supabase
        .from('rating_slip')
        .select('id')
        .eq('table_id', table_id);

      if (slipError) {
        throw mapDatabaseError(slipError);
      }

      const slipIds = slipData?.map((slip) => slip.id) || [];
      if (slipIds.length > 0) {
        queryBuilder = queryBuilder.in('rating_slip_id', slipIds);
      } else {
        // No slips for this table, return empty result
        return { items: [], cursor: null };
      }
    }

    // Apply cursor pagination
    if (cursor) {
      queryBuilder = queryBuilder.lt('id', cursor);
    }

    // Fetch one extra to determine if there are more results
    queryBuilder = queryBuilder.limit(limit + 1);

    const { data, error } = await queryBuilder;

    if (error) {
      throw mapDatabaseError(error);
    }

    const items = data || [];
    const hasMore = items.length > limit;
    const results = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? results[results.length - 1]?.id : null;

    return {
      items: toFinancialTransactionDTOList(results),
      cursor: nextCursor || null,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- catch block error typing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}

/**
 * Gets aggregated financial summary for a visit.
 * Uses the visit_financial_summary materialized view.
 *
 * @param supabase - Supabase client with RLS context
 * @param visitId - Visit UUID
 * @returns Visit financial summary with totals
 * @throws VISIT_NOT_FOUND if visit doesn't exist or has no transactions
 */
export async function getVisitSummary(
  supabase: SupabaseClient<Database>,
  visitId: string,
): Promise<VisitFinancialSummaryDTO> {
  try {
    const { data, error } = await supabase
      .from('visit_financial_summary')
      .select(VISIT_SUMMARY_SELECT)
      .eq('visit_id', visitId)
      .single();

    if (error) {
      // PGRST116 means no transactions for this visit yet
      if (error.code === 'PGRST116') {
        // Return zero summary instead of throwing
        return {
          visit_id: visitId,
          casino_id: '', // Will be populated by RLS context
          total_in: 0,
          total_out: 0,
          net_amount: 0,
          event_count: 0,
          first_transaction_at: null,
          last_transaction_at: null,
        };
      }
      throw mapDatabaseError(error);
    }

    const summary = toVisitFinancialSummaryDTOOrNull(data);
    if (!summary) {
      throw new DomainError(
        'VISIT_NOT_FOUND',
        'Visit financial summary not found',
      );
    }

    return summary;
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    // eslint-disable-next-line custom-rules/no-dto-type-assertions -- catch block error typing
    throw mapDatabaseError(error as { code?: string; message: string });
  }
}
