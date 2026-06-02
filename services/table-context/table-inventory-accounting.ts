/**
 * TableInventoryAccounting — Read-Time Derivation Service
 *
 * Sole owner of the three-result-state machine for table win/loss derivation.
 * Stateless: no persistence, no outbox, no side effects except the diagnostic helper.
 *
 * Three result states (calculation_kind):
 *   - telemetry_drop_formula: all 5 inputs resolved
 *   - inventory_only: opener+closer resolved, telemetry absent
 *   - integrity_failure: opener or closer unresolvable after all paths exhausted
 *
 * Input resolution: FK → stale-FK check → session-linked fallback (DEC-3).
 * Confirmed cashier amounts only for fills/credits.
 * Telemetry: RATED_BUYIN + GRIND_BUYIN in session window; RATED_ADJUSTMENT excluded.
 * Null SUM preserved — never COALESCEd to 0.
 *
 * @see PRD-090, ADR-059, ADR-060, ADR-061, SRL-TIA-001
 * @see EXEC-090 WS2
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { Database } from '@/types/database.types';

import type {
  CalculationKind,
  DropEstimateState,
  TableInventoryAccountingProjection,
} from './dtos';

// ── Diagnostic ────────────────────────────────────────────────────────────────

export interface TIADiagnostic {
  session_id: string;
  casino_id: string;
  calculation_kind: 'integrity_failure';
  integrity_issues: string[];
  request_id: string;
}

/**
 * Emits a structured diagnostic for integrity_failure outcomes.
 * Exported so tests can spy/mock; no side effects in default implementation.
 * Must not write to database, outbox, or audit log.
 */
export function emitTableInventoryAccountingDiagnostic(
  _diagnostic: TIADiagnostic,
): void {
  // Intentional no-op: diagnostic captured by monitoring infrastructure
  // via test mocking (WS6) and future structured-log integration.
}

// ── Service Interface ─────────────────────────────────────────────────────────

export interface TableInventoryAccountingService {
  derive(params: {
    tableSessionId: string;
    casinoId: string;
    requestId: string;
  }): Promise<TableInventoryAccountingProjection>;
}

// ── Internal row shapes ───────────────────────────────────────────────────────

type TableSessionRow = {
  id: string;
  casino_id: string;
  gaming_table_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_inventory_snapshot_id: string | null;
  closing_inventory_snapshot_id: string | null;
};

type SnapshotRow = {
  id: string;
  session_id: string | null;
  total_cents: number | null;
  chipset: Record<string, number> | null;
  snapshot_type: string;
  created_at: string;
};

function isSnapshotRow(value: unknown): value is SnapshotRow {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.snapshot_type === 'string' &&
    typeof obj.created_at === 'string' &&
    (obj.total_cents === null || typeof obj.total_cents === 'number') &&
    (obj.session_id === null || typeof obj.session_id === 'string')
  );
}

function isTableSessionRow(value: unknown): value is TableSessionRow {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.casino_id === 'string' &&
    typeof obj.gaming_table_id === 'string' &&
    typeof obj.opened_at === 'string' &&
    (obj.closed_at === null || typeof obj.closed_at === 'string') &&
    (obj.opening_inventory_snapshot_id === null ||
      typeof obj.opening_inventory_snapshot_id === 'string') &&
    (obj.closing_inventory_snapshot_id === null ||
      typeof obj.closing_inventory_snapshot_id === 'string')
  );
}

// ── Chipset helper ────────────────────────────────────────────────────────────

function chipsetTotalCents(chipset: Record<string, number>): bigint {
  let total = BigInt(0);
  for (const [denom, qty] of Object.entries(chipset)) {
    const d = Number(denom);
    if (Number.isFinite(d) && d > 0 && Number.isFinite(qty) && qty > 0) {
      total = total + BigInt(Math.round(d)) * BigInt(Math.round(qty));
    }
  }
  return total;
}

function resolveSnapshotValue(snap: SnapshotRow): bigint | null {
  if (snap.total_cents != null) {
    return BigInt(snap.total_cents);
  }
  const chipset = snap.chipset;
  if (
    chipset != null &&
    typeof chipset === 'object' &&
    Object.keys(chipset).length > 0
  ) {
    return chipsetTotalCents(chipset);
  }
  return null;
}

// ── Snapshot resolution (FK + fallback, DEC-3) ────────────────────────────────

async function resolveSnapshot(
  supabase: SupabaseClient<Database>,
  snapshotType: 'open' | 'close',
  sessionId: string,
  fkSnapshotId: string | null,
): Promise<{ value: bigint | null; issueKey: string | null }> {
  const missingIssue =
    snapshotType === 'open'
      ? 'missing_opening_inventory_snapshot'
      : 'missing_closing_inventory_snapshot';

  // Primary: FK lookup
  if (fkSnapshotId != null) {
    const { data: rawSnap, error } = await supabase
      .from('table_inventory_snapshot')
      .select('id, session_id, total_cents, chipset, snapshot_type, created_at')
      .eq('id', fkSnapshotId)
      .maybeSingle();

    if (error) {
      throw new DomainError(
        'INTERNAL_ERROR',
        `Snapshot FK lookup failed: ${error.message}`,
        {
          details: safeErrorDetails(error),
        },
      );
    }

    if (rawSnap) {
      if (!isSnapshotRow(rawSnap)) {
        throw new DomainError(
          'INTERNAL_ERROR',
          'Unexpected snapshot row shape',
        );
      }
      const snap = rawSnap;
      // Stale-FK check: session_id must match (null = pre-PRD-038 row → stale)
      const isStale = snap.session_id == null || snap.session_id !== sessionId;
      if (!isStale) {
        const value = resolveSnapshotValue(snap);
        if (value != null) return { value, issueKey: null };
      }
      // Stale FK → fall through to session-linked fallback
    }
  }

  // Fallback: session-linked snapshot, deterministic order (DEC-3)
  const { data: rawFallbacks, error: fbError } = await supabase
    .from('table_inventory_snapshot')
    .select('id, session_id, total_cents, chipset, snapshot_type, created_at')
    .eq('session_id', sessionId)
    .eq('snapshot_type', snapshotType)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);

  if (fbError) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Snapshot fallback lookup failed: ${fbError.message}`,
      {
        details: safeErrorDetails(fbError),
      },
    );
  }

  const fallbacks = (rawFallbacks ?? []).filter(isSnapshotRow);
  const snap = fallbacks.length > 0 ? fallbacks[0] : null;
  if (snap) {
    const value = resolveSnapshotValue(snap);
    if (value != null) return { value, issueKey: null };
  }

  // All paths exhausted
  return { value: null, issueKey: missingIssue };
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

async function queryFillsTotal(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<bigint> {
  const { data, error } = await supabase
    .from('table_fill')
    .select('confirmed_amount_cents')
    .eq('session_id', sessionId)
    .eq('status', 'confirmed');

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Fills query failed: ${error.message}`,
      {
        details: safeErrorDetails(error),
      },
    );
  }

  let total = BigInt(0);
  for (const row of data ?? []) {
    if (row.confirmed_amount_cents != null) {
      total = total + BigInt(row.confirmed_amount_cents);
    }
  }
  return total;
}

async function queryCreditsTotal(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<bigint> {
  const { data, error } = await supabase
    .from('table_credit')
    .select('confirmed_amount_cents')
    .eq('session_id', sessionId)
    .eq('status', 'confirmed');

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Credits query failed: ${error.message}`,
      {
        details: safeErrorDetails(error),
      },
    );
  }

  let total = BigInt(0);
  for (const row of data ?? []) {
    if (row.confirmed_amount_cents != null) {
      total = total + BigInt(row.confirmed_amount_cents);
    }
  }
  return total;
}

async function queryTelemetryDropEstimate(
  supabase: SupabaseClient<Database>,
  params: {
    casinoId: string;
    tableId: string;
    openedAt: string;
    upperBoundAt: string;
  },
): Promise<bigint | null> {
  // ADR-061 D2 frozen predicate: RATED_BUYIN + GRIND_BUYIN; RATED_ADJUSTMENT excluded.
  // Null SUM preserved — never COALESCEd to 0.
  const { data, error } = await supabase
    .from('table_buyin_telemetry')
    .select('amount_cents')
    .eq('casino_id', params.casinoId)
    .eq('table_id', params.tableId)
    .in('telemetry_kind', ['RATED_BUYIN', 'GRIND_BUYIN'])
    .gte('occurred_at', params.openedAt)
    .lt('occurred_at', params.upperBoundAt);

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Telemetry query failed: ${error.message}`,
      {
        details: safeErrorDetails(error),
      },
    );
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    // Zero qualifying rows → null (no telemetry, not zero-value telemetry)
    return null;
  }

  let total = BigInt(0);
  for (const row of rows) {
    total = total + BigInt(row.amount_cents);
  }
  return total;
}

// ── Service Factory ───────────────────────────────────────────────────────────

export function createTableInventoryAccountingService(
  supabase: SupabaseClient<Database>,
): TableInventoryAccountingService {
  return {
    async derive({ tableSessionId, casinoId, requestId }) {
      // Stable upper bound for open-session telemetry window (single capture per request)
      const upperBoundAt = new Date().toISOString();
      const derivedAt = upperBoundAt;

      // Fetch session; casinoId must come from RLS context, not derived from the row
      const { data: rawSession, error: sessionError } = await supabase
        .from('table_session')
        .select(
          'id, casino_id, gaming_table_id, opened_at, closed_at, opening_inventory_snapshot_id, closing_inventory_snapshot_id',
        )
        .eq('id', tableSessionId)
        .eq('casino_id', casinoId)
        .maybeSingle();

      if (sessionError) {
        throw new DomainError(
          'INTERNAL_ERROR',
          `Session fetch failed: ${sessionError.message}`,
          {
            details: safeErrorDetails(sessionError),
          },
        );
      }

      if (!rawSession) {
        throw new DomainError('SESSION_NOT_FOUND', undefined, {
          httpStatus: 404,
        });
      }

      if (!isTableSessionRow(rawSession)) {
        throw new DomainError('INTERNAL_ERROR', 'Unexpected session row shape');
      }
      const session = rawSession;

      // Parallel resolution of all five inputs
      const [
        openerResult,
        closerResult,
        fillsTotal,
        creditsTotal,
        telemetryDrop,
      ] = await Promise.all([
        resolveSnapshot(
          supabase,
          'open',
          session.id,
          session.opening_inventory_snapshot_id,
        ),
        resolveSnapshot(
          supabase,
          'close',
          session.id,
          session.closing_inventory_snapshot_id,
        ),
        queryFillsTotal(supabase, session.id),
        queryCreditsTotal(supabase, session.id),
        queryTelemetryDropEstimate(supabase, {
          casinoId,
          tableId: session.gaming_table_id,
          openedAt: session.opened_at,
          upperBoundAt: session.closed_at ?? upperBoundAt,
        }),
      ]);

      const openerCents = openerResult.value;
      const closerCents = closerResult.value;

      // Three-state machine
      const integrityIssues: string[] = [];
      if (openerResult.issueKey) integrityIssues.push(openerResult.issueKey);
      if (closerResult.issueKey) integrityIssues.push(closerResult.issueKey);

      let calculationKind: CalculationKind;
      let projectedTableWinLossCents: bigint | null = null;
      let partialTableResultCents: bigint | null = null;

      if (integrityIssues.length > 0) {
        calculationKind = 'integrity_failure';
        emitTableInventoryAccountingDiagnostic({
          session_id: session.id,
          casino_id: casinoId,
          calculation_kind: 'integrity_failure',
          integrity_issues: integrityIssues,
          request_id: requestId,
        });
      } else if (telemetryDrop != null) {
        // telemetry_drop_formula: all 5 inputs resolved
        calculationKind = 'telemetry_drop_formula';
        // projected = drop_estimate + closing + credits - opening - fills
        projectedTableWinLossCents =
          telemetryDrop +
          closerCents! +
          creditsTotal -
          openerCents! -
          fillsTotal;
      } else {
        // inventory_only: opener+closer resolved, telemetry absent
        calculationKind = 'inventory_only';
        // partial = closing + credits - opening - fills
        partialTableResultCents =
          closerCents! + creditsTotal - openerCents! - fillsTotal;
      }

      const dropEstimateState: DropEstimateState =
        telemetryDrop != null ? 'present' : 'absent';

      const projection: TableInventoryAccountingProjection = {
        table_session_id: session.id,
        casino_id: casinoId,
        calculation_kind: calculationKind,
        projected_table_win_loss_cents: projectedTableWinLossCents,
        partial_table_result_cents: partialTableResultCents,
        final_table_win_loss_cents: null,
        telemetry_derived_drop_estimate_cents: telemetryDrop,
        drop_estimate_state: dropEstimateState,
        custody_status: 'non_custody_estimate',
        completeness: {
          status: session.closed_at != null ? 'complete' : 'partial',
        },
        source_authority: {
          drop: telemetryDrop != null ? 'table_buyin_telemetry' : null,
          snapshots:
            openerCents != null && closerCents != null
              ? 'table_inventory_snapshot'
              : null,
          fills: 'table_fill',
          credits: 'table_credit',
        },
        integrity_issues: integrityIssues,
        request_id: requestId,
        derived_at: derivedAt,
      };

      return projection;
    },
  };
}
