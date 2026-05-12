// scripts/outbox-proof/i4-replayability.ts
// PRD-082 I4 Replayability: live fingerprint === replay fingerprint.
// Fingerprint: md5 of (event_id|event_type|aggregate_id) ordered by event_id. Excludes consumed_at.

import dotenv from 'dotenv';
import crypto from 'crypto';
import {
  createAuthenticatedClient,
  createServiceClient,
  runRelayBatch,
  assert,
  printResult,
  PROOF,
} from './helpers';

dotenv.config({ path: '.env.local' });

function computeFingerprint(
  rows: { event_id: string; event_type: string; aggregate_id: string }[],
): string {
  const sorted = [...rows].sort((a, b) => a.event_id.localeCompare(b.event_id));
  const str = sorted
    .map((r) => `${r.event_id}|${r.event_type}|${r.aggregate_id}`)
    .join(',');
  return crypto.createHash('md5').update(str).digest('hex');
}

export async function runI4(): Promise<{ pass: boolean; detail: string }> {
  console.log('\n[I4 REPLAYABILITY] Starting...');
  try {
    const auth = await createAuthenticatedClient();
    const service = createServiceClient();

    // Clean slate
    await service.from('outbox_integration_proof_state').delete().gte('seq', 0);
    await service
      .from('processed_messages')
      .delete()
      .gte('processed_at', '1970-01-01');
    await service
      .from('finance_outbox')
      .update({ processed_at: null })
      .not('processed_at', 'is', null);

    // Generate >= 3 outbox rows (mix of Class A and Class B)
    console.log('[I4] Generating proof outbox rows...');

    // Class B x2
    await auth.rpc('rpc_record_grind_observation', {
      p_table_id: PROOF.TABLE_1_ID,
      p_amount_cents: 1100,
    });
    await auth.rpc('rpc_record_grind_observation', {
      p_table_id: PROOF.TABLE_1_ID,
      p_amount_cents: 2200,
    });

    // Class A x1 (new slip required — use the seeded slip; idempotency key keeps PFT unique)
    await auth.rpc('rpc_create_financial_txn', {
      p_player_id: PROOF.PLAYER_ID,
      p_visit_id: PROOF.VISIT_ID,
      p_amount: 300,
      p_direction: 'in',
      p_source: 'pit',
      p_tender_type: 'cash',
      p_rating_slip_id: PROOF.SLIP_ID,
      p_idempotency_key: `i4-proof-${Date.now()}`,
    });

    // Verify we have unprocessed rows
    const { data: unprocessed } = await service
      .from('finance_outbox')
      .select('event_id')
      .is('processed_at', null);
    assert(
      (unprocessed ?? []).length >= 3,
      `Expected >= 3 unprocessed rows, got ${unprocessed?.length}`,
    );
    console.log(`[I4] Unprocessed rows to relay: ${unprocessed!.length}`);

    // Run relay until backlog = 0
    let totalProcessed = 0;
    for (let i = 0; i < 10; i++) {
      const result = await runRelayBatch(service, 50);
      totalProcessed += result.processed + result.duplicate;
      const { count } = await service
        .from('finance_outbox')
        .select('*', { count: 'exact', head: true })
        .is('processed_at', null);
      if ((count ?? 0) === 0) break;
    }
    console.log(`[I4] Relay complete — totalProcessed: ${totalProcessed}`);

    // Compute live fingerprint from proof-state
    const { data: liveRows, error: liveErr } = await service
      .from('outbox_integration_proof_state')
      .select('event_id, event_type, aggregate_id')
      .order('event_id');
    assert(
      !liveErr && (liveRows ?? []).length >= 3,
      `Expected >= 3 proof-state rows, got ${liveRows?.length}: ${liveErr?.message}`,
    );

    const liveFingerprint = computeFingerprint(liveRows!);
    assert(!!liveFingerprint, 'Live fingerprint is empty');
    console.log(
      `[I4] Live fingerprint: ${liveFingerprint} (${liveRows!.length} rows)`,
    );
    printResult('I4 live fingerprint', true, liveFingerprint);

    // Prepare replay: truncate processed_messages + proof_state; reset processed_at
    await service.from('outbox_integration_proof_state').delete().gte('seq', 0);
    await service
      .from('processed_messages')
      .delete()
      .gte('processed_at', '1970-01-01');
    await service
      .from('finance_outbox')
      .update({ processed_at: null })
      .not('processed_at', 'is', null);

    // Replay
    console.log('[I4] Running replay...');
    for (let i = 0; i < 10; i++) {
      await runRelayBatch(service, 50);
      const { count } = await service
        .from('finance_outbox')
        .select('*', { count: 'exact', head: true })
        .is('processed_at', null);
      if ((count ?? 0) === 0) break;
    }

    // Compute replay fingerprint
    const { data: replayRows, error: replayErr } = await service
      .from('outbox_integration_proof_state')
      .select('event_id, event_type, aggregate_id')
      .order('event_id');
    assert(
      !replayErr && (replayRows ?? []).length >= 3,
      `Replay: expected >= 3 proof-state rows, got ${replayRows?.length}: ${replayErr?.message}`,
    );

    const replayFingerprint = computeFingerprint(replayRows!);
    console.log(
      `[I4] Replay fingerprint: ${replayFingerprint} (${replayRows!.length} rows)`,
    );

    assert(
      liveFingerprint === replayFingerprint,
      `Fingerprint mismatch!\n  live:   ${liveFingerprint}\n  replay: ${replayFingerprint}`,
    );
    printResult(
      'I4 Replayability',
      true,
      `live === replay: ${liveFingerprint}`,
    );
    return {
      pass: true,
      detail: `I4 Replayability: live_fingerprint === replay_fingerprint (${liveFingerprint})`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printResult('I4 Replayability', false, msg);
    return { pass: false, detail: msg };
  }
}

if (process.argv[1]?.endsWith('i4-replayability.ts')) {
  runI4().then((r) => process.exit(r.pass ? 0 : 1));
}
