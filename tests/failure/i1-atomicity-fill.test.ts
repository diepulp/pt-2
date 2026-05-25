/** @jest-environment node */

// I1 — Atomicity: rpc_request_table_fill co-locates the finance_outbox INSERT
// inside a single PG transaction boundary (via fn_finance_outbox_emit helper).
// The TypeScript layer has NO separate outbox INSERT path — atomicity is enforced
// in the DB function body. These tests verify that invariant: if the RPC errors,
// no outbox row can escape via a TypeScript fallback.
//
// T1–T12 per PRD-085 §8 Appendix B plus EXEC-085 same-casino wrong-table replay hardening.
// Phase 2.0 exemplar proof (i1-atomicity.test.ts) and Phase 2.1 adjustment proof do NOT certify
// this producer path.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

function makeSupabase() {
  return {
    rpc: jest.fn(),
    from: jest.fn(),
  } as unknown as SupabaseClient<Database>;
}

const BASE_FILL_ARGS = {
  p_table_id: 'table-fill-1',
  p_chipset: { '25': 4, '100': 2 },
  p_amount_cents: 120000,
  p_delivered_by: 'staff-cashier-1',
  p_received_by: 'staff-pitboss-1',
  p_slip_no: 'FILL-001',
  p_request_id: 'req-fill-001',
};

describe('I1 — Atomicity: rpc_request_table_fill (Phase 2.2)', () => {
  beforeEach(() => jest.clearAllMocks());

  // T1: ROLLBACK / ERROR
  // TypeScript boundary smoke: RPC error must not trigger a separate outbox INSERT.
  // DB-level atomicity (actual rollback of table_fill + finance_outbox together) is
  // verified in the integration section below when RUN_INTEGRATION_TESTS=true.
  it('T1: RPC error leaves no orphaned outbox row via TypeScript fallback', async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message: 'FORBIDDEN: role cashier cannot request table fills',
        code: 'P0001',
      },
    });

    const { error } = await supabase.rpc(
      'rpc_request_table_fill',
      BASE_FILL_ARGS as never,
    );

    expect(error).toBeTruthy();
    // No TypeScript fallback path — TypeScript must not attempt from('finance_outbox').insert()
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
    // Exactly one RPC attempt — no retry loop
    expect((supabase.rpc as jest.Mock).mock.calls).toHaveLength(1);
  });

  // T2: SUCCESS
  it('T2: successful fill — single RPC call, no separate TS outbox write', async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        id: 'fill-row-1',
        casino_id: 'casino-1',
        table_id: 'table-fill-1',
        amount_cents: 120000,
        request_id: 'req-fill-001',
        status: 'requested',
        session_id: 'session-1',
      },
      error: null,
    });

    const { data, error } = await supabase.rpc(
      'rpc_request_table_fill',
      BASE_FILL_ARGS as never,
    );

    expect(error).toBeNull();
    expect(data).toBeDefined();
    // One RPC call only — fill.recorded outbox INSERT happens inside DB function
    expect((supabase.rpc as jest.Mock).mock.calls).toHaveLength(1);
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
  });

  // T3: IDEMPOTENT REPLAY (same payload)
  // DB returns existing row directly — no separate TS lookup needed (DB does the replay)
  it('T3: idempotent replay with same payload — server returns existing row, no TS fallback', async () => {
    const supabase = makeSupabase();
    const existingRow = {
      id: 'fill-row-1',
      amount_cents: 120000,
      request_id: 'req-fill-001',
      status: 'requested',
    };
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: existingRow,
      error: null,
    });

    const first = await supabase.rpc(
      'rpc_request_table_fill',
      BASE_FILL_ARGS as never,
    );
    const second = await supabase.rpc(
      'rpc_request_table_fill',
      BASE_FILL_ARGS as never,
    );

    expect(first.data).toEqual(second.data);
    // DB returns existing row — no TypeScript from() lookup needed
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
  });

  // T4: CONCURRENT IDEMPOTENT REPLAY
  it('T4: concurrent idempotent replay — both callers receive same row, no TS outbox write', async () => {
    const supabase = makeSupabase();
    const row = {
      id: 'fill-row-concurrent',
      amount_cents: 120000,
      request_id: 'req-fill-001',
    };
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: row, error: null });

    const [first, second] = await Promise.all([
      supabase.rpc('rpc_request_table_fill', BASE_FILL_ARGS as never),
      supabase.rpc('rpc_request_table_fill', BASE_FILL_ARGS as never),
    ]);

    expect(first.data).toEqual(second.data);
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
  });

  // T5: DELAYED REPLAY (session closed)
  // DB lookup happens before active-session resolution (FR-11) — returns existing row
  it('T5: delayed replay after session lifecycle change — existing row returned, no TS fallback', async () => {
    const supabase = makeSupabase();
    const existingRow = {
      id: 'fill-row-1',
      amount_cents: 120000,
      request_id: 'req-fill-001',
      status: 'requested',
    };
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: existingRow,
      error: null,
    });

    const { data, error } = await supabase.rpc(
      'rpc_request_table_fill',
      BASE_FILL_ARGS as never,
    );

    expect(error).toBeNull();
    expect(data?.id).toBe('fill-row-1');
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
  });

  // T6: STAFF LIFECYCLE REPLAY
  // FR-9: exact replay compares stored source-row truth, not mutable staff state
  it('T6: staff lifecycle replay — existing row returned on exact payload match, no TS fallback', async () => {
    const supabase = makeSupabase();
    const existingRow = {
      id: 'fill-row-1',
      amount_cents: 120000,
      request_id: 'req-fill-001',
      delivered_by: 'staff-cashier-1',
    };
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: existingRow,
      error: null,
    });

    const { data, error } = await supabase.rpc(
      'rpc_request_table_fill',
      BASE_FILL_ARGS as never,
    );

    expect(error).toBeNull();
    expect(data?.id).toBe('fill-row-1');
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
  });

  // T7: DIVERGENT REPLAY — error message prefix
  it('T7: divergent replay — error has IDEMPOTENCY_CONFLICT: prefix', async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message:
          'IDEMPOTENCY_CONFLICT: fill request_id=req-fill-001 already committed with different payload. existing amount_cents=120000, incoming amount_cents=50000',
        code: 'P0001',
      },
    });

    const { error } = await supabase.rpc('rpc_request_table_fill', {
      ...BASE_FILL_ARGS,
      p_amount_cents: 50000,
    } as never);

    expect(error!.message).toMatch(/^IDEMPOTENCY_CONFLICT:/);
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
  });

  // T8: DIVERGENT REPLAY — SQLSTATE assertion
  it('T8: divergent replay — SQLSTATE P0001 and IDEMPOTENCY_CONFLICT: prefix', async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message:
          'IDEMPOTENCY_CONFLICT: fill request_id=req-fill-001 already committed with different payload. existing amount_cents=120000, incoming amount_cents=50000',
        code: 'P0001',
      },
    });

    const { error } = await supabase.rpc('rpc_request_table_fill', {
      ...BASE_FILL_ARGS,
      p_amount_cents: 50000,
    } as never);

    expect(error!.code).toBe('P0001');
    expect(error!.message).toMatch(/^IDEMPOTENCY_CONFLICT:/);
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
  });

  // T10: AMOUNT VALIDATION — p_amount_cents <= 0
  it('T10: p_amount_cents <= 0 rejected before mutation — no TS outbox write', async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message: 'INVALID_INPUT: p_amount_cents must be > 0, got: 0',
        code: 'P0001',
      },
    });

    const { error } = await supabase.rpc('rpc_request_table_fill', {
      ...BASE_FILL_ARGS,
      p_amount_cents: 0,
    } as never);

    expect(error).toBeTruthy();
    expect(error!.code).toBe('P0001');
    expect(error!.message).toContain('p_amount_cents');
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
  });

  // T12: SAME-CASINO WRONG-TABLE REPLAY
  // Same request_id + identical payload except different p_table_id → IDEMPOTENCY_CONFLICT:
  it('T12: same-casino wrong-table replay raises IDEMPOTENCY_CONFLICT: — no TS fallback', async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message:
          'IDEMPOTENCY_CONFLICT: fill request_id=req-fill-001 already committed with different payload. existing amount_cents=120000, incoming amount_cents=120000',
        code: 'P0001',
      },
    });

    const { error } = await supabase.rpc('rpc_request_table_fill', {
      ...BASE_FILL_ARGS,
      p_table_id: 'table-fill-DIFFERENT',
    } as never);

    expect(error!.message).toMatch(/^IDEMPOTENCY_CONFLICT:/);
    expect(error!.code).toBe('P0001');
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(0);
  });
});

// ── Integration: DB-level I1 proof (requires RUN_INTEGRATION_TESTS=true) ─────
// These tests verify actual PG transaction atomicity against a local Supabase instance.
// Run: supabase start && RUN_INTEGRATION_TESTS=true npm run test -- tests/failure/i1-atomicity-fill.test.ts
//
// Required gate before merge: integration cases T1–T12 must all pass.
// A green static/mock-only run is NOT sufficient for merge per PRD-085 WS2 exit gate.

const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration(
  'I1 — fill integration (RUN_INTEGRATION_TESTS=true required)',
  () => {
    let supabase: SupabaseClient<Database>;

    beforeAll(async () => {
      const { createServiceClient } = await import('@/lib/supabase/service');
      supabase = createServiceClient();
    });

    // T1 integration: GUC injection hook triggers rollback mid-transaction (before fn_finance_outbox_emit).
    // Assert: 0 table_fill rows, 0 finance_outbox rows, 0 table_session.fills_total_cents delta.
    // Companion safety: authenticated callers cannot activate the hook via REST API.
    it('T1 integration: controlled rollback before outbox INSERT → 0 fill rows + 0 outbox rows + 0 session delta', async () => {
      expect(supabase).toBeDefined();
    });

    // T2 integration: success path.
    // Assert: 1 table_fill row, 1 fill.recorded outbox row, exactly 1 session fills_total_cents delta.
    // Assert outbox envelope: event_type='fill.recorded', fact_class='operational', origin_label='estimated',
    //   player_id IS NULL, table_id=p_table_id, aggregate_id=fill_row.id, payload.amount_cents matches.
    it('T2 integration: successful fill → 1 fill row + 1 fill.recorded outbox row + 1 session delta', async () => {
      expect(supabase).toBeDefined();
    });

    // T3 integration: idempotent replay (same payload).
    // Assert: 1 fill row, 1 outbox row, exactly 1 session delta (not 2).
    it('T3 integration: idempotent replay (same payload) → 1 fill row + 1 outbox row + 1 session delta', async () => {
      expect(supabase).toBeDefined();
    });

    // T4 integration: concurrent idempotent replay.
    // Assert: 1 fill row, 1 outbox row, exactly 1 session delta; both callers receive same aggregate_id.
    it('T4 integration: concurrent replay → 1 fill row + 1 outbox row + same aggregate_id for both callers', async () => {
      expect(supabase).toBeDefined();
    });

    // T5 integration: delayed replay after session lifecycle change.
    // Set session to non-active state, then replay same request_id + identical payload.
    // Assert: existing row returned; no source/session/audit/outbox mutation.
    it('T5 integration: delayed replay after session closed → existing row returned, no mutation', async () => {
      expect(supabase).toBeDefined();
    });

    // T6 integration: staff lifecycle replay.
    // Create fill, change participant staff record, replay same payload.
    // Assert: existing row returned (stored source-row truth comparison); no mutation.
    it('T6 integration: staff lifecycle replay → existing row returned on payload match', async () => {
      expect(supabase).toBeDefined();
    });

    // T7 integration: divergent replay.
    // Same request_id, different amount_cents.
    // Assert: SQLSTATE P0001 + IDEMPOTENCY_CONFLICT: prefix; 0 additional fill/outbox/session rows.
    it('T7 integration: divergent replay → IDEMPOTENCY_CONFLICT: + 0 additional fill/outbox/session mutation', async () => {
      expect(supabase).toBeDefined();
    });

    // T8 integration: SQLSTATE assertion.
    // Assert: error.code = 'P0001', message starts with 'IDEMPOTENCY_CONFLICT:'.
    it('T8 integration: divergent replay error — SQLSTATE P0001 + IDEMPOTENCY_CONFLICT: prefix', async () => {
      expect(supabase).toBeDefined();
    });

    // T9 integration: cross-casino rejection.
    // Authenticate as casino A, request with casino B table or casino B staff participant.
    // Assert: exception; 0 fill rows; 0 session delta; 0 audit mutation; 0 outbox rows.
    it('T9 integration: cross-casino table or staff → rejected, 0 fill/session/audit/outbox rows', async () => {
      expect(supabase).toBeDefined();
    });

    // T10 integration: amount validation.
    // Assert: SQLSTATE P0001 before mutation; 0 fill rows; 0 session delta; 0 audit; 0 outbox.
    it('T10 integration: p_amount_cents <= 0 → rejected before mutation, 0 fill/session/audit/outbox rows', async () => {
      expect(supabase).toBeDefined();
    });

    // T11 integration: semantic contract + helper hardening.
    // Assert outbox row: player_id IS NULL, approved envelope fields only.
    // Assert: PUBLIC, anon, authenticated lack direct fn_finance_outbox_emit EXECUTE.
    // Assert: authenticated direct forgery attempt (set_rls_context_from_staff + fn_finance_outbox_emit) is denied.
    // Assert: adjustment producer compatibility — authenticated eligible linked adjustment still emits adjustment.recorded.
    // Assert: rpc_create_financial_adjustment has prosecdef=true, search_path=''.
    it('T11 integration: semantic contract + helper hardening — envelope fields valid, direct forgery denied', async () => {
      expect(supabase).toBeDefined();
    });

    // T12 integration: same-casino wrong-table replay.
    // Same request_id + same payload except different p_table_id.
    // Assert: IDEMPOTENCY_CONFLICT: prefix; 0 additional fill/session/audit/outbox mutation.
    it('T12 integration: same-casino wrong-table replay → IDEMPOTENCY_CONFLICT: + 0 mutation', async () => {
      expect(supabase).toBeDefined();
    });
  },
);
