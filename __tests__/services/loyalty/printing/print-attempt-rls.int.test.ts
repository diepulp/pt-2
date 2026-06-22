/** @jest-environment node */

/**
 * print_attempt controlled-write RPC Integration Tests (PRD-092 WS2)
 *
 * Real-DB integration tests for the InstrumentPrinting controlled-write path:
 *   - rpc_request_print_attempt          (insert / insert-or-return-prior + ref resolution)
 *   - rpc_transition_print_attempt       (requested -> terminal, status/failure only)
 *   - rpc_mark_stale_print_attempts_unknown (crash-window reconciler, P0-4)
 *
 * Proves (against a live database, NO client-constructor mock — Gate A):
 *   1. Cross-casino isolation: casino A cannot read/transition casino B's row.
 *   2. Forged actor: operator_id is bound to set_rls_context_from_staff() context.
 *   3. Idempotency replay: a repeated key returns the prior row (no 2nd insert).
 *   4. Terminal immutability: transitioning an already-terminal row raises (P0100).
 *   5. Controlled-write boundary (P0-1/DEC-007): direct table INSERT/UPDATE are RLS-denied.
 *   6. Referential guard (P0-2/DEC-007): a non-resolving / cross-casino instrument_ref
 *      is rejected by the RPC (P0003) before any write.
 *   7. Transport-failure domain (DEC-006): failed/transport_submission is persistable.
 *   8. Stale reconciliation (P0-4): a stale `requested` row sweeps to `unknown`.
 *
 * Auth model: ADR-024 Mode C — authenticated anon clients carry a JWT with
 * staff_id in app_metadata; set_rls_context_from_staff() derives context server-side.
 *
 * PREREQUISITES:
 * - Local Supabase running: `npx supabase start`
 * - Migrations applied: 20260619145557_create_print_attempt,
 *                       20260619151717_create_print_attempt_write_rpcs
 * - RUN_INTEGRATION_TESTS=true and NEXT_PUBLIC_SUPABASE_URL /
 *   SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY set.
 *
 * @see PRD-092 / EXEC-092 WS2 (patched: P0-1/P0-2/P0-4, DEC-006/007)
 * @see ADR-024 (authoritative context), ADR-063 D5 (idempotency), DEC-005
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const isIntegrationEnvironment =
  supabaseUrl &&
  SERVICE_ROLE_KEY &&
  ANON_KEY &&
  (process.env.RUN_INTEGRATION_TESTS === 'true' ||
    process.env.RUN_INTEGRATION_TESTS === '1');

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

// A uuid guaranteed NOT to resolve to any instrument (for the negative test).
const UNRESOLVABLE_REF = '99999999-9999-4999-8999-999999999999';

type PrintAttemptRow = Database['public']['Tables']['print_attempt']['Row'];

describeIntegration('print_attempt controlled-write RPCs (WS2)', () => {
  let setupClient: SupabaseClient<Database>;
  let pitBossClient: SupabaseClient<Database>;
  let otherCasinoClient: SupabaseClient<Database>;

  let casinoId: string;
  let otherCasinoId: string;
  let pitBossId: string;
  let otherPitBossId: string;
  let userId1: string;
  let userId2: string;

  // Real instrument fixtures (P0-2: instrument_ref must resolve same-casino).
  let couponRefA: string; // promo_coupon in casino A
  let couponRefB: string; // promo_coupon in casino B (cross-casino negative)
  let ledgerRefA: string; // loyalty_ledger entry in casino A (comp family)
  let playerId: string;

  const pitBossEmail = `test-pa-pitboss-${Date.now()}@example.com`;
  const otherPitBossEmail = `test-pa-other-${Date.now() + 1}@example.com`;
  const testPassword = 'test-password';

  // Default args target the resolving casino-A promo_coupon. Each call uses a
  // fresh idempotency key unless overridden.
  function requestArgs(overrides: Record<string, unknown> = {}) {
    return {
      p_instrument_kind: 'promo_coupon',
      p_instrument_ref: couponRefA,
      p_printer_target_id: 'agent://loopback/printer-0',
      p_template_id: 'loyalty_entitlement',
      p_template_version: 1,
      p_receipt_document_hash: 'sha256:deadbeef',
      p_idempotency_key: `key-${Date.now()}-${Math.random()}`,
      p_station_id: null,
      p_reprint_of: null,
      p_correlation_id: null,
      ...overrides,
    };
  }

  beforeAll(async () => {
    setupClient = createClient<Database>(supabaseUrl, SERVICE_ROLE_KEY);

    // 1. Auth users (two-phase ADR-024)
    const { data: u1, error: u1e } = await setupClient.auth.admin.createUser({
      email: pitBossEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: { staff_role: 'pit_boss' },
    });
    if (u1e) throw u1e;
    userId1 = u1.user.id;

    const { data: u2, error: u2e } = await setupClient.auth.admin.createUser({
      email: otherPitBossEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: { staff_role: 'pit_boss' },
    });
    if (u2e) throw u2e;
    userId2 = u2.user.id;

    // 2. Companies (ADR-043: company before casino)
    const { data: c1, error: c1e } = await setupClient
      .from('company')
      .insert({ name: 'PrintAttempt Co 1' })
      .select('id')
      .single();
    if (c1e) throw c1e;
    const { data: c2, error: c2e } = await setupClient
      .from('company')
      .insert({ name: 'PrintAttempt Co 2' })
      .select('id')
      .single();
    if (c2e) throw c2e;

    // 3. Casinos
    const { data: cas1, error: cas1e } = await setupClient
      .from('casino')
      .insert({ name: 'PrintAttempt Casino', company_id: c1.id })
      .select('id')
      .single();
    if (cas1e) throw cas1e;
    casinoId = cas1.id;

    const { data: cas2, error: cas2e } = await setupClient
      .from('casino')
      .insert({ name: 'PrintAttempt Other Casino', company_id: c2.id })
      .select('id')
      .single();
    if (cas2e) throw cas2e;
    otherCasinoId = cas2.id;

    // 3b. casino_settings (required by various triggers)
    await setupClient.from('casino_settings').insert({ casino_id: casinoId });
    await setupClient
      .from('casino_settings')
      .insert({ casino_id: otherCasinoId });

    // 4. Staff
    const { data: pb, error: pbe } = await setupClient
      .from('staff')
      .insert({
        user_id: userId1,
        casino_id: casinoId,
        role: 'pit_boss',
        first_name: 'Print',
        last_name: 'PitBoss',
        status: 'active',
      })
      .select('id')
      .single();
    if (pbe) throw pbe;
    pitBossId = pb.id;

    const { data: opb, error: opbe } = await setupClient
      .from('staff')
      .insert({
        user_id: userId2,
        casino_id: otherCasinoId,
        role: 'pit_boss',
        first_name: 'Other',
        last_name: 'PitBoss',
        status: 'active',
      })
      .select('id')
      .single();
    if (opbe) throw opbe;
    otherPitBossId = opb.id;

    // 4b. Real instrument fixtures — instrument_ref now MUST resolve same-casino (P0-2).
    //     promo_coupon in casino A (via a promo_program), promo_coupon in casino B,
    //     and a loyalty_ledger entry in casino A for the comp (ledger_entry) family.
    const { data: progA, error: progAe } = await setupClient
      .from('promo_program')
      .insert({
        casino_id: casinoId,
        name: 'PA Match Play A',
        promo_type: 'match_play',
        face_value_amount: 25,
        required_match_wager_amount: 25,
      })
      .select('id')
      .single();
    if (progAe) throw progAe;

    const { data: couponA, error: couponAe } = await setupClient
      .from('promo_coupon')
      .insert({
        casino_id: casinoId,
        promo_program_id: progA.id,
        validation_number: `PA-A-${Date.now()}`,
        face_value_amount: 25,
        required_match_wager_amount: 25,
        issued_by_staff_id: pitBossId,
      })
      .select('id')
      .single();
    if (couponAe) throw couponAe;
    couponRefA = couponA.id;

    const { data: progB, error: progBe } = await setupClient
      .from('promo_program')
      .insert({
        casino_id: otherCasinoId,
        name: 'PA Match Play B',
        promo_type: 'match_play',
        face_value_amount: 25,
        required_match_wager_amount: 25,
      })
      .select('id')
      .single();
    if (progBe) throw progBe;

    const { data: couponB, error: couponBe } = await setupClient
      .from('promo_coupon')
      .insert({
        casino_id: otherCasinoId,
        promo_program_id: progB.id,
        validation_number: `PA-B-${Date.now()}`,
        face_value_amount: 25,
        required_match_wager_amount: 25,
        issued_by_staff_id: otherPitBossId,
      })
      .select('id')
      .single();
    if (couponBe) throw couponBe;
    couponRefB = couponB.id;

    const { data: player, error: playerE } = await setupClient
      .from('player')
      .insert({
        first_name: 'Comp',
        last_name: 'Player',
        birth_date: '1980-01-01',
      })
      .select('id')
      .single();
    if (playerE) throw playerE;
    playerId = player.id;

    const { data: ledgerA, error: ledgerAe } = await setupClient
      .from('loyalty_ledger')
      .insert({
        casino_id: casinoId,
        player_id: playerId,
        points_delta: -100,
        reason: 'redeem',
      })
      .select('id')
      .single();
    if (ledgerAe) throw ledgerAe;
    ledgerRefA = ledgerA.id;

    // 5. Stamp staff_id into app_metadata (ADR-024 two-phase)
    await setupClient.auth.admin.updateUserById(userId1, {
      app_metadata: {
        staff_id: pitBossId,
        casino_id: casinoId,
        staff_role: 'pit_boss',
      },
    });
    await setupClient.auth.admin.updateUserById(userId2, {
      app_metadata: {
        staff_id: otherPitBossId,
        casino_id: otherCasinoId,
        staff_role: 'pit_boss',
      },
    });

    // 6. Sign in for JWTs
    const throwaway1 = createClient<Database>(supabaseUrl, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: s1, error: s1e } = await throwaway1.auth.signInWithPassword({
      email: pitBossEmail,
      password: testPassword,
    });
    if (s1e || !s1.session)
      throw s1e ?? new Error('sign-in 1 returned no session');

    const throwaway2 = createClient<Database>(supabaseUrl, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: s2, error: s2e } = await throwaway2.auth.signInWithPassword({
      email: otherPitBossEmail,
      password: testPassword,
    });
    if (s2e || !s2.session)
      throw s2e ?? new Error('sign-in 2 returned no session');

    // 7. Mode C authenticated anon clients
    pitBossClient = createClient<Database>(supabaseUrl, ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${s1.session.access_token}` },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    otherCasinoClient = createClient<Database>(supabaseUrl, ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${s2.session.access_token}` },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    if (!setupClient) return;
    for (const cid of [casinoId, otherCasinoId]) {
      if (!cid) continue;
      await setupClient.from('print_attempt').delete().eq('casino_id', cid);
      await setupClient.from('promo_coupon').delete().eq('casino_id', cid);
      await setupClient.from('promo_program').delete().eq('casino_id', cid);
      await setupClient.from('loyalty_ledger').delete().eq('casino_id', cid);
      await setupClient.from('staff').delete().eq('casino_id', cid);
      await setupClient.from('casino_settings').delete().eq('casino_id', cid);
      await setupClient.from('casino').delete().eq('id', cid);
    }
    if (playerId) await setupClient.from('player').delete().eq('id', playerId);
    if (userId1) await setupClient.auth.admin.deleteUser(userId1);
    if (userId2) await setupClient.auth.admin.deleteUser(userId2);
  });

  it('inserts a requested row with context-derived casino_id + operator_id', async () => {
    const args = requestArgs();
    const { data, error } = await pitBossClient.rpc(
      'rpc_request_print_attempt',
      args,
    );
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const row = data as unknown as PrintAttemptRow;
    expect(row.result_status).toBe('requested');
    expect(row.casino_id).toBe(casinoId); // context-derived, NOT a param
    expect(row.operator_id).toBe(pitBossId); // context-derived (ADR-024)
    expect(row.idempotency_key).toBe(args.p_idempotency_key);
  });

  it('forged actor: operator_id is bound to context, not spoofable', async () => {
    const { data, error } = await pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs(),
    );
    expect(error).toBeNull();
    const row = data as unknown as PrintAttemptRow;
    expect(row.operator_id).toBe(pitBossId);
    expect(row.operator_id).not.toBe(otherPitBossId);
  });

  it('idempotency replay returns the prior row (no second insert)', async () => {
    const args = requestArgs();

    const first = await pitBossClient.rpc('rpc_request_print_attempt', args);
    expect(first.error).toBeNull();
    const firstRow = first.data as unknown as PrintAttemptRow;

    const second = await pitBossClient.rpc('rpc_request_print_attempt', args);
    expect(second.error).toBeNull();
    const secondRow = second.data as unknown as PrintAttemptRow;

    expect(secondRow.print_attempt_id).toBe(firstRow.print_attempt_id);

    const { count } = await setupClient
      .from('print_attempt')
      .select('*', { count: 'exact', head: true })
      .eq('casino_id', casinoId)
      .eq('idempotency_key', args.p_idempotency_key);
    expect(count).toBe(1);
  });

  // ── P0-2 / DEC-007: instrument_ref resolution is the RPC's job ──────────────

  it('rejects a non-resolving instrument_ref before any write (P0003)', async () => {
    const { error } = await pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs({ p_instrument_ref: UNRESOLVABLE_REF }),
    );
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/instrument_ref|P0003|not_resolved/i);
  });

  it('rejects a cross-casino instrument_ref (casino A using casino B coupon) — P0003', async () => {
    // couponRefB exists, but in casino B. Casino A's context must not resolve it.
    const { error } = await pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs({ p_instrument_ref: couponRefB }),
    );
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/instrument_ref|P0003|not_resolved/i);
  });

  it('resolves and persists the comp (ledger_entry) family', async () => {
    const { data, error } = await pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs({
        p_instrument_kind: 'ledger_entry',
        p_instrument_ref: ledgerRefA,
      }),
    );
    expect(error).toBeNull();
    const row = data as unknown as PrintAttemptRow;
    expect(row.instrument_kind).toBe('ledger_entry');
    expect(row.instrument_ref).toBe(ledgerRefA);
  });

  // ── P0-1 / DEC-007: controlled-write boundary (direct DML denied) ───────────

  it('denies a direct authenticated INSERT into print_attempt (RLS)', async () => {
    const { error } = await pitBossClient.from('print_attempt').insert({
      instrument_kind: 'promo_coupon',
      instrument_ref: couponRefA,
      casino_id: casinoId,
      operator_id: pitBossId,
      printer_target_id: 'agent://loopback/printer-0',
      template_id: 'loyalty_entitlement',
      template_version: 1,
      receipt_document_hash: 'sha256:forged',
      idempotency_key: `direct-${Date.now()}-${Math.random()}`,
      result_status: 'submitted', // fabricated success — must be blocked
    });
    expect(error).not.toBeNull(); // RLS: new row violates row-level security policy
  });

  it('denies a direct authenticated UPDATE of print_attempt (RLS)', async () => {
    const created = await pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs(),
    );
    const row = created.data as unknown as PrintAttemptRow;

    // Attempt a direct status flip; RLS USING(false) matches 0 rows.
    await pitBossClient
      .from('print_attempt')
      .update({ result_status: 'submitted' })
      .eq('print_attempt_id', row.print_attempt_id);

    const { data: still } = await setupClient
      .from('print_attempt')
      .select('result_status')
      .eq('print_attempt_id', row.print_attempt_id)
      .single();
    expect(still?.result_status).toBe('requested'); // unchanged by the direct UPDATE
  });

  // ── transition + cross-casino ───────────────────────────────────────────────

  it('cross-casino isolation: casino B cannot transition casino A row', async () => {
    const created = await pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs(),
    );
    expect(created.error).toBeNull();
    const row = created.data as unknown as PrintAttemptRow;

    const { error } = await otherCasinoClient.rpc(
      'rpc_transition_print_attempt',
      {
        p_print_attempt_id: row.print_attempt_id,
        p_result_status: 'submitted',
        p_failure_domain: null,
        p_failure_code: null,
        p_correlation_id: null,
      },
    );
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/not_found|P0002|does not exist/i);

    const { data: stillA } = await setupClient
      .from('print_attempt')
      .select('result_status')
      .eq('print_attempt_id', row.print_attempt_id)
      .single();
    expect(stillA?.result_status).toBe('requested');
  });

  it('transitions requested -> submitted (status/failure only)', async () => {
    const created = await pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs(),
    );
    const row = created.data as unknown as PrintAttemptRow;

    const { data, error } = await pitBossClient.rpc(
      'rpc_transition_print_attempt',
      {
        p_print_attempt_id: row.print_attempt_id,
        p_result_status: 'submitted',
        p_failure_domain: null,
        p_failure_code: null,
        p_correlation_id: null,
      },
    );
    expect(error).toBeNull();
    const updated = data as unknown as PrintAttemptRow;
    expect(updated.result_status).toBe('submitted');
  });

  // ── DEC-006: transport_submission failure domain ────────────────────────────

  it('persists failed / transport_submission (DEC-006 — non-null transport domain)', async () => {
    const created = await pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs(),
    );
    const row = created.data as unknown as PrintAttemptRow;

    const { data, error } = await pitBossClient.rpc(
      'rpc_transition_print_attempt',
      {
        p_print_attempt_id: row.print_attempt_id,
        p_result_status: 'failed',
        p_failure_domain: 'transport_submission',
        p_failure_code: 'agent_unreachable',
        p_correlation_id: null,
      },
    );
    expect(error).toBeNull();
    const updated = data as unknown as PrintAttemptRow;
    expect(updated.result_status).toBe('failed');
    expect(updated.failure_domain).toBe('transport_submission');
    expect(updated.failure_code).toBe('agent_unreachable');
  });

  it('terminal immutability: transitioning an already-terminal row raises', async () => {
    const created = await pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs(),
    );
    const row = created.data as unknown as PrintAttemptRow;

    const t1 = await pitBossClient.rpc('rpc_transition_print_attempt', {
      p_print_attempt_id: row.print_attempt_id,
      p_result_status: 'submitted',
      p_failure_domain: null,
      p_failure_code: null,
      p_correlation_id: null,
    });
    expect(t1.error).toBeNull();

    const t2 = await pitBossClient.rpc('rpc_transition_print_attempt', {
      p_print_attempt_id: row.print_attempt_id,
      p_result_status: 'failed',
      p_failure_domain: 'render_validation',
      p_failure_code: 'X',
      p_correlation_id: null,
    });
    expect(t2.error).not.toBeNull();
    expect(t2.error?.message ?? '').toMatch(/terminal|P0100|immutable/i);
  });

  it('rejects a non-terminal transition target (P0101)', async () => {
    const created = await pitBossClient.rpc(
      'rpc_request_print_attempt',
      requestArgs(),
    );
    const row = created.data as unknown as PrintAttemptRow;

    const { error } = await pitBossClient.rpc('rpc_transition_print_attempt', {
      p_print_attempt_id: row.print_attempt_id,
      p_result_status: 'requested', // illegal terminal target
      p_failure_domain: null,
      p_failure_code: null,
      p_correlation_id: null,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/invalid_transition|P0101/i);
  });

  // ── P0-4: stale-requested reconciliation ────────────────────────────────────

  it('reconciler sweeps a stale requested row to unknown (P0-4)', async () => {
    // Seed a backdated `requested` row directly (service role bypasses RLS; the
    // BEFORE UPDATE trigger does not fire on INSERT, so requested_at can be set).
    const staleKey = `stale-${Date.now()}-${Math.random()}`;
    const { data: seeded, error: seedErr } = await setupClient
      .from('print_attempt')
      .insert({
        instrument_kind: 'promo_coupon',
        instrument_ref: couponRefA,
        casino_id: casinoId,
        operator_id: pitBossId,
        printer_target_id: 'agent://loopback/printer-0',
        template_id: 'loyalty_entitlement',
        template_version: 1,
        receipt_document_hash: 'sha256:stale',
        idempotency_key: staleKey,
        requested_at: '2020-01-01T00:00:00Z', // well past the 15-min threshold
      })
      .select('print_attempt_id')
      .single();
    if (seedErr) throw seedErr;

    const { data: count, error } = await pitBossClient.rpc(
      'rpc_mark_stale_print_attempts_unknown',
      { p_correlation_id: null },
    );
    expect(error).toBeNull();
    expect(typeof count).toBe('number');
    expect(count as unknown as number).toBeGreaterThanOrEqual(1);

    const { data: swept } = await setupClient
      .from('print_attempt')
      .select('result_status')
      .eq('print_attempt_id', seeded.print_attempt_id)
      .single();
    expect(swept?.result_status).toBe('unknown');
  });
});
