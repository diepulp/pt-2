// scripts/outbox-proof/i1-atomicity.ts
// PRD-082 I1 Atomicity: finance_outbox + primary table INSERT both commit or both roll back.

import dotenv from 'dotenv';
import {
  createAuthenticatedClient,
  createServiceClient,
  assert,
  printResult,
  PROOF,
} from './helpers';

dotenv.config({ path: '.env.local' });

export async function runI1(): Promise<{ pass: boolean; detail: string }> {
  console.log('\n[I1 ATOMICITY] Starting...');
  try {
    const auth = await createAuthenticatedClient();
    const service = createServiceClient();

    // ── Part A: Class A success ──────────────────────────────────────────────
    console.log(
      '[I1-A] Class A success: rpc_create_financial_txn with valid slip',
    );
    const { data: pft, error: pftErr } = await auth.rpc(
      'rpc_create_financial_txn',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_amount: 100,
        p_direction: 'in',
        p_source: 'pit',
        p_tender_type: 'cash',
        p_rating_slip_id: PROOF.SLIP_ID,
      },
    );
    assert(
      !pftErr && pft != null,
      `Class A PFT call failed: ${pftErr?.message}`,
    );
    const pftRow = pft as { id: string };
    assert(!!pftRow.id, 'PFT row has no id');

    const { data: outboxA, error: outboxAErr } = await service
      .from('finance_outbox')
      .select('*')
      .eq('aggregate_id', pftRow.id);
    assert(!outboxAErr, `finance_outbox query failed: ${outboxAErr?.message}`);
    assert(
      outboxA!.length === 1,
      `Expected 1 outbox row, got ${outboxA!.length}`,
    );

    const oa = outboxA![0];
    assert(
      oa.event_type === 'buyin.recorded',
      `event_type mismatch: ${oa.event_type}`,
    );
    assert(oa.fact_class === 'ledger', `fact_class mismatch: ${oa.fact_class}`);
    assert(
      oa.origin_label === 'actual',
      `origin_label mismatch: ${oa.origin_label}`,
    );
    assert(
      oa.casino_id === PROOF.CASINO_1_ID,
      `casino_id mismatch: ${oa.casino_id}`,
    );
    assert(
      oa.table_id === PROOF.TABLE_1_ID,
      `table_id mismatch: ${oa.table_id}`,
    );
    assert(
      oa.player_id === PROOF.PLAYER_ID,
      `player_id mismatch: ${oa.player_id}`,
    );
    assert(
      'amount' in (oa.payload as Record<string, unknown>),
      'payload missing amount key',
    );
    printResult('I1-A Class A success', true);

    // ── Part B: Class A failure injection (F14) ──────────────────────────────
    console.log(
      '[I1-B] Class A failure injection: nonexistent rating_slip_id (F14 path)',
    );
    const badSlipId = '99999999-9999-9999-9999-999999999999';
    const beforeTs = new Date().toISOString();
    const { error: f14Err } = await auth.rpc('rpc_create_financial_txn', {
      p_player_id: PROOF.PLAYER_ID,
      p_visit_id: PROOF.VISIT_ID,
      p_amount: 100,
      p_direction: 'in',
      p_source: 'pit',
      p_tender_type: 'cash',
      p_rating_slip_id: badSlipId,
    });
    assert(f14Err != null, 'Expected F14 error but got none');

    // Verify no surprise outbox rows were written after the failed call
    const { data: surpriseRows } = await service
      .from('finance_outbox')
      .select('event_id')
      .gt('created_at', beforeTs)
      .eq('casino_id', PROOF.CASINO_1_ID);
    // Any row here would indicate a partial write — the F14 rejection must roll back both writes
    // A rating_slip not found exception fires after PFT INSERT; both must roll back atomically.
    // We can't query by PFT id (it was rolled back), so we check no new rows appeared.
    assert(
      (surpriseRows ?? []).length === 0,
      `F14: unexpected outbox rows after rollback: ${surpriseRows?.length}`,
    );
    printResult('I1-B Class A F14 rollback', true);

    // ── Part C: Class B success ──────────────────────────────────────────────
    console.log('[I1-C] Class B success: rpc_record_grind_observation');
    const { data: grindId, error: grindErr } = await auth.rpc(
      'rpc_record_grind_observation',
      {
        p_table_id: PROOF.TABLE_1_ID,
        p_amount_cents: 5000,
      },
    );
    assert(
      !grindErr && grindId != null,
      `rpc_record_grind_observation failed: ${grindErr?.message}`,
    );

    const { data: outboxB, error: outboxBErr } = await service
      .from('finance_outbox')
      .select('*')
      .eq('aggregate_id', grindId as string);
    assert(!outboxBErr, `finance_outbox query failed: ${outboxBErr?.message}`);
    assert(
      outboxB!.length === 1,
      `Expected 1 outbox row for grind, got ${outboxB!.length}`,
    );

    const ob = outboxB![0];
    assert(
      ob.event_type === 'grind.observed',
      `event_type mismatch: ${ob.event_type}`,
    );
    assert(
      ob.fact_class === 'operational',
      `fact_class mismatch: ${ob.fact_class}`,
    );
    assert(
      ob.origin_label === 'estimated',
      `origin_label mismatch: ${ob.origin_label}`,
    );
    assert(
      ob.casino_id === PROOF.CASINO_1_ID,
      `casino_id mismatch: ${ob.casino_id}`,
    );
    assert(
      ob.table_id === PROOF.TABLE_1_ID,
      `table_id mismatch: ${ob.table_id}`,
    );
    assert(
      ob.player_id === null,
      `player_id must be NULL for Class B: ${ob.player_id}`,
    );
    assert(
      'amount_cents' in (ob.payload as Record<string, unknown>),
      'payload missing amount_cents key',
    );
    printResult('I1-C Class B success', true);

    // ── Part D: Class B failure injection (cross-casino table) ───────────────
    console.log(
      '[I1-D] Class B failure injection: cross-casino table (TABLE_2 belongs to CASINO_2)',
    );
    const beforeDTs = new Date().toISOString();
    const { error: crossErr } = await auth.rpc('rpc_record_grind_observation', {
      p_table_id: PROOF.TABLE_2_ID,
      p_amount_cents: 5000,
    });
    assert(crossErr != null, 'Expected cross-casino error but got none');

    const { data: crossRows } = await service
      .from('finance_outbox')
      .select('event_id')
      .eq('table_id', PROOF.TABLE_2_ID)
      .gt('created_at', beforeDTs);
    assert(
      (crossRows ?? []).length === 0,
      `Cross-casino: unexpected outbox rows for TABLE_2: ${crossRows?.length}`,
    );
    printResult('I1-D Class B cross-casino rollback', true);

    printResult('I1 Atomicity', true, 'all 4 parts passed');
    return {
      pass: true,
      detail:
        'I1 Atomicity: Class A/B success + F14/cross-casino rollback proven',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printResult('I1 Atomicity', false, msg);
    return { pass: false, detail: msg };
  }
}

if (process.argv[1]?.endsWith('i1-atomicity.ts')) {
  runI1().then((r) => process.exit(r.pass ? 0 : 1));
}
