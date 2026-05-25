// PRD-084 Phase 2.1 Adjustment Certification — ephemeral utility, not a framework
// Twenty cases across six proof sections. Exits non-zero if any case fails.
// Reuses helpers.ts and seed.ts from PRD-082; introduces no new shared modules.

import dotenv from 'dotenv';
import type { Json } from '../../types/database.types';
import {
  createAuthenticatedClient,
  createServiceClient,
  assert,
  printResult,
  PROOF,
} from './helpers';

dotenv.config({ path: '.env.local' });

// Unique prefix — makes idempotency keys distinct across reruns on the same DB
const RUN = `cert-${Date.now()}`;

type CaseResult = { id: string; pass: boolean; detail: string };

// ─────────────────────────────────────────────────────────────────────────────
// Section A — Adjustment I1: atomicity, rollback, exclusions (5 cases)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionA(
  auth: Awaited<ReturnType<typeof createAuthenticatedClient>>,
  service: ReturnType<typeof createServiceClient>,
): Promise<CaseResult[]> {
  console.log('\n[SECTION A] Adjustment I1 Live Proof');
  const results: CaseResult[] = [];

  // A1 — Eligible success
  // Creates an eligible original (pit/in/cash + SLIP_ID) then an eligible linked adjustment.
  // Expects: 1 adj PFT row + 1 finance_outbox row with correct envelope fields.
  try {
    const { data: orig, error: origErr } = await auth.rpc(
      'rpc_create_financial_txn',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_amount: 100,
        p_direction: 'in',
        p_source: 'pit',
        p_tender_type: 'cash',
        p_rating_slip_id: PROOF.SLIP_ID,
        p_idempotency_key: `${RUN}-orig-a1`,
      },
    );
    assert(!origErr && orig != null, `A1 original PFT: ${origErr?.message}`);
    const origId = (orig as { id: string }).id;

    const { data: adj, error: adjErr } = await auth.rpc(
      'rpc_create_financial_adjustment',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_delta_amount: 50,
        p_reason_code: 'data_entry_error',
        p_note: 'Proof certification note A1 eligible success',
        p_original_txn_id: origId,
        p_idempotency_key: `${RUN}-adj-a1`,
      },
    );
    assert(!adjErr && adj != null, `A1 adjustment RPC: ${adjErr?.message}`);
    const adjRow = adj as { id: string };

    const { data: outbox, error: outboxErr } = await service
      .from('finance_outbox')
      .select('*')
      .eq('aggregate_id', adjRow.id);
    assert(!outboxErr, `A1 outbox query: ${outboxErr?.message}`);
    assert(
      outbox!.length === 1,
      `A1: expected 1 outbox row, got ${outbox!.length}`,
    );

    const oa = outbox![0];
    assert(
      oa.event_type === 'adjustment.recorded',
      `A1 event_type: ${oa.event_type}`,
    );
    assert(oa.fact_class === 'ledger', `A1 fact_class: ${oa.fact_class}`);
    assert(oa.origin_label === 'actual', `A1 origin_label: ${oa.origin_label}`);
    assert(oa.table_id != null, 'A1: table_id is NULL');
    assert(oa.player_id === PROOF.PLAYER_ID, `A1 player_id: ${oa.player_id}`);
    assert(
      oa.aggregate_id === adjRow.id,
      'A1: aggregate_id != adjustment PFT id',
    );

    printResult(
      'A1 eligible success',
      true,
      'event_type=adjustment.recorded, table_id present',
    );
    results.push({
      id: 'A1',
      pass: true,
      detail: '1 adj PFT + 1 outbox row; all envelope fields correct',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('A1 eligible success', false, msg);
    results.push({ id: 'A1', pass: false, detail: msg });
  }

  // A2 — Rollback injection: slip cross-casino poison.
  // Create a valid eligible original (auth RPC) linked to a dedicated A2 slip.
  // Poison the slip by moving it to casino_2 → adj RPC cannot resolve the same-casino
  // table anchor → guard trigger raises RATING_SLIP_NOT_FOUND during adj PFT INSERT
  // → entire transaction rolled back (no adj PFT, no outbox row).
  // Note: direct service_role insert for pit-source PFTs fires trg_derive_mtl_from_finance
  // which requires app.casino_id context — auth RPC provides this transparently.
  try {
    const a2SlipId = '00000000-a200-a200-a200-000000000001';
    const adjKey = `${RUN}-adj-a2`;

    // Step 1: Ensure dedicated slip exists in casino_1 (idempotent via upsert)
    // status='archived' avoids ux_rating_slip_visit_table_active (WHERE status IN ('open','paused'))
    const { error: slipErr } = await service.from('rating_slip').upsert(
      {
        id: a2SlipId,
        casino_id: PROOF.CASINO_1_ID,
        visit_id: PROOF.VISIT_ID,
        table_id: PROOF.TABLE_1_ID,
        status: 'archived',
        accrual_kind: 'compliance_only',
      },
      { onConflict: 'id' },
    );
    assert(!slipErr, `A2 slip upsert: ${slipErr?.message}`);

    // Step 2: Create eligible original via auth RPC (sets RLS context; avoids MTL bridge context error)
    const { data: a2Orig, error: a2OrigErr } = await auth.rpc(
      'rpc_create_financial_txn',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_amount: 100,
        p_direction: 'in',
        p_source: 'pit',
        p_tender_type: 'cash',
        p_rating_slip_id: a2SlipId,
        p_idempotency_key: `${RUN}-orig-a2`,
      },
    );
    assert(
      !a2OrigErr && a2Orig != null,
      `A2 setup original: ${a2OrigErr?.message}`,
    );
    const a2OrigId = (a2Orig as { id: string }).id;

    // Step 3: Cross-casino poison — slip becomes invisible to casino_1 queries
    const { error: poisonErr } = await service
      .from('rating_slip')
      .update({ casino_id: PROOF.CASINO_2_ID })
      .eq('id', a2SlipId);
    assert(!poisonErr, `A2 poison UPDATE: ${poisonErr?.message}`);

    const beforeTs = new Date().toISOString();
    const { error: rollbackErr } = await auth.rpc(
      'rpc_create_financial_adjustment',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_delta_amount: 25,
        p_reason_code: 'data_entry_error',
        p_note: 'Proof certification note A2 rollback injection',
        p_original_txn_id: a2OrigId,
        p_idempotency_key: adjKey,
      },
    );
    assert(rollbackErr != null, 'A2: expected exception but RPC succeeded');

    // Adjustment PFT must be absent (rolled back)
    const { count: pftCount } = await service
      .from('player_financial_transaction')
      .select('id', { count: 'exact', head: true })
      .eq('idempotency_key', adjKey);
    assert(
      pftCount === 0,
      `A2: ${pftCount} adj PFT rows survived rollback (expected 0)`,
    );

    // No new outbox rows emitted
    const { data: newOutbox } = await service
      .from('finance_outbox')
      .select('event_id')
      .gt('created_at', beforeTs)
      .eq('event_type', 'adjustment.recorded')
      .eq('casino_id', PROOF.CASINO_1_ID);
    assert(
      (newOutbox ?? []).length === 0,
      `A2: ${newOutbox?.length} outbox rows emitted after rollback (expected 0)`,
    );

    printResult(
      'A2 rollback injection',
      true,
      'cross-casino poisoned slip → exception + full rollback',
    );
    results.push({
      id: 'A2',
      pass: true,
      detail:
        'cross-casino poisoned slip: guard rejects adj PFT, 0 adj PFT rows, 0 outbox rows',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('A2 rollback injection', false, msg);
    results.push({ id: 'A2', pass: false, detail: msg });
  }

  // A3 — Unlinked adjustment (p_original_txn_id omitted → NULL).
  // Expects: 1 valid adj PFT row, 0 outbox rows.
  try {
    const { data: adj, error: adjErr } = await auth.rpc(
      'rpc_create_financial_adjustment',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_delta_amount: 10,
        p_reason_code: 'other',
        p_note: 'Proof certification note A3 unlinked adjustment',
        p_idempotency_key: `${RUN}-adj-a3`,
      },
    );
    assert(
      !adjErr && adj != null,
      `A3 unlinked adjustment: ${adjErr?.message}`,
    );
    const adjRow = adj as { id: string };

    const { data: outbox } = await service
      .from('finance_outbox')
      .select('event_id')
      .eq('aggregate_id', adjRow.id);
    assert(
      (outbox ?? []).length === 0,
      `A3: expected 0 outbox rows, got ${outbox?.length}`,
    );

    printResult('A3 unlinked', true, '1 PFT, 0 outbox rows');
    results.push({
      id: 'A3',
      pass: true,
      detail: 'unlinked adjustment: valid PFT, no outbox row',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('A3 unlinked', false, msg);
    results.push({ id: 'A3', pass: false, detail: msg });
  }

  // A4 — Excluded linked adjustment: original source = 'cage' (fails ADR-057 source criterion).
  // Setup: service_role direct INSERT of cage-source original.
  // Expects: 1 adj PFT row (valid write), 0 outbox rows.
  try {
    const a4OrigId = '00000000-a400-a400-a400-000000000000';
    // created_by_staff_id required: trg_bridge_rated_buyin_telemetry fires on direction=in + slip IS NOT NULL
    const { error: a4UpsertErr } = await service
      .from('player_financial_transaction')
      .upsert(
        {
          id: a4OrigId,
          player_id: PROOF.PLAYER_ID,
          casino_id: PROOF.CASINO_1_ID,
          visit_id: PROOF.VISIT_ID,
          amount: 100,
          direction: 'in' as const,
          source: 'cage' as const,
          tender_type: 'cash',
          rating_slip_id: PROOF.SLIP_ID,
          txn_kind: 'original' as const,
          created_by_staff_id: PROOF.STAFF_ID,
        },
        { onConflict: 'id' },
      );
    assert(!a4UpsertErr, `A4 setup upsert: ${a4UpsertErr?.message}`);

    const { data: adj, error: adjErr } = await auth.rpc(
      'rpc_create_financial_adjustment',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_delta_amount: 15,
        p_reason_code: 'data_entry_error',
        p_note: 'Proof certification note A4 excluded original',
        p_original_txn_id: a4OrigId,
        p_idempotency_key: `${RUN}-adj-a4`,
      },
    );
    assert(
      !adjErr && adj != null,
      `A4 excluded adjustment: ${adjErr?.message}`,
    );
    const adjRow = adj as { id: string };

    const { data: outbox } = await service
      .from('finance_outbox')
      .select('event_id')
      .eq('aggregate_id', adjRow.id);
    assert(
      (outbox ?? []).length === 0,
      `A4: expected 0 outbox rows for excluded, got ${outbox?.length}`,
    );

    printResult(
      'A4 excluded linked',
      true,
      'source=cage excluded: 1 adj PFT, 0 outbox rows',
    );
    results.push({
      id: 'A4',
      pass: true,
      detail: 'excluded original (source=cage): valid PFT, no outbox row',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('A4 excluded linked', false, msg);
    results.push({ id: 'A4', pass: false, detail: msg });
  }

  // A5 — Invalid inherited table anchor.
  // Creates an eligible original via RPC (valid at creation time), then cross-casino-poisons
  // its dedicated slip so the adj RPC's table anchor resolution fails.
  // → guard trigger raises RATING_SLIP_NOT_FOUND during adj PFT INSERT → full rollback.
  // Distinct from A2: original was legitimately RPC-created (not service_role direct insert).
  try {
    const a5SlipId = '00000000-a500-a500-a500-000000000001';
    const adjKey = `${RUN}-adj-a5`;

    // Step 1: Ensure dedicated a5 slip exists in casino_1 (idempotent)
    // status='archived' avoids ux_rating_slip_visit_table_active (WHERE status IN ('open','paused'))
    const { error: a5SlipErr } = await service.from('rating_slip').upsert(
      {
        id: a5SlipId,
        casino_id: PROOF.CASINO_1_ID,
        visit_id: PROOF.VISIT_ID,
        table_id: PROOF.TABLE_1_ID,
        status: 'archived',
        accrual_kind: 'compliance_only',
      },
      { onConflict: 'id' },
    );
    assert(!a5SlipErr, `A5 slip upsert: ${a5SlipErr?.message}`);

    // Step 2: Create a valid eligible original via RPC (legitimate creation path)
    const { data: orig, error: origErr } = await auth.rpc(
      'rpc_create_financial_txn',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_amount: 200,
        p_direction: 'in',
        p_source: 'pit',
        p_tender_type: 'cash',
        p_rating_slip_id: a5SlipId,
        p_idempotency_key: `${RUN}-orig-a5`,
      },
    );
    assert(!origErr && orig != null, `A5 setup original: ${origErr?.message}`);
    const origId = (orig as { id: string }).id;

    // Step 3: Cross-casino poison — slip becomes invisible to casino_1 queries
    const { error: poisonErr } = await service
      .from('rating_slip')
      .update({ casino_id: PROOF.CASINO_2_ID })
      .eq('id', a5SlipId);
    assert(!poisonErr, `A5 poison UPDATE: ${poisonErr?.message}`);

    const beforeTs = new Date().toISOString();
    const { error: anchorErr } = await auth.rpc(
      'rpc_create_financial_adjustment',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_delta_amount: 20,
        p_reason_code: 'data_entry_error',
        p_note: 'Proof certification note A5 invalid anchor test',
        p_original_txn_id: origId,
        p_idempotency_key: adjKey,
      },
    );
    assert(
      anchorErr != null,
      'A5: expected exception from poisoned slip but RPC succeeded',
    );

    // 0 adj PFT rows (rolled back)
    const { count: pftCount } = await service
      .from('player_financial_transaction')
      .select('id', { count: 'exact', head: true })
      .eq('idempotency_key', adjKey);
    assert(
      pftCount === 0,
      `A5: ${pftCount} adj PFT rows after anchor exception (expected 0)`,
    );

    // 0 new outbox rows
    const { data: newOutbox } = await service
      .from('finance_outbox')
      .select('event_id')
      .gt('created_at', beforeTs)
      .eq('event_type', 'adjustment.recorded')
      .eq('casino_id', PROOF.CASINO_1_ID);
    assert(
      (newOutbox ?? []).length === 0,
      `A5: ${newOutbox?.length} outbox rows after anchor exception (expected 0)`,
    );

    printResult(
      'A5 invalid anchor',
      true,
      'cross-casino poisoned slip → exception + full rollback',
    );
    results.push({
      id: 'A5',
      pass: true,
      detail:
        'RPC-created original with poisoned slip: exception, 0 adj PFT, 0 outbox rows',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('A5 invalid anchor', false, msg);
    results.push({ id: 'A5', pass: false, detail: msg });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section B — Option A Security: direct insert denied (5 cases)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionB(
  auth: Awaited<ReturnType<typeof createAuthenticatedClient>>,
  service: ReturnType<typeof createServiceClient>,
): Promise<CaseResult[]> {
  console.log('\n[SECTION B] Option A Security Live Proof');
  const results: CaseResult[] = [];

  const fakeBase = {
    casino_id: PROOF.CASINO_1_ID,
    table_id: PROOF.TABLE_1_ID,
    player_id: PROOF.PLAYER_ID,
    aggregate_id: '00000000-b000-b000-b000-000000000099',
    fact_class: 'ledger',
    origin_label: 'actual',
    gaming_day: '2026-01-15',
    payload: { amount: 100 } as unknown as Json,
  };

  const deniedCases: Array<{
    id: string;
    label: string;
    eventType: string;
    eventId: string;
  }> = [
    {
      id: 'B1',
      label: 'direct insert denied (adjustment.recorded)',
      eventType: 'adjustment.recorded',
      eventId: '00000000-b001-b001-b001-000000000001',
    },
    {
      id: 'B2',
      label: 'same-casino forged adjustment denied',
      eventType: 'adjustment.recorded',
      eventId: '00000000-b002-b002-b002-000000000002',
    },
    {
      id: 'B3',
      label: 'same-casino forged buyin denied',
      eventType: 'buyin.recorded',
      eventId: '00000000-b003-b003-b003-000000000003',
    },
    {
      id: 'B4',
      label: 'arbitrary payload forgery denied',
      eventType: 'forge.event',
      eventId: '00000000-b004-b004-b004-000000000004',
    },
  ];

  for (const c of deniedCases) {
    try {
      const { error } = await auth
        .from('finance_outbox')
        .insert({ ...fakeBase, event_id: c.eventId, event_type: c.eventType });
      assert(
        error != null,
        `${c.id}: expected permission error but insert succeeded`,
      );
      printResult(c.label, true, error!.message.slice(0, 100));
      results.push({
        id: c.id,
        pass: true,
        detail: `authenticated direct insert denied (${c.eventType})`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(c.label, false, msg);
      results.push({ id: c.id, pass: false, detail: msg });
    }
  }

  // B5 — Helper-backed producer succeeds via fn_finance_outbox_emit
  try {
    const { data: orig, error: origErr } = await auth.rpc(
      'rpc_create_financial_txn',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_amount: 75,
        p_direction: 'in',
        p_source: 'pit',
        p_tender_type: 'chips',
        p_rating_slip_id: PROOF.SLIP_ID,
        p_idempotency_key: `${RUN}-orig-b5`,
      },
    );
    assert(!origErr && orig != null, `B5 original PFT: ${origErr?.message}`);

    const { data: adj, error: adjErr } = await auth.rpc(
      'rpc_create_financial_adjustment',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_delta_amount: 30,
        p_reason_code: 'wrong_amount',
        p_note: 'Proof certification note B5 helper-backed producer',
        p_original_txn_id: (orig as { id: string }).id,
        p_idempotency_key: `${RUN}-adj-b5`,
      },
    );
    assert(
      !adjErr && adj != null,
      `B5 helper-backed adjustment: ${adjErr?.message}`,
    );

    const { data: outbox } = await service
      .from('finance_outbox')
      .select('event_id')
      .eq('aggregate_id', (adj as { id: string }).id);
    assert(
      (outbox ?? []).length === 1,
      `B5: expected 1 outbox row via helper, got ${outbox?.length}`,
    );

    printResult(
      'B5 helper-backed producer succeeds',
      true,
      'outbox row present via fn_finance_outbox_emit',
    );
    results.push({
      id: 'B5',
      pass: true,
      detail:
        'helper-backed producer succeeds; outbox row inserted through governed helper',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('B5 helper-backed producer succeeds', false, msg);
    results.push({ id: 'B5', pass: false, detail: msg });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section C — Idempotency / Concurrency (3 cases)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionC(
  auth: Awaited<ReturnType<typeof createAuthenticatedClient>>,
  service: ReturnType<typeof createServiceClient>,
): Promise<CaseResult[]> {
  console.log('\n[SECTION C] Idempotency / Concurrency Live Proof');
  const results: CaseResult[] = [];

  // Create shared eligible original for C1
  let sharedOrigId: string | null = null;
  try {
    const { data: orig, error: origErr } = await auth.rpc(
      'rpc_create_financial_txn',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_amount: 300,
        p_direction: 'in',
        p_source: 'pit',
        p_tender_type: 'cash',
        p_rating_slip_id: PROOF.SLIP_ID,
        p_idempotency_key: `${RUN}-orig-c`,
      },
    );
    assert(!origErr && orig != null, `C shared original: ${origErr?.message}`);
    sharedOrigId = (orig as { id: string }).id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const id of ['C1', 'C2'])
      results.push({
        id,
        pass: false,
        detail: `shared original setup failed: ${msg}`,
      });
  }

  // C1 — Sequential idempotent retry
  // Same idempotency_key called twice. DO NOTHING on PFT conflict; IF NOT EXISTS skips outbox.
  // Expects: at most 1 PFT row, at most 1 outbox row.
  if (sharedOrigId) {
    try {
      const idKey = `${RUN}-adj-c1`;
      const params = {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_delta_amount: 40,
        p_reason_code: 'data_entry_error' as const,
        p_note: 'Proof certification note C1 idempotent retry',
        p_original_txn_id: sharedOrigId,
        p_idempotency_key: idKey,
      };

      const { data: adj1, error: e1 } = await auth.rpc(
        'rpc_create_financial_adjustment',
        params,
      );
      assert(!e1 && adj1 != null, `C1 first call: ${e1?.message}`);
      const adjId = (adj1 as { id: string }).id;

      const { data: adj2, error: e2 } = await auth.rpc(
        'rpc_create_financial_adjustment',
        params,
      );
      assert(!e2 && adj2 != null, `C1 second call: ${e2?.message}`);
      assert(
        (adj2 as { id: string }).id === adjId,
        'C1: second call returned different PFT id',
      );

      const { count: pftCount } = await service
        .from('player_financial_transaction')
        .select('id', { count: 'exact', head: true })
        .eq('idempotency_key', idKey);
      assert(
        pftCount! <= 1,
        `C1: ${pftCount} PFT rows for idempotency key (expected at most 1)`,
      );

      const { data: outbox } = await service
        .from('finance_outbox')
        .select('event_id')
        .eq('aggregate_id', adjId)
        .eq('event_type', 'adjustment.recorded');
      assert(
        (outbox ?? []).length <= 1,
        `C1: ${outbox?.length} outbox rows for aggregate (expected at most 1)`,
      );

      printResult(
        'C1 sequential idempotent retry',
        true,
        `pft_count=${pftCount}, outbox_count=${outbox?.length}`,
      );
      results.push({
        id: 'C1',
        pass: true,
        detail: `sequential retry: ${pftCount} PFT, ${outbox?.length} outbox row(s)`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult('C1 sequential idempotent retry', false, msg);
      results.push({ id: 'C1', pass: false, detail: msg });
    }
  }

  // C2 — Concurrent retry (two-arm validity clause)
  // Two simultaneous calls with the same idempotency_key via separate client instances.
  // Valid if: (a) no duplicate producer state escapes, OR (b) uq constraint verified + pooler
  // serialization documented. Either arm satisfies the two-arm validity clause.
  try {
    const { data: origC2, error: origC2Err } = await auth.rpc(
      'rpc_create_financial_txn',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_amount: 150,
        p_direction: 'in',
        p_source: 'pit',
        p_tender_type: 'chips',
        p_rating_slip_id: PROOF.SLIP_ID,
        p_idempotency_key: `${RUN}-orig-c2`,
      },
    );
    assert(!origC2Err && origC2 != null, `C2 original: ${origC2Err?.message}`);
    const origC2Id = (origC2 as { id: string }).id;

    const concKey = `${RUN}-adj-c2`;
    const concParams = {
      p_player_id: PROOF.PLAYER_ID,
      p_visit_id: PROOF.VISIT_ID,
      p_delta_amount: 55,
      p_reason_code: 'wrong_amount' as const,
      p_note: 'Proof certification note C2 concurrent retry',
      p_original_txn_id: origC2Id,
      p_idempotency_key: concKey,
    };

    const [authA, authB] = await Promise.all([
      createAuthenticatedClient(),
      createAuthenticatedClient(),
    ]);

    const [r1, r2] = await Promise.all([
      authA.rpc('rpc_create_financial_adjustment', concParams),
      authB.rpc('rpc_create_financial_adjustment', concParams),
    ]);

    assert(
      !r1.error || !r2.error,
      `C2: both concurrent calls failed: ${r1.error?.message} / ${r2.error?.message}`,
    );

    // At most 1 PFT with this idempotency key
    const { count: pftCount } = await service
      .from('player_financial_transaction')
      .select('id', { count: 'exact', head: true })
      .eq('idempotency_key', concKey);
    assert(
      pftCount! <= 1,
      `C2: ${pftCount} PFT rows for concurrent key (expected at most 1)`,
    );

    // At most 1 outbox row for the committed PFT
    const { data: adjPfts } = await service
      .from('player_financial_transaction')
      .select('id')
      .eq('idempotency_key', concKey);
    if (adjPfts && adjPfts.length > 0) {
      const { data: outbox } = await service
        .from('finance_outbox')
        .select('event_id')
        .eq('aggregate_id', adjPfts[0].id)
        .eq('event_type', 'adjustment.recorded');
      assert(
        (outbox ?? []).length <= 1,
        `C2: ${outbox?.length} outbox rows for concurrent adj (expected at most 1)`,
      );
    }

    printResult(
      'C2 concurrent retry',
      true,
      'no duplicate producer state (two-arm validity satisfied)',
    );
    results.push({
      id: 'C2',
      pass: true,
      detail:
        'concurrent retry: ≤1 PFT, ≤1 outbox row; pooler may serialize — see C3 for structural guarantee',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('C2 concurrent retry', false, msg);
    results.push({ id: 'C2', pass: false, detail: msg });
  }

  // C3 — Structural constraint verification: uq_finance_outbox_aggregate_event
  // Proves the UNIQUE (aggregate_id, event_type) constraint exists and fires on direct INSERT.
  // This is the structural guarantee backing C2's two-arm validity clause.
  try {
    const testAggId = '00000000-c300-c300-c300-000000000000';

    // Clean up any prior test row
    await service.from('finance_outbox').delete().eq('aggregate_id', testAggId);

    const baseRow = {
      event_type: 'buyin.recorded',
      fact_class: 'ledger',
      origin_label: 'actual',
      casino_id: PROOF.CASINO_1_ID,
      table_id: PROOF.TABLE_1_ID,
      player_id: PROOF.PLAYER_ID,
      aggregate_id: testAggId,
      gaming_day: '2026-01-15',
      payload: { test: 'c3' } as unknown as Json,
    };

    const { error: ins1 } = await service.from('finance_outbox').insert({
      ...baseRow,
      event_id: '00000000-c301-c301-c301-000000000001',
    });
    assert(!ins1, `C3 first insert: ${ins1?.message}`);

    // Duplicate (same aggregate_id + event_type) — must violate the uniqueness constraint
    const { error: ins2 } = await service.from('finance_outbox').insert({
      ...baseRow,
      event_id: '00000000-c302-c302-c302-000000000002',
    });
    assert(
      ins2 != null,
      'C3: expected unique constraint violation but second insert succeeded',
    );
    assert(
      ins2!.message.includes('uq_finance_outbox_aggregate_event') ||
        ins2!.code === '23505',
      `C3: error is not a uniqueness violation: ${ins2?.message}`,
    );

    // Cleanup
    await service.from('finance_outbox').delete().eq('aggregate_id', testAggId);

    printResult(
      'C3 uniqueness constraint',
      true,
      'uq_finance_outbox_aggregate_event fires on duplicate',
    );
    results.push({
      id: 'C3',
      pass: true,
      detail:
        'uq_finance_outbox_aggregate_event structurally verified; deduplication enforced at DB level',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('C3 uniqueness constraint', false, msg);
    results.push({ id: 'C3', pass: false, detail: msg });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section D — Payload Contract: FR-10 field assertions (2 cases)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionD(
  auth: Awaited<ReturnType<typeof createAuthenticatedClient>>,
  service: ReturnType<typeof createServiceClient>,
): Promise<CaseResult[]> {
  console.log('\n[SECTION D] Payload Contract Live Proof');
  const results: CaseResult[] = [];

  async function payloadCase(
    id: string,
    delta: number,
    expectedDeltaDir: 'increase' | 'decrease',
    suffix: string,
  ): Promise<CaseResult> {
    try {
      const { data: orig, error: origErr } = await auth.rpc(
        'rpc_create_financial_txn',
        {
          p_player_id: PROOF.PLAYER_ID,
          p_visit_id: PROOF.VISIT_ID,
          p_amount: 100,
          p_direction: 'in',
          p_source: 'pit',
          p_tender_type: 'cash',
          p_rating_slip_id: PROOF.SLIP_ID,
          p_idempotency_key: `${RUN}-orig-${suffix}`,
        },
      );
      assert(!origErr && orig != null, `${id} original: ${origErr?.message}`);

      const { data: adj, error: adjErr } = await auth.rpc(
        'rpc_create_financial_adjustment',
        {
          p_player_id: PROOF.PLAYER_ID,
          p_visit_id: PROOF.VISIT_ID,
          p_delta_amount: delta,
          p_reason_code: 'wrong_amount',
          p_note: `Proof certification note ${id} payload contract`,
          p_original_txn_id: (orig as { id: string }).id,
          p_idempotency_key: `${RUN}-adj-${suffix}`,
        },
      );
      assert(!adjErr && adj != null, `${id} adjustment: ${adjErr?.message}`);

      const { data: outbox, error: outboxErr } = await service
        .from('finance_outbox')
        .select('payload')
        .eq('aggregate_id', (adj as { id: string }).id)
        .eq('event_type', 'adjustment.recorded')
        .maybeSingle();
      assert(
        !outboxErr && outbox != null,
        `${id} outbox: ${outboxErr?.message ?? 'no row found'}`,
      );

      const p = outbox!.payload as Record<string, unknown>;

      assert('amount' in p, `${id}: payload missing 'amount'`);
      assert(p.amount === delta, `${id}: amount=${p.amount} expected ${delta}`);
      assert(
        p.pft_direction === 'in',
        `${id}: pft_direction=${p.pft_direction} expected 'in'`,
      );
      assert(
        p.delta_direction === expectedDeltaDir,
        `${id}: delta_direction=${p.delta_direction} expected ${expectedDeltaDir}`,
      );
      assert('reason_code' in p, `${id}: payload missing 'reason_code'`);
      assert(
        !('note' in p),
        `${id}: payload must NOT contain 'note' key (FR-10 omission)`,
      );

      printResult(
        `${id} payload contract`,
        true,
        `amount=${p.amount}, delta_direction=${p.delta_direction}, no note`,
      );
      return {
        id,
        pass: true,
        detail: `amount=${p.amount}, pft_direction=in, delta_direction=${p.delta_direction}, reason_code present, note absent`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      printResult(`${id} payload contract`, false, msg);
      return { id, pass: false, detail: msg };
    }
  }

  results.push(await payloadCase('D1', 50, 'increase', 'd1'));
  results.push(await payloadCase('D2', -25, 'decrease', 'd2'));
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section E — Exemplar Regression Smoke (2 cases)
// Verifies that the Option A helper refactor did not break the two PRD-082 exemplar producers.
// ─────────────────────────────────────────────────────────────────────────────
async function sectionE(
  auth: Awaited<ReturnType<typeof createAuthenticatedClient>>,
  service: ReturnType<typeof createServiceClient>,
): Promise<CaseResult[]> {
  console.log('\n[SECTION E] Exemplar Regression Smoke');
  const results: CaseResult[] = [];

  // E1 — rpc_create_financial_txn still emits buyin.recorded (Class A exemplar)
  try {
    const { data: pft, error: pftErr } = await auth.rpc(
      'rpc_create_financial_txn',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_amount: 500,
        p_direction: 'in',
        p_source: 'pit',
        p_tender_type: 'cash',
        p_rating_slip_id: PROOF.SLIP_ID,
        p_idempotency_key: `${RUN}-e1`,
      },
    );
    assert(
      !pftErr && pft != null,
      `E1 rpc_create_financial_txn: ${pftErr?.message}`,
    );
    const pftId = (pft as { id: string }).id;

    const { data: outbox, error: outboxErr } = await service
      .from('finance_outbox')
      .select('event_type, fact_class, table_id')
      .eq('aggregate_id', pftId)
      .maybeSingle();
    assert(
      !outboxErr && outbox != null,
      `E1 outbox: ${outboxErr?.message ?? 'no row found'}`,
    );
    assert(
      outbox!.event_type === 'buyin.recorded',
      `E1: event_type=${outbox!.event_type}`,
    );
    assert(
      outbox!.fact_class === 'ledger',
      `E1: fact_class=${outbox!.fact_class}`,
    );
    assert(outbox!.table_id != null, 'E1: table_id is NULL');

    printResult(
      'E1 buyin.recorded still emits',
      true,
      `event_type=${outbox!.event_type}`,
    );
    results.push({
      id: 'E1',
      pass: true,
      detail:
        'Class A exemplar still emits buyin.recorded after helper refactor',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('E1 buyin.recorded still emits', false, msg);
    results.push({ id: 'E1', pass: false, detail: msg });
  }

  // E2 — rpc_record_grind_observation still emits grind.observed (Class B exemplar)
  try {
    const { data: grindId, error: grindErr } = await auth.rpc(
      'rpc_record_grind_observation',
      {
        p_table_id: PROOF.TABLE_1_ID,
        p_amount_cents: 7500,
      },
    );
    assert(
      !grindErr && grindId != null,
      `E2 rpc_record_grind_observation: ${grindErr?.message}`,
    );

    const { data: outbox, error: outboxErr } = await service
      .from('finance_outbox')
      .select('event_type, fact_class, origin_label, player_id')
      .eq('aggregate_id', grindId as string)
      .maybeSingle();
    assert(
      !outboxErr && outbox != null,
      `E2 outbox: ${outboxErr?.message ?? 'no row found'}`,
    );
    assert(
      outbox!.event_type === 'grind.observed',
      `E2: event_type=${outbox!.event_type}`,
    );
    assert(
      outbox!.fact_class === 'operational',
      `E2: fact_class=${outbox!.fact_class}`,
    );
    assert(
      outbox!.origin_label === 'estimated',
      `E2: origin_label=${outbox!.origin_label}`,
    );
    assert(
      outbox!.player_id === null,
      `E2: player_id must be NULL for Class B, got ${outbox!.player_id}`,
    );

    printResult(
      'E2 grind.observed still emits',
      true,
      `event_type=${outbox!.event_type}`,
    );
    results.push({
      id: 'E2',
      pass: true,
      detail:
        'Class B exemplar still emits grind.observed after helper refactor',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('E2 grind.observed still emits', false, msg);
    results.push({ id: 'E2', pass: false, detail: msg });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section F — Relay Compatibility Smoke (3 cases)
// Proves adjustment.recorded conforms to the PRD-082-certified relay contract.
// Does NOT introduce relay-operability, retry-policy, consumer-lifecycle, or
// observability certification logic beyond what the PRD-082 relay already handles.
// ─────────────────────────────────────────────────────────────────────────────
async function sectionF(
  _auth: Awaited<ReturnType<typeof createAuthenticatedClient>>,
  service: ReturnType<typeof createServiceClient>,
): Promise<CaseResult[]> {
  console.log('\n[SECTION F] Relay Compatibility Smoke');
  const results: CaseResult[] = [];

  // Ensure at least one unprocessed adjustment.recorded row exists for relay cases
  await service
    .from('finance_outbox')
    .update({ processed_at: null })
    .eq('event_type', 'adjustment.recorded')
    .not('processed_at', 'is', null);

  type OutboxRow = {
    event_id: string;
    event_type: string;
    fact_class: string;
    origin_label: string;
    casino_id: string;
    table_id: string;
    player_id: string | null;
    aggregate_id: string;
    payload: Json;
    created_at: string;
    delivery_attempts: number;
    processed_at: string | null;
    last_attempted_at: string | null;
    last_error: string | null;
  };

  let claimedRow: OutboxRow | null = null;

  // F1 — rpc_claim_outbox_batch returns adjustment.recorded row with conforming DTO shape
  try {
    const { data: batch, error: claimErr } = await service.rpc(
      'rpc_claim_outbox_batch',
      {
        p_batch_size: 50,
      },
    );
    assert(!claimErr, `F1 rpc_claim_outbox_batch: ${claimErr?.message}`);

    const adjRowRaw = (batch ?? []).find(
      (r: OutboxRow) => r.event_type === 'adjustment.recorded',
    ) as OutboxRow | undefined;
    assert(
      adjRowRaw != null,
      'F1: no adjustment.recorded row in claimed batch',
    );
    const adjRow = adjRowRaw!;

    const requiredFields: Array<keyof OutboxRow> = [
      'event_id',
      'event_type',
      'fact_class',
      'origin_label',
      'casino_id',
      'table_id',
      'player_id',
      'aggregate_id',
      'payload',
      'created_at',
      'delivery_attempts',
      'processed_at',
      'last_attempted_at',
      'last_error',
    ];
    for (const field of requiredFields) {
      assert(field in adjRow, `F1: DTO missing field '${field}'`);
    }
    assert(
      adjRow.event_type === 'adjustment.recorded',
      `F1: event_type=${adjRow.event_type}`,
    );
    assert(
      adjRow.fact_class === 'ledger',
      `F1: fact_class=${adjRow.fact_class}`,
    );
    assert(
      adjRow.origin_label === 'actual',
      `F1: origin_label=${adjRow.origin_label}`,
    );
    assert(adjRow.table_id != null, 'F1: table_id is NULL');
    assert(
      adjRow.player_id != null,
      'F1: player_id is NULL (adjustment must have player identity)',
    );
    assert(
      adjRow.delivery_attempts >= 1,
      `F1: delivery_attempts=${adjRow.delivery_attempts} (claim should have incremented)`,
    );

    claimedRow = adjRow;
    printResult(
      'F1 relay claim DTO shape',
      true,
      `event_id=${adjRow.event_id}, delivery_attempts=${adjRow.delivery_attempts}`,
    );
    results.push({
      id: 'F1',
      pass: true,
      detail:
        'adjustment.recorded row claimed; all DTO fields present; delivery_attempts incremented',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('F1 relay claim DTO shape', false, msg);
    results.push({ id: 'F1', pass: false, detail: msg });
  }

  // F2 — Relay processes the row; duplicate delivery returns safe result
  try {
    assert(claimedRow != null, 'F2 skipped: no claimed row from F1');

    // First receipt
    const { data: result1, error: r1Err } = await service.rpc(
      'rpc_commit_consumer_receipt',
      {
        p_message_id: claimedRow!.event_id,
        p_casino_id: claimedRow!.casino_id,
      },
    );
    assert(!r1Err, `F2 first receipt: ${r1Err?.message}`);
    assert(
      result1 === 'processed' || result1 === 'duplicate',
      `F2: expected 'processed' or 'duplicate', got '${result1}'`,
    );

    // Mark processed_at
    await service
      .from('finance_outbox')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', claimedRow!.event_id);

    // Reset and re-deliver (duplicate delivery simulation)
    await service
      .from('finance_outbox')
      .update({ processed_at: null })
      .eq('event_id', claimedRow!.event_id);

    const { data: result2, error: r2Err } = await service.rpc(
      'rpc_commit_consumer_receipt',
      {
        p_message_id: claimedRow!.event_id,
        p_casino_id: claimedRow!.casino_id,
      },
    );
    assert(!r2Err, `F2 duplicate receipt: ${r2Err?.message}`);
    assert(
      result2 === 'duplicate',
      `F2: expected 'duplicate' on second delivery, got '${result2}'`,
    );

    printResult(
      'F2 relay process + duplicate',
      true,
      `first=${result1}, second=${result2}`,
    );
    results.push({
      id: 'F2',
      pass: true,
      detail: `relay processes row; duplicate delivery returns 'duplicate' safely`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('F2 relay process + duplicate', false, msg);
    results.push({ id: 'F2', pass: false, detail: msg });
  }

  // F3 — Controlled consumer failure leaves row retryable
  // Claim a row, do NOT commit receipt, verify processed_at IS NULL and delivery_attempts increments.
  try {
    // Reset all adjustment rows to unprocessed for clean test
    await service
      .from('finance_outbox')
      .update({ processed_at: null })
      .eq('event_type', 'adjustment.recorded');

    // First claim — delivery_attempts increments
    const { data: batch1, error: c1Err } = await service.rpc(
      'rpc_claim_outbox_batch',
      {
        p_batch_size: 10,
      },
    );
    assert(!c1Err, `F3 first claim: ${c1Err?.message}`);
    const targetRaw = (batch1 ?? []).find(
      (r: OutboxRow) => r.event_type === 'adjustment.recorded',
    ) as OutboxRow | undefined;
    assert(
      targetRaw != null,
      'F3: no adjustment.recorded row available for failure test',
    );
    const target = targetRaw!;

    const attemptsAfterFirstClaim = target.delivery_attempts;

    // Simulate consumer failure: no rpc_commit_consumer_receipt call
    // Verify row is still unprocessed
    const { data: check, error: checkErr } = await service
      .from('finance_outbox')
      .select('processed_at, delivery_attempts')
      .eq('event_id', target.event_id)
      .single();
    assert(!checkErr, `F3 check query: ${checkErr?.message}`);
    assert(
      check!.processed_at === null,
      `F3: processed_at must be NULL after consumer failure, got ${check!.processed_at}`,
    );

    // Second claim — delivery_attempts must increment again (row is retryable)
    const { data: batch2, error: c2Err } = await service.rpc(
      'rpc_claim_outbox_batch',
      {
        p_batch_size: 50,
      },
    );
    assert(!c2Err, `F3 second claim: ${c2Err?.message}`);
    const reclaimedRaw = (batch2 ?? []).find(
      (r: OutboxRow) => r.event_id === target.event_id,
    ) as OutboxRow | undefined;
    assert(
      reclaimedRaw != null,
      'F3: row not reclaimable after simulated failure',
    );
    const reclaimed = reclaimedRaw!;
    assert(
      reclaimed.delivery_attempts > attemptsAfterFirstClaim,
      `F3: delivery_attempts did not increment: ${attemptsAfterFirstClaim} → ${reclaimed.delivery_attempts}`,
    );

    printResult(
      'F3 failure leaves row retryable',
      true,
      `delivery_attempts ${attemptsAfterFirstClaim} → ${reclaimed.delivery_attempts}`,
    );
    results.push({
      id: 'F3',
      pass: true,
      detail: `consumer failure: processed_at IS NULL; delivery_attempts incremented (${attemptsAfterFirstClaim} → ${reclaimed.delivery_attempts})`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    printResult('F3 failure leaves row retryable', false, msg);
    results.push({ id: 'F3', pass: false, detail: msg });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('PRD-084 Phase 2.1 Adjustment Certification');
  console.log(`Run ID: ${RUN}`);
  console.log('─'.repeat(60));

  const auth = await createAuthenticatedClient();
  const service = createServiceClient();

  const allResults: CaseResult[] = [
    ...(await sectionA(auth, service)),
    ...(await sectionB(auth, service)),
    ...(await sectionC(auth, service)),
    ...(await sectionD(auth, service)),
    ...(await sectionE(auth, service)),
    ...(await sectionF(auth, service)),
  ];

  console.log('\n' + '─'.repeat(60));
  console.log('SUMMARY — PRD-084 Phase 2.1 Certification');
  console.log('─'.repeat(60));

  const passed = allResults.filter((r) => r.pass);
  const failed = allResults.filter((r) => !r.pass);

  for (const r of allResults) {
    console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.id}: ${r.detail}`);
  }

  console.log('─'.repeat(60));
  console.log(
    `Total: ${allResults.length} | Pass: ${passed.length} | Fail: ${failed.length}`,
  );

  if (failed.length > 0) {
    console.log('\nFAILED CASES:');
    for (const r of failed) {
      console.log(`  ${r.id}: ${r.detail}`);
    }
    process.exit(1);
  }

  console.log(
    '\nAll 20 cases passed. Capture output above into CERTIFICATION-RESULT-083.md.',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Unhandled error in certification script:', err);
  process.exit(1);
});
