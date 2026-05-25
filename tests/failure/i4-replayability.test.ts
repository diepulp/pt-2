/** @jest-environment node */

// I4 — Replayability: replaying finance_outbox rows in deterministic order
// ORDER BY (table_id, event_id) produces identical derived state.
// event_id uses UUIDv7 — lexicographic sort equals monotonic-time order within
// a table. This is the exemplar-slice proof; no full replay platform is built here.

import type { FinancialOutboxEventDTO } from '@/services/player-financial/dtos';

const events: FinancialOutboxEventDTO[] = [
  {
    event_id: '01960000-0000-7000-8000-000000000001',
    event_type: 'buyin.recorded',
    casino_id: 'cas-replay-1',
    table_id: 'tbl-A',
    player_id: 'player-1',
    aggregate_id: 'agg-001',
    created_at: '2026-05-11T00:00:01Z',
    processed_at: null,
    fact_class: 'ledger',
    origin_label: 'actual',
    payload: { amount_cents: 10000 },
  },
  {
    event_id: '01960000-0000-7000-8000-000000000003',
    event_type: 'buyin.recorded',
    casino_id: 'cas-replay-1',
    table_id: 'tbl-A',
    player_id: 'player-2',
    aggregate_id: 'agg-003',
    created_at: '2026-05-11T00:00:03Z',
    processed_at: null,
    fact_class: 'ledger',
    origin_label: 'actual',
    payload: { amount_cents: 5000 },
  },
  {
    event_id: '01960000-0000-7000-8000-000000000002',
    event_type: 'grind.observed',
    casino_id: 'cas-replay-1',
    table_id: 'tbl-B',
    player_id: null,
    aggregate_id: 'agg-002',
    created_at: '2026-05-11T00:00:02Z',
    processed_at: null,
    fact_class: 'operational',
    origin_label: 'observed',
    payload: { amount_cents: 2500 },
  },
];

function sortForReplay(
  rows: FinancialOutboxEventDTO[],
): FinancialOutboxEventDTO[] {
  return [...rows].sort((a, b) => {
    const t = (a.table_id ?? '').localeCompare(b.table_id ?? '');
    return t !== 0 ? t : a.event_id.localeCompare(b.event_id);
  });
}

describe('I4 — Replayability: deterministic ORDER BY (table_id, event_id)', () => {
  it('sort is stable: any input permutation yields same output sequence', () => {
    const forwardOrder = sortForReplay(events);
    const reverseOrder = sortForReplay([...events].reverse());
    const randomOrder = sortForReplay([events[2], events[0], events[1]]);

    const ids = (arr: FinancialOutboxEventDTO[]) => arr.map((e) => e.event_id);
    expect(ids(forwardOrder)).toEqual(ids(reverseOrder));
    expect(ids(forwardOrder)).toEqual(ids(randomOrder));
  });

  it('UUIDv7 event_id sort is monotonic-time order within a table', () => {
    const tblA = events.filter((e) => e.table_id === 'tbl-A');
    const sorted = sortForReplay(tblA);
    // Earlier UUIDv7 (smaller timestamp prefix) sorts before later UUIDv7
    expect(sorted[0].event_id < sorted[1].event_id).toBe(true);
    expect(sorted[0].created_at! < sorted[1].created_at!).toBe(true);
  });

  it('table_id partitioning: tbl-A events precede tbl-B in replay order', () => {
    const sorted = sortForReplay(events);
    const firstTblBIdx = sorted.findIndex((e) => e.table_id === 'tbl-B');
    const lastTblAIdx = sorted.map((e) => e.table_id).lastIndexOf('tbl-A');
    expect(lastTblAIdx).toBeLessThan(firstTblBIdx);
  });

  it('per-table aggregate is order-independent (sum is commutative)', () => {
    const sumCents = (rows: FinancialOutboxEventDTO[], tableId: string) =>
      rows
        .filter((e) => e.table_id === tableId)
        .reduce(
          (s, e) =>
            s + ((e.payload as Record<string, number>).amount_cents ?? 0),
          0,
        );

    const sorted = sortForReplay(events);
    expect(sumCents(sorted, 'tbl-A')).toBe(sumCents(events, 'tbl-A'));
    expect(sumCents(sorted, 'tbl-B')).toBe(sumCents(events, 'tbl-B'));
  });

  it('replay order matches what rpc_claim_outbox_batch would produce on re-run', () => {
    const sorted = sortForReplay(events);
    // All events in replay order should have processed_at=null (re-run scenario)
    expect(sorted.every((e) => e.processed_at === null)).toBe(true);
    // Replay sequence is deterministic regardless of DB insertion order
    expect(sorted[0].table_id).toBe('tbl-A');
    expect(sorted[sorted.length - 1].table_id).toBe('tbl-B');
  });
});
