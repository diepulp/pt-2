/**
 * MeasurementService Queries
 *
 * Per-metric query functions for ADR-039 measurement metrics.
 * All queries include .eq('casino_id', casinoId) as defense-in-depth with RLS.
 *
 * @see EXEC-046 WS1 — Service Layer
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type { MeasurementFilters } from './dtos';
import { createWidgetError } from './dtos';

// === Types for raw query results ===

type RatingSlipRow = Database['public']['Tables']['rating_slip']['Row'];
type AuditCorrelationRow =
  Database['public']['Views']['measurement_audit_event_correlation_v']['Row'];
type RatingCoverageRow =
  Database['public']['Views']['measurement_rating_coverage_v']['Row'];
type LoyaltySnapshotRow =
  Database['public']['Tables']['loyalty_liability_snapshot']['Row'];
type LoyaltyPolicyRow =
  Database['public']['Tables']['loyalty_valuation_policy']['Row'];

// === Result types for query functions ===

export interface TheoDiscrepancyQueryResult {
  rows: Pick<
    RatingSlipRow,
    'id' | 'table_id' | 'computed_theo_cents' | 'legacy_theo_cents'
  >[];
}

export interface AuditCorrelationQueryResult {
  rows: AuditCorrelationRow[];
}

export interface RatingCoverageQueryResult {
  rows: RatingCoverageRow[];
}

export interface LoyaltyLiabilityQueryResult {
  snapshot: LoyaltySnapshotRow | null;
  policy: Pick<LoyaltyPolicyRow, 'cents_per_point'> | null;
}

// === Pit-to-table resolution helper ===

/**
 * Resolve pit_id to table IDs via floor_table_slot.
 * Returns null if no table assignments found (triggers 'unavailable' error).
 */
async function resolvePitToTableIds(
  supabase: SupabaseClient<Database>,
  pitId: string,
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('floor_table_slot')
    .select('preferred_table_id')
    .eq('pit_id', pitId)
    .not('preferred_table_id', 'is', null);

  if (error) {
    throw createWidgetError('query_failed');
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data
    .map((row) => row.preferred_table_id)
    .filter((id): id is string => id !== null);
}

// === MEAS-001: Theo Discrepancy ===

/**
 * Query rating_slip for theo discrepancy data.
 *
 * Formula: ABS(computed_theo_cents - legacy_theo_cents) / NULLIF(legacy_theo_cents, 0)
 *
 * Filter path:
 * - table_id: direct FK on rating_slip.table_id
 * - pit_id: resolve via floor_table_slot subquery
 * - gaming_table.pit is free-text, NOT a UUID FK — do NOT use
 */
export async function queryTheoDiscrepancy(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  filters?: MeasurementFilters,
): Promise<TheoDiscrepancyQueryResult> {
  let query = supabase
    .from('rating_slip')
    .select('id, table_id, computed_theo_cents, legacy_theo_cents')
    .eq('casino_id', casinoId)
    .not('legacy_theo_cents', 'is', null);

  if (filters?.tableId) {
    query = query.eq('table_id', filters.tableId);
  } else if (filters?.pitId) {
    const tableIds = await resolvePitToTableIds(supabase, filters.pitId);
    if (tableIds === null) {
      throw createWidgetError(
        'unavailable',
        'Pit filter unavailable — no table assignments found',
      );
    }
    query = query.in('table_id', tableIds);
  }

  const { data, error } = await query;

  if (error) {
    throw createWidgetError('query_failed');
  }

  return { rows: data ?? [] };
}

// === MEAS-002: Audit Correlation ===

/**
 * Query measurement_audit_event_correlation_v.
 *
 * CRITICAL: View produces Cartesian fan-out (N×M×K rows per slip).
 * All aggregation MUST use COUNT(DISTINCT ...) — handled by mappers.
 *
 * Casino-level only (no filter support — view has no table/pit columns).
 */
export async function queryAuditCorrelation(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<AuditCorrelationQueryResult> {
  const { data, error } = await supabase
    .from('measurement_audit_event_correlation_v')
    .select('*')
    .eq('casino_id', casinoId);

  if (error) {
    throw createWidgetError('query_failed');
  }

  return { rows: data ?? [] };
}

// === MEAS-003: Rating Coverage ===

/**
 * Query measurement_rating_coverage_v.
 *
 * Filter path:
 * - table_id: via gaming_table_id in view
 * - pit_id: resolve via floor_table_slot subquery, then gaming_table_id IN (...)
 */
export async function queryRatingCoverage(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  filters?: MeasurementFilters,
): Promise<RatingCoverageQueryResult> {
  let query = supabase
    .from('measurement_rating_coverage_v')
    .select('*')
    .eq('casino_id', casinoId);

  if (filters?.gamingDay) {
    query = query.eq('gaming_day', filters.gamingDay);
  }

  if (filters?.tableId) {
    query = query.eq('gaming_table_id', filters.tableId);
  } else if (filters?.pitId) {
    const tableIds = await resolvePitToTableIds(supabase, filters.pitId);
    if (tableIds === null) {
      throw createWidgetError(
        'unavailable',
        'Pit filter unavailable — no table assignments found',
      );
    }
    query = query.in('gaming_table_id', tableIds);
  }

  const { data, error } = await query;

  if (error) {
    throw createWidgetError('query_failed');
  }

  return { rows: data ?? [] };
}

// === MEAS-004: Loyalty Liability ===

/**
 * Query loyalty_liability_snapshot + loyalty_valuation_policy.
 *
 * Zero-row behavior: if no snapshot exists, returns { snapshot: null, policy: null }.
 * This is a valid initial state for a newly configured casino — NOT an error.
 *
 * No active policy: if loyalty_valuation_policy has no active row,
 * policy is null — estimated_monetary_value_cents from snapshot remains valid.
 *
 * Casino-level only (no filter support).
 */
export async function queryLoyaltyLiability(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<LoyaltyLiabilityQueryResult> {
  const [snapshotResult, policyResult] = await Promise.all([
    supabase
      .from('loyalty_liability_snapshot')
      .select('*')
      .eq('casino_id', casinoId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('loyalty_valuation_policy')
      .select('cents_per_point')
      .eq('casino_id', casinoId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
  ]);

  if (snapshotResult.error) {
    throw createWidgetError('query_failed');
  }

  if (policyResult.error) {
    throw createWidgetError('query_failed');
  }

  return {
    snapshot: snapshotResult.data,
    policy: policyResult.data,
  };
}
