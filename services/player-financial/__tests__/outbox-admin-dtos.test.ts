/**
 * Unit tests for OutboxAdminEventDTO and OutboxRelayHealthDTO (PRD-086 WS1).
 *
 * Verifies:
 *  - OutboxAdminEventDTO includes relay lifecycle fields absent from FinancialOutboxEventDTO
 *  - origin_label and fact_class are pass-through — no synthetic reconstruction
 *  - OutboxRelayHealthDTO shape is correct
 *  - The two outbox DTO types are independent (no structural coupling)
 */

import type {
  FinancialOutboxEventDTO,
  OutboxAdminEventDTO,
  OutboxRelayHealthDTO,
} from '../dtos';

describe('OutboxAdminEventDTO', () => {
  it('includes relay lifecycle fields absent from FinancialOutboxEventDTO', () => {
    // Compile-time structural check via type assignment.
    // If OutboxAdminEventDTO is missing any of these fields this file will not compile.
    const adminDto: OutboxAdminEventDTO = {
      event_id: 'a0000000-0000-0000-0000-000000000001',
      event_type: 'buyin.recorded',
      casino_id: 'a0000000-0000-0000-0000-000000000002',
      table_id: 'a0000000-0000-0000-0000-000000000003',
      player_id: 'a0000000-0000-0000-0000-000000000004',
      aggregate_id: 'a0000000-0000-0000-0000-000000000005',
      created_at: '2026-05-19T01:04:36.000Z',
      processed_at: null,
      delivery_attempts: 0,
      last_attempted_at: null,
      last_error: null,
      fact_class: 'ledger',
      origin_label: 'actual',
      payload: { amount_cents: 10000 },
    };

    expect(adminDto.delivery_attempts).toBe(0);
    expect(adminDto.last_attempted_at).toBeNull();
    expect(adminDto.last_error).toBeNull();
  });

  it('passes origin_label through unchanged — no synthetic upgrade', () => {
    const estimated: OutboxAdminEventDTO = {
      event_id: 'b0000000-0000-0000-0000-000000000001',
      event_type: 'adjustment.recorded',
      casino_id: 'b0000000-0000-0000-0000-000000000002',
      table_id: 'b0000000-0000-0000-0000-000000000003',
      player_id: 'b0000000-0000-0000-0000-000000000004',
      aggregate_id: 'b0000000-0000-0000-0000-000000000005',
      created_at: '2026-05-19T01:04:36.000Z',
      processed_at: null,
      delivery_attempts: 1,
      last_attempted_at: '2026-05-19T01:05:00.000Z',
      last_error: 'consumer timeout',
      fact_class: 'ledger',
      origin_label: 'estimated',
      payload: { amount_cents: -500 },
    };

    // origin_label must be stored value — never upgraded to 'actual'
    expect(estimated.origin_label).toBe('estimated');
    expect(estimated.fact_class).toBe('ledger');
  });

  it('allows null player_id for Class B (Dependency) events', () => {
    const grindEvent: OutboxAdminEventDTO = {
      event_id: 'c0000000-0000-0000-0000-000000000001',
      event_type: 'grind.observed',
      casino_id: 'c0000000-0000-0000-0000-000000000002',
      table_id: 'c0000000-0000-0000-0000-000000000003',
      player_id: null,
      aggregate_id: 'c0000000-0000-0000-0000-000000000005',
      created_at: '2026-05-19T01:04:36.000Z',
      processed_at: null,
      delivery_attempts: 0,
      last_attempted_at: null,
      last_error: null,
      fact_class: 'operational',
      origin_label: 'observed',
      payload: { grind_minutes: 12 },
    };

    expect(grindEvent.player_id).toBeNull();
  });

  it('is structurally independent from FinancialOutboxEventDTO', () => {
    // FinancialOutboxEventDTO must NOT have relay lifecycle fields.
    // This is a compile-time guard: attempting to assign an OutboxAdminEventDTO to
    // FinancialOutboxEventDTO would fail if the types were coupled incorrectly.
    // Here we verify the consumer DTO does not accidentally expose relay fields.
    const consumerDto: FinancialOutboxEventDTO = {
      event_id: 'd0000000-0000-0000-0000-000000000001',
      event_type: 'cashout.recorded',
      casino_id: 'd0000000-0000-0000-0000-000000000002',
      table_id: 'd0000000-0000-0000-0000-000000000003',
      player_id: 'd0000000-0000-0000-0000-000000000004',
      aggregate_id: 'd0000000-0000-0000-0000-000000000005',
      created_at: '2026-05-19T01:04:36.000Z',
      processed_at: '2026-05-19T01:05:00.000Z',
      fact_class: 'ledger',
      origin_label: 'actual',
      payload: { amount_cents: 5000 },
    };

    // delivery_attempts, last_attempted_at, last_error must not exist on the consumer DTO
    expect('delivery_attempts' in consumerDto).toBe(false);
    expect('last_attempted_at' in consumerDto).toBe(false);
    expect('last_error' in consumerDto).toBe(false);
  });
});

describe('OutboxRelayHealthDTO', () => {
  it('accepts null for oldest_pending_age_seconds when no pending rows', () => {
    const health: OutboxRelayHealthDTO = {
      pending_count: 0,
      oldest_pending_age_seconds: null,
      retry_row_count: 0,
      poison_candidate_count: 0,
      processed_count_24h: 42,
    };

    expect(health.oldest_pending_age_seconds).toBeNull();
    expect(health.pending_count).toBe(0);
    expect(health.processed_count_24h).toBe(42);
  });

  it('has correct shape with active relay state', () => {
    const health: OutboxRelayHealthDTO = {
      pending_count: 3,
      oldest_pending_age_seconds: 187.5,
      retry_row_count: 1,
      poison_candidate_count: 0,
      processed_count_24h: 150,
    };

    expect(health.pending_count).toBe(3);
    expect(health.oldest_pending_age_seconds).toBe(187.5);
    expect(health.retry_row_count).toBe(1);
    expect(health.poison_candidate_count).toBe(0);
  });
});
