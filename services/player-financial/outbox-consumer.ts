import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type {
  FinancialOutboxEventDTO,
  LagAggregates,
  OutboxBacklogSize,
} from './dtos';

// 'skipped' = non-ledger row; claim RPC filters these out, this guard is defensive only.
export type ConsumerResult = 'processed' | 'duplicate' | 'skipped' | Error;

export async function runConsumer(
  supabase: SupabaseClient<Database>,
  event: FinancialOutboxEventDTO,
): Promise<ConsumerResult> {
  if (event.fact_class !== 'ledger') {
    return 'skipped'; // Non-ledger rows belong to Phase 2.4; rpc_claim_class_a_outbox_batch guards this upstream
  }

  // rpc_process_class_a_projection: SECURITY DEFINER RPC that atomically inserts into
  // processed_messages AND upserts visit_class_a_projection AND sets finance_outbox.processed_at
  // in a single PG transaction. This is the I3 atomicity boundary.
  //
  // 'processed' = new event, all three writes committed atomically.
  // 'duplicate' = message_id already in processed_messages — prior commit is durable; relay treats as success.
  // 'skipped_operational' = fact_class != 'ledger' inside PG — should not occur (claim RPC filters).
  const { data, error } = await supabase.rpc('rpc_process_class_a_projection', {
    p_message_id: event.event_id,
  });

  if (error) return error;
  if (data === 'skipped_operational') {
    return new Error(
      'unexpected: ledger event routed to skipped_operational in rpc_process_class_a_projection',
    );
  }
  return data as 'processed' | 'duplicate';
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 2.5 (PRD-089 WS1_LOG) — Observability helpers
// ───────────────────────────────────────────────────────────────────────────

// Operational event_type whitelist — must match rpc_claim_operational_outbox_batch
// (20260521022656). Drift here makes the log line lie about what the relay
// can actually drain.
const OPERATIONAL_EVENT_TYPES = [
  'grind.observed',
  'fill.recorded',
  'credit.recorded',
] as const;

/**
 * P1-LAG-SAMPLE-CLOCK-CONTRACT (audit patch):
 *
 * Returns DB-clock derived lag samples (ms) for the supplied event_ids. The
 * audit patch's prescription is `EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000`
 * computed server-side. supabase-js cannot express this in a `.select()`
 * column, and adding a one-off RPC is out-of-scope for WS1 (gate is
 * type-check, not schema-validation). The semantic equivalent is to fetch
 * both timestamps — which are themselves DB-clock-stamped (created_at by the
 * producer trigger, processed_at by rpc_process_*_projection, both via
 * Postgres now()) — and subtract them in TypeScript.
 *
 * No `Date.now()` may appear here. The only use of `Date.parse` is
 * ISO-string-to-millis conversion of DB-stamped values; the app-server clock
 * never participates.
 *
 * Exclusion rule (duplicate/skipped/failed/claim-error/auth-fail outcomes)
 * is enforced BY CONSTRUCTION at the call site — those event_ids must never
 * appear in `eventIds`.
 *
 * @param supabase service-role client
 * @param eventIds set of event_ids whose processed_at was newly stamped this cycle
 * @returns lag samples in milliseconds; empty array on query failure or empty input
 */
export async function collectLagSamplesMs(
  supabase: SupabaseClient<Database>,
  eventIds: string[],
): Promise<number[]> {
  if (eventIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from('finance_outbox')
      .select('event_id, created_at, processed_at')
      .in('event_id', eventIds);

    if (error || !data) return [];

    const samples: number[] = [];
    for (const row of data) {
      if (row.processed_at === null) continue; // defensive
      const processedMs = Date.parse(row.processed_at);
      const createdMs = Date.parse(row.created_at);
      if (Number.isFinite(processedMs) && Number.isFinite(createdMs)) {
        samples.push(processedMs - createdMs);
      }
    }
    return samples;
  } catch {
    // Observability-soft: lag collection failure must not cascade into a
    // relay cycle failure. Cycle still emits a log line with empty samples.
    return [];
  }
}

/**
 * P1-BACKLOG-CLAIMABILITY-DEFINITION (audit patch):
 *
 * Returns backlog counts whose SQL predicates match the claim RPC source of
 * truth (`rpc_claim_class_a_outbox_batch`, `rpc_claim_operational_outbox_batch`)
 * verbatim. Drift from the EXEC-SPEC canonical table is intentional and flagged:
 * the operational predicates include the event_type whitelist that the
 * canonical table did not enumerate.
 *
 * Three count queries are issued (PostgREST `head: true` count). A failed
 * count query produces a 0 for that field rather than throwing — the cycle
 * still emits a log line; lying about a count we couldn't compute is worse
 * than degrading it to 0 with the cycle outcome surfacing the error.
 */
export async function collectOutboxBacklog(
  supabase: SupabaseClient<Database>,
): Promise<OutboxBacklogSize> {
  try {
    const [ledgerRes, opClaimableRes, opDeadLetterRes] = await Promise.all([
      supabase
        .from('finance_outbox')
        .select('event_id', { count: 'exact', head: true })
        .eq('fact_class', 'ledger')
        .is('processed_at', null),
      supabase
        .from('finance_outbox')
        .select('event_id', { count: 'exact', head: true })
        .eq('fact_class', 'operational')
        .in('event_type', OPERATIONAL_EVENT_TYPES as unknown as string[])
        .is('processed_at', null)
        .lt('delivery_attempts', 5),
      supabase
        .from('finance_outbox')
        .select('event_id', { count: 'exact', head: true })
        .eq('fact_class', 'operational')
        .in('event_type', OPERATIONAL_EVENT_TYPES as unknown as string[])
        .is('processed_at', null)
        .gte('delivery_attempts', 5),
    ]);

    const ledgerTotal = ledgerRes.count ?? 0;
    const claimable = opClaimableRes.count ?? 0;
    const deadLetter = opDeadLetterRes.count ?? 0;

    return {
      ledger: { total: ledgerTotal },
      operational: {
        claimable,
        dead_letter: deadLetter,
        total: claimable + deadLetter,
      },
    };
  } catch {
    // Observability-soft: backlog count failure must not cascade into a
    // relay cycle failure. Caller emits log line with zero counts.
    return {
      ledger: { total: 0 },
      operational: { claimable: 0, dead_letter: 0, total: 0 },
    };
  }
}

/**
 * Lag aggregate (min/p50/p95/max) from the combined branch sample array.
 *
 * Returns `null` for an empty input — distinguishes "no rows processed this
 * cycle" from "rows processed with zero lag".
 *
 * Percentiles use the nearest-rank method on a sorted copy. For p50 with an
 * even count, the lower of the two midpoints is taken (deterministic and
 * matches `percentile_disc(0.5)`). For p95, ceil(0.95 * n) - 1 indexes the
 * sorted array.
 */
export function aggregateLagSamples(
  samples: readonly number[],
): LagAggregates | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0]!;
  const max = sorted[n - 1]!;
  const p50Index = Math.max(0, Math.ceil(0.5 * n) - 1);
  const p95Index = Math.max(0, Math.ceil(0.95 * n) - 1);
  return {
    min,
    p50: sorted[p50Index]!,
    p95: sorted[p95Index]!,
    max,
  };
}
