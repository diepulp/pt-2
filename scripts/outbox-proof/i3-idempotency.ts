// scripts/outbox-proof/i3-idempotency.ts
// PRD-082 I3 Idempotency: duplicate delivery returns 'duplicate'; proof-state written by SQL only.

import dotenv from 'dotenv';
import {
  createAuthenticatedClient,
  createServiceClient,
  runRelayBatch,
  assert,
  printResult,
  PROOF,
} from './helpers';

dotenv.config({ path: '.env.local' });

export async function runI3(): Promise<{ pass: boolean; detail: string }> {
  console.log('\n[I3 IDEMPOTENCY] Starting...');
  try {
    const auth = await createAuthenticatedClient();
    const service = createServiceClient();

    // Clean slate — truncate harness tables so proof-state is attributable to this run only.
    // Proof scripts may TRUNCATE and SELECT but must NEVER INSERT into outbox_integration_proof_state.
    const { error: truncProof } = await service
      .rpc('rpc_claim_outbox_batch', { p_batch_size: 1 })
      .then(async () => {
        // Supabase JS can't run raw SQL truncate. Use postgrest delete workaround for service_role:
        const r1 = await service
          .from('outbox_integration_proof_state')
          .delete()
          .gte('seq', 0);
        const r2 = await service
          .from('processed_messages')
          .delete()
          .gte('processed_at', '1970-01-01');
        return { error: r1.error ?? r2.error ?? null };
      });
    if (truncProof)
      throw new Error(`Pre-condition truncate failed: ${truncProof.message}`);

    // Also clear processed_at on any existing outbox rows so relay can re-process
    await service
      .from('finance_outbox')
      .update({ processed_at: null })
      .not('processed_at', 'is', null);

    // Create a fresh outbox row via Class A producer
    const { data: pft, error: pftErr } = await auth.rpc(
      'rpc_create_financial_txn',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_amount: 200,
        p_direction: 'in',
        p_source: 'pit',
        p_tender_type: 'cash',
        p_rating_slip_id: PROOF.SLIP_ID,
      },
    );
    assert(!pftErr && pft != null, `Producer call failed: ${pftErr?.message}`);

    const pftRow = pft as { id: string };
    const { data: outboxRows } = await service
      .from('finance_outbox')
      .select('event_id, casino_id, event_type, fact_class')
      .eq('aggregate_id', pftRow.id)
      .is('processed_at', null);
    assert(
      (outboxRows ?? []).length === 1,
      `Expected 1 unprocessed outbox row, got ${outboxRows?.length}`,
    );

    const targetEventId = outboxRows![0].event_id;
    const targetCasinoId = outboxRows![0].casino_id;
    const targetEventType = outboxRows![0].event_type;
    const targetFactClass = outboxRows![0].fact_class;
    console.log(`[I3] Target event_id: ${targetEventId}`);

    // First delivery
    const relay1 = await runRelayBatch(service, 50);
    assert(
      relay1.processed >= 1,
      `Expected at least 1 processed, got ${JSON.stringify(relay1)}`,
    );
    printResult('I3 first delivery', true, `processed=${relay1.processed}`);

    // Verify proof-state row was written by SQL (not by TypeScript)
    const { data: proofRows1, error: proofErr1 } = await service
      .from('outbox_integration_proof_state')
      .select('*')
      .eq('event_id', targetEventId);
    assert(!proofErr1, `proof-state query failed: ${proofErr1?.message}`);
    assert(
      proofRows1!.length === 1,
      `Expected exactly 1 proof-state row, got ${proofRows1!.length} (DEC-003: must be written by SQL)`,
    );

    const ps = proofRows1![0];
    assert(
      ps.event_type === targetEventType,
      `proof-state event_type mismatch: ${ps.event_type}`,
    );
    assert(
      ps.fact_class === targetFactClass,
      `proof-state fact_class mismatch: ${ps.fact_class}`,
    );
    assert(
      ps.casino_id === targetCasinoId,
      `proof-state casino_id mismatch: ${ps.casino_id}`,
    );
    printResult(
      'I3 proof-state SQL boundary',
      true,
      'exactly 1 proof-state row written by rpc_commit_consumer_receipt SQL',
    );

    // Reset processed_at to simulate re-delivery (relay receives duplicate)
    const { error: resetErr } = await service
      .from('finance_outbox')
      .update({ processed_at: null })
      .eq('event_id', targetEventId);
    assert(!resetErr, `Reset processed_at failed: ${resetErr?.message}`);

    // Second delivery — must return 'duplicate'
    const { data: claim2 } = await service.rpc('rpc_claim_outbox_batch', {
      p_batch_size: 50,
    });
    const rows2 = (claim2 ?? []) as { event_id: string; casino_id: string }[];
    const dup = rows2.find((r) => r.event_id === targetEventId);
    assert(
      dup != null,
      'Target row not reclaimable for duplicate delivery test',
    );

    const { data: receiptResult2, error: receiptErr2 } = await service.rpc(
      'rpc_commit_consumer_receipt',
      {
        p_message_id: targetEventId,
        p_casino_id: targetCasinoId,
      },
    );
    assert(
      !receiptErr2,
      `rpc_commit_consumer_receipt (dup) failed: ${receiptErr2?.message}`,
    );
    assert(
      receiptResult2 === 'duplicate',
      `Expected 'duplicate', got '${receiptResult2}'`,
    );
    printResult(
      'I3 duplicate delivery',
      true,
      `rpc_commit_consumer_receipt returned 'duplicate'`,
    );

    // Verify still exactly 1 proof-state row (ON CONFLICT DO NOTHING prevented duplicate)
    const { data: proofRows2 } = await service
      .from('outbox_integration_proof_state')
      .select('event_id')
      .eq('event_id', targetEventId);
    assert(
      proofRows2!.length === 1,
      `Expected still 1 proof-state row after duplicate delivery, got ${proofRows2!.length}`,
    );
    printResult(
      'I3 proof-state idempotent',
      true,
      'still exactly 1 proof-state row after duplicate delivery',
    );

    printResult(
      'I3 Idempotency',
      true,
      "duplicate → 'duplicate'; single proof-state row written by SQL only",
    );
    return {
      pass: true,
      detail:
        "I3 Idempotency: second delivery returns 'duplicate'; proof-state has exactly 1 row (SQL boundary)",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printResult('I3 Idempotency', false, msg);
    return { pass: false, detail: msg };
  }
}

if (process.argv[1]?.endsWith('i3-idempotency.ts')) {
  runI3().then((r) => process.exit(r.pass ? 0 : 1));
}
