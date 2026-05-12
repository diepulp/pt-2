// scripts/outbox-proof/i5-cashout-non-emission.ts
// PRD-082 I5: Cage cashout (direction='out') emits no finance_outbox row.
// Reserved event 'cashout.recorded' must not appear in Wave 2.

import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient, assert, printResult, PROOF } from './helpers';
import type { Database } from '../../types/database.types';

dotenv.config({ path: '.env.local' });

const CASHIER_EMAIL = 'cashier-proof@outbox-proof.local';
const CASHIER_PASSWORD = 'ProofHarness2026!';

async function ensureCashierStaff(
  service: SupabaseClient<Database>,
): Promise<string> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!;
  const svcKey = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
  const adminSb = createClient<Database>(url, svcKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let authUserId: string;

  const { data: created, error: createErr } =
    await adminSb.auth.admin.createUser({
      email: CASHIER_EMAIL,
      password: CASHIER_PASSWORD,
      email_confirm: true,
    });

  if (createErr) {
    const alreadyExists =
      createErr.message.toLowerCase().includes('already been registered') ||
      createErr.message.toLowerCase().includes('already exists') ||
      (createErr as { status?: number }).status === 422;
    if (!alreadyExists)
      throw new Error(`cashier createUser failed: ${createErr.message}`);

    const { data: listData, error: listErr } =
      await adminSb.auth.admin.listUsers();
    if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);
    const existing = listData.users.find((u) => u.email === CASHIER_EMAIL);
    if (!existing)
      throw new Error('Cashier auth user not found after conflict');
    authUserId = existing.id;
  } else {
    authUserId = created.user.id;
  }

  const CASHIER_STAFF_ID = '00000000-0000-0000-0000-000000000020';
  const { error: staffErr } = await service.from('staff').insert({
    id: CASHIER_STAFF_ID,
    casino_id: PROOF.CASINO_1_ID,
    user_id: authUserId,
    email: CASHIER_EMAIL,
    first_name: 'Cashier',
    last_name: 'Proof',
    role: 'cashier',
    status: 'active',
  });
  if (staffErr && staffErr.code !== '23505') {
    throw new Error(`cashier staff insert failed: ${staffErr.message}`);
  }

  return authUserId;
}

export async function runI5(): Promise<{ pass: boolean; detail: string }> {
  console.log('\n[I5 CASHOUT NON-EMISSION] Starting...');
  try {
    const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!;
    const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!;
    const service = createServiceClient();

    await ensureCashierStaff(service);

    // Sign in as cashier
    const cashierClient = createClient<Database>(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInErr } = await cashierClient.auth.signInWithPassword({
      email: CASHIER_EMAIL,
      password: CASHIER_PASSWORD,
    });
    assert(!signInErr, `Cashier sign-in failed: ${signInErr?.message}`);

    // Record baseline outbox count
    const { count: beforeCount, error: beforeErr } = await service
      .from('finance_outbox')
      .select('*', { count: 'exact', head: true });
    assert(!beforeErr, `baseline count failed: ${beforeErr?.message}`);

    // Call rpc_create_financial_txn as cashier, direction='out', no rating_slip_id
    const { data: pft, error: pftErr } = await cashierClient.rpc(
      'rpc_create_financial_txn',
      {
        p_player_id: PROOF.PLAYER_ID,
        p_visit_id: PROOF.VISIT_ID,
        p_amount: 50,
        p_direction: 'out',
        p_source: 'cage',
        p_tender_type: 'cash',
        // p_rating_slip_id intentionally omitted (NULL) — cage cashout, no slip
      },
    );
    assert(
      !pftErr && pft != null,
      `Cashier cashout RPC failed: ${pftErr?.message}`,
    );
    const pftRow = pft as { id: string };
    assert(!!pftRow.id, 'Cashout PFT row has no id');
    console.log(`[I5] Cashout PFT created: id=${pftRow.id}`);

    // Verify zero outbox rows for this PFT
    const { data: outboxForPft, error: outboxErr } = await service
      .from('finance_outbox')
      .select('event_id')
      .eq('aggregate_id', pftRow.id);
    assert(!outboxErr, `outbox query failed: ${outboxErr?.message}`);
    assert(
      outboxForPft!.length === 0,
      `Expected 0 outbox rows for cashout, got ${outboxForPft!.length}`,
    );

    // Verify total outbox count unchanged (no surprise rows)
    const { count: afterCount } = await service
      .from('finance_outbox')
      .select('*', { count: 'exact', head: true });
    assert(
      afterCount === beforeCount,
      `Total outbox count changed: before=${beforeCount}, after=${afterCount}`,
    );

    printResult(
      'I5 Cashout Non-Emission',
      true,
      `cashout PFT created, 0 finance_outbox rows emitted`,
    );
    return {
      pass: true,
      detail:
        'I5: cage cashout (direction=out) creates PFT but emits no finance_outbox row',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printResult('I5 Cashout Non-Emission', false, msg);
    return { pass: false, detail: msg };
  }
}

if (process.argv[1]?.endsWith('i5-cashout-non-emission.ts')) {
  runI5().then((r) => process.exit(r.pass ? 0 : 1));
}
