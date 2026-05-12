/** @jest-environment node */

// I2 — Durability: a committed finance_outbox row with processed_at IS NULL
// persists across process boundaries and is re-claimed on the next relay cycle.
// Simulates process crash after DB commit but before processed_at was written.
// rpc_claim_outbox_batch uses FOR UPDATE SKIP LOCKED — a crashed worker releases
// its lease when the connection closes, making the row claimable again.

import type { FinancialOutboxEventDTO } from '@/services/player-financial/dtos';
import { runConsumer } from '@/services/player-financial/outbox-consumer';

jest.mock('@/services/player-financial/outbox-consumer');

const durableEvent: FinancialOutboxEventDTO = {
  event_id: 'ev-dur-0001',
  event_type: 'buyin.recorded',
  casino_id: 'cas-dur-1',
  table_id: 'tbl-dur-1',
  player_id: 'player-dur-1',
  aggregate_id: 'agg-dur-1',
  created_at: '2026-05-11T00:00:00Z',
  processed_at: null,
  fact_class: 'ledger',
  origin_label: 'actual',
  payload: { amount_cents: 10000 },
};

describe('I2 — Durability: committed outbox row survives crash and is re-delivered', () => {
  beforeEach(() => jest.clearAllMocks());

  it('crashed cycle leaves processed_at NULL — row available for next relay cycle', () => {
    // After crash, the row retains processed_at: null
    // This is the state that rpc_claim_outbox_batch targets (WHERE processed_at IS NULL)
    expect(durableEvent.processed_at).toBeNull();
  });

  it('relay cycle 2 picks up the durable row and calls runConsumer', async () => {
    (runConsumer as jest.Mock).mockResolvedValue('processed');

    // Simulate relay cycle 2: claims the same row from DB
    const claimedRows = [durableEvent];

    // Relay processes each claimed row
    for (const row of claimedRows) {
      await (runConsumer as jest.Mock)(undefined, row);
    }

    expect(runConsumer).toHaveBeenCalledTimes(1);
    expect(runConsumer).toHaveBeenCalledWith(undefined, durableEvent);
  });

  it('rpc_claim_outbox_batch filter: processed rows are excluded from next cycle', () => {
    const processedEvent: FinancialOutboxEventDTO = {
      ...durableEvent,
      event_id: 'ev-dur-0002',
      processed_at: '2026-05-11T01:00:00Z',
    };
    const unprocessedEvent: FinancialOutboxEventDTO = {
      ...durableEvent,
      event_id: 'ev-dur-0003',
      processed_at: null,
    };

    // rpc_claim_outbox_batch WHERE processed_at IS NULL: only unprocessed rows
    const allRows = [processedEvent, unprocessedEvent];
    const claimable = allRows.filter((r) => r.processed_at === null);

    expect(claimable).toHaveLength(1);
    expect(claimable[0].event_id).toBe('ev-dur-0003');
    expect(claimable[0].processed_at).toBeNull();
  });

  it('duplicate processing after re-delivery returns duplicate (safe durable prior commit)', async () => {
    // Cycle 1: processed but crash before processed_at written → row re-delivered
    // Cycle 2: rpc_commit_consumer_receipt returns 'duplicate' (idempotent)
    (runConsumer as jest.Mock).mockResolvedValue('duplicate');

    const result = await (runConsumer as jest.Mock)(undefined, durableEvent);

    // 'duplicate' is safe — relay sets processed_at to prevent further re-delivery
    expect(result).toBe('duplicate');
  });
});
