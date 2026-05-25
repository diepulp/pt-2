// scripts/outbox-proof/i2-durability.ts
// PRD-082 I2 Durability: claim without commit → row reclaimable on retry.
// Key evidence: delivery_attempts = 2 on second claim; processed_at IS NULL until commit.

import dotenv from 'dotenv';
import {
  createAuthenticatedClient,
  createServiceClient,
  assert,
  printResult,
  PROOF,
} from './helpers';

dotenv.config({ path: '.env.local' });

export async function runI2(): Promise<{ pass: boolean; detail: string }> {
  console.log('\n[I2 DURABILITY] Starting...');
  try {
    const auth = await createAuthenticatedClient();
    const service = createServiceClient();

    // Pre-condition: need at least one unprocessed finance_outbox row.
    // Create a fresh one via Class B producer (won't conflict with I1 slip rows).
    const { data: grindId, error: grindErr } = await auth.rpc(
      'rpc_record_grind_observation',
      {
        p_table_id: PROOF.TABLE_1_ID,
        p_amount_cents: 1000,
      },
    );
    assert(
      !grindErr,
      `Pre-condition producer call failed: ${grindErr?.message}`,
    );

    // Get the outbox event_id for the row we just created
    const { data: outboxRows, error: outboxErr } = await service
      .from('finance_outbox')
      .select('event_id, casino_id, delivery_attempts')
      .eq('aggregate_id', grindId as string)
      .is('processed_at', null);
    assert(
      !outboxErr && (outboxRows ?? []).length > 0,
      'No unprocessed outbox row found for pre-condition',
    );

    const target = outboxRows![0];
    const eventId = target.event_id;
    const casinoId = target.casino_id;

    console.log(`[I2] Target event_id: ${eventId}`);
    console.log(`[I2] Initial delivery_attempts: ${target.delivery_attempts}`);

    // First claim — increments delivery_attempts, sets last_attempted_at
    const { data: claim1, error: claim1Err } = await service.rpc(
      'rpc_claim_outbox_batch',
      { p_batch_size: 50 },
    );
    assert(!claim1Err, `First claim failed: ${claim1Err?.message}`);

    const rows1 = (claim1 ?? []) as {
      event_id: string;
      delivery_attempts: number;
      processed_at: string | null;
    }[];
    const claimedRow1 = rows1.find((r) => r.event_id === eventId);
    assert(claimedRow1 != null, `Target row not returned in first claim batch`);
    assert(
      claimedRow1!.delivery_attempts === 1,
      `Expected delivery_attempts=1 after first claim, got ${claimedRow1!.delivery_attempts}`,
    );

    // Simulate relay crash — do NOT call rpc_commit_consumer_receipt.
    // The FOR UPDATE lock releases when the claim transaction committed.
    // processed_at remains NULL.

    const { data: afterCrash } = await service
      .from('finance_outbox')
      .select('processed_at, delivery_attempts')
      .eq('event_id', eventId)
      .single();
    assert(
      afterCrash?.processed_at === null,
      `Expected processed_at=NULL after simulated crash, got ${afterCrash?.processed_at}`,
    );
    assert(
      afterCrash?.delivery_attempts === 1,
      `Expected delivery_attempts=1 after crash, got ${afterCrash?.delivery_attempts}`,
    );
    printResult(
      'I2 post-crash state',
      true,
      'processed_at=NULL, delivery_attempts=1',
    );

    // Second claim — row is reclaimable because processed_at IS NULL and lock was released
    const { data: claim2, error: claim2Err } = await service.rpc(
      'rpc_claim_outbox_batch',
      { p_batch_size: 50 },
    );
    assert(!claim2Err, `Second claim failed: ${claim2Err?.message}`);

    const rows2 = (claim2 ?? []) as {
      event_id: string;
      delivery_attempts: number;
      processed_at: string | null;
    }[];
    const claimedRow2 = rows2.find((r) => r.event_id === eventId);
    assert(
      claimedRow2 != null,
      `Target row NOT returned in second claim — reclaimability BROKEN`,
    );
    assert(
      claimedRow2!.delivery_attempts === 2,
      `Expected delivery_attempts=2 on retry, got ${claimedRow2!.delivery_attempts}`,
    );
    assert(
      claimedRow2!.processed_at === null,
      `processed_at must still be NULL before commit`,
    );
    printResult(
      'I2 reclaimability',
      true,
      `delivery_attempts=2 on retry, row reclaimable`,
    );

    // Now commit receipt
    const { data: receiptResult, error: receiptErr } = await service.rpc(
      'rpc_commit_consumer_receipt',
      {
        p_message_id: eventId,
        p_casino_id: casinoId,
      },
    );
    assert(
      !receiptErr,
      `rpc_commit_consumer_receipt failed: ${receiptErr?.message}`,
    );
    assert(
      receiptResult === 'processed',
      `Expected 'processed', got '${receiptResult}'`,
    );

    // Update processed_at (relay route responsibility)
    await service
      .from('finance_outbox')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', eventId);

    const { data: final } = await service
      .from('finance_outbox')
      .select('processed_at')
      .eq('event_id', eventId)
      .single();
    assert(
      final?.processed_at != null,
      `processed_at should be set after commit, got null`,
    );
    printResult(
      'I2 commit after retry',
      true,
      'processed_at set after successful retry commit',
    );

    printResult(
      'I2 Durability',
      true,
      'delivery_attempts=2 proven; reclaimability inherent via processed_at IS NULL',
    );
    return {
      pass: true,
      detail:
        'I2 Durability: reclaimability proven — delivery_attempts=2 on retry, processed_at IS NULL until commit',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printResult('I2 Durability', false, msg);
    return { pass: false, detail: msg };
  }
}

if (process.argv[1]?.endsWith('i2-durability.ts')) {
  runI2().then((r) => process.exit(r.pass ? 0 : 1));
}
