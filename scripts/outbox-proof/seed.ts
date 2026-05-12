// scripts/outbox-proof/seed.ts
// PRD-082 Integration Proof Harness — Data Seed
// Creates FK-valid data anchors with fixed UUIDs for deterministic proof execution.
// Idempotent: safe to re-run. Uses INSERT ON CONFLICT DO NOTHING semantics.
// NOT for shared preview/staging/production environments.

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';

dotenv.config({ path: '.env.local' });

// Fixed UUIDs — all proof scripts in scripts/outbox-proof/ use these constants.
export const PROOF = {
  COMPANY_ID: '00000000-0000-0000-0000-000000000009',
  CASINO_1_ID: '00000000-0000-0000-0000-000000000001', // proof casino (Class A + B producer calls)
  CASINO_2_ID: '00000000-0000-0000-0000-000000000002', // cross-casino negative proof (Class B)
  TABLE_1_ID: '00000000-0000-0000-0000-000000000003', // belongs to casino 1
  TABLE_2_ID: '00000000-0000-0000-0000-000000000004', // belongs to casino 2 (cross-casino test)
  PLAYER_ID: '00000000-0000-0000-0000-000000000005',
  VISIT_ID: '00000000-0000-0000-0000-000000000006',
  SLIP_ID: '00000000-0000-0000-0000-000000000007',
  STAFF_ID: '00000000-0000-0000-0000-000000000008',
  VISIT_GROUP_ID: '00000000-0000-0000-0000-000000000010',
  STAFF_EMAIL: 'proof-staff@outbox-proof.local',
  STAFF_PASSWORD: 'ProofHarness2026!',
} as const;

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val)
    throw new Error(`Missing required env var: ${key}. Check .env.local.`);
  return val;
}

function isUniqueViolation(err: { code?: string; message?: string }): boolean {
  return err.code === '23505';
}

async function seed(): Promise<void> {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  // service_role client — used for all DB inserts (bypasses RLS)
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // anon client — used only for validating auth sign-in at the end
  const anon = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('[seed] Starting PRD-082 proof harness seed...');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Company (required FK for casino.company_id)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const { error } = await admin
      .from('company')
      .insert({ id: PROOF.COMPANY_ID, name: 'Proof Harness Company' });
    if (error && !isUniqueViolation(error)) {
      throw new Error(`company insert failed: ${error.message}`);
    }
    console.log(
      error
        ? '[seed] company: already exists (skipped)'
        : '[seed] company: created',
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Two casinos
  // ─────────────────────────────────────────────────────────────────────────
  for (const [id, name] of [
    [PROOF.CASINO_1_ID, 'Proof Casino One'] as const,
    [PROOF.CASINO_2_ID, 'Proof Casino Two'] as const,
  ]) {
    const { error } = await admin
      .from('casino')
      .insert({ id, name, company_id: PROOF.COMPANY_ID, status: 'active' });
    if (error && !isUniqueViolation(error)) {
      throw new Error(`casino ${name} insert failed: ${error.message}`);
    }
    console.log(
      error
        ? `[seed] casino "${name}": already exists (skipped)`
        : `[seed] casino "${name}": created`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Casino settings for casino 1
  // rpc_record_grind_observation → compute_gaming_day(casino_id, ts) queries
  // casino_settings.gaming_day_start_time. Without this row the RPC errors.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const { error } = await admin
      .from('casino_settings')
      .insert({ casino_id: PROOF.CASINO_1_ID });
    if (error && !isUniqueViolation(error)) {
      throw new Error(
        `casino_settings (casino1) insert failed: ${error.message}`,
      );
    }
    console.log(
      error
        ? '[seed] casino_settings (casino1): already exists (skipped)'
        : '[seed] casino_settings (casino1): created',
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Two gaming tables
  // ─────────────────────────────────────────────────────────────────────────
  for (const [id, casino_id, label] of [
    [PROOF.TABLE_1_ID, PROOF.CASINO_1_ID, 'Proof Table 1'] as const,
    [PROOF.TABLE_2_ID, PROOF.CASINO_2_ID, 'Proof Table 2'] as const,
  ]) {
    const { error } = await admin
      .from('gaming_table')
      .insert({ id, casino_id, label, type: 'blackjack', status: 'active' });
    if (error && !isUniqueViolation(error)) {
      throw new Error(
        `gaming_table "${label}" insert failed: ${error.message}`,
      );
    }
    console.log(
      error
        ? `[seed] gaming_table "${label}": already exists (skipped)`
        : `[seed] gaming_table "${label}": created`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Player (no casino_id on player — association is via player_casino)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const { error } = await admin
      .from('player')
      .insert({
        id: PROOF.PLAYER_ID,
        first_name: 'Proof',
        last_name: 'Player',
      });
    if (error && !isUniqueViolation(error)) {
      throw new Error(`player insert failed: ${error.message}`);
    }
    console.log(
      error
        ? '[seed] player: already exists (skipped)'
        : '[seed] player: created',
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5.5: player_casino enrollment
  // Required for player_financial_transaction SELECT RLS policy:
  //   EXISTS (SELECT 1 FROM player_casino pc WHERE pc.player_id = pft.player_id
  //           AND pc.casino_id = current_casino)
  // Without this record, ON CONFLICT (with specific index target) fails because
  // PostgreSQL checks the SELECT policy during conflict resolution.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const { error } = await admin.from('player_casino').insert({
      player_id: PROOF.PLAYER_ID,
      casino_id: PROOF.CASINO_1_ID,
      status: 'active',
      enrolled_by: PROOF.STAFF_ID,
    });
    if (error && !isUniqueViolation(error)) {
      throw new Error(`player_casino insert failed: ${error.message}`);
    }
    console.log(
      error
        ? '[seed] player_casino: already exists (skipped)'
        : '[seed] player_casino: created',
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6: Visit
  // gaming_day is supplied as a static literal — valid for harness-only local use.
  // visit_group_id has no FK constraint; fixed UUID is sufficient.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const { error } = await admin.from('visit').insert({
      id: PROOF.VISIT_ID,
      casino_id: PROOF.CASINO_1_ID,
      player_id: PROOF.PLAYER_ID,
      gaming_day: '2026-05-12',
      visit_group_id: PROOF.VISIT_GROUP_ID,
      visit_kind: 'gaming_identified_rated',
    });
    if (error && !isUniqueViolation(error)) {
      throw new Error(`visit insert failed: ${error.message}`);
    }
    console.log(
      error
        ? '[seed] visit: already exists (skipped)'
        : '[seed] visit: created',
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 7: Rating slip
  // Required for rpc_create_financial_txn Class A emission (p_rating_slip_id).
  // ─────────────────────────────────────────────────────────────────────────
  {
    const { error } = await admin.from('rating_slip').insert({
      id: PROOF.SLIP_ID,
      casino_id: PROOF.CASINO_1_ID,
      visit_id: PROOF.VISIT_ID,
      table_id: PROOF.TABLE_1_ID,
      status: 'open',
      accrual_kind: 'compliance_only',
      // 'compliance_only' satisfies the allowed-values constraint and avoids
      // the chk_policy_snapshot_if_loyalty constraint (only fires for 'loyalty')
    });
    if (error && !isUniqueViolation(error)) {
      throw new Error(`rating_slip insert failed: ${error.message}`);
    }
    console.log(
      error
        ? '[seed] rating_slip: already exists (skipped)'
        : '[seed] rating_slip: created',
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 8: Auth user — set_rls_context_from_staff() uses auth.uid() to look
  // up staff.user_id (fallback path when JWT lacks app_metadata.staff_id).
  // ─────────────────────────────────────────────────────────────────────────
  let authUserId: string;

  const { data: createData, error: createErr } =
    await admin.auth.admin.createUser({
      email: PROOF.STAFF_EMAIL,
      password: PROOF.STAFF_PASSWORD,
      email_confirm: true,
    });

  if (createErr) {
    // User may already exist — find and reuse
    const alreadyExists =
      createErr.message.toLowerCase().includes('already been registered') ||
      createErr.message.toLowerCase().includes('already exists') ||
      (createErr as { status?: number }).status === 422;

    if (!alreadyExists) {
      throw new Error(`auth.admin.createUser failed: ${createErr.message}`);
    }

    const { data: listData, error: listErr } =
      await admin.auth.admin.listUsers();
    if (listErr)
      throw new Error(`auth.admin.listUsers failed: ${listErr.message}`);

    const existing = listData.users.find((u) => u.email === PROOF.STAFF_EMAIL);
    if (!existing) {
      throw new Error(
        `Auth user ${PROOF.STAFF_EMAIL} not found after createUser conflict`,
      );
    }
    authUserId = existing.id;
    console.log(`[seed] auth user: already exists (id=${authUserId}, skipped)`);
  } else {
    authUserId = createData.user.id;
    console.log(`[seed] auth user: created (id=${authUserId})`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 9: Staff record
  // role: 'pit_boss' — required for both rpc_create_financial_txn (direction=in)
  // and rpc_record_grind_observation (pit_boss | floor_supervisor | admin).
  // user_id links to the auth user for set_rls_context_from_staff() lookup.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const { error } = await admin.from('staff').insert({
      id: PROOF.STAFF_ID,
      casino_id: PROOF.CASINO_1_ID,
      user_id: authUserId,
      email: PROOF.STAFF_EMAIL,
      first_name: 'Proof',
      last_name: 'Staff',
      role: 'pit_boss',
      status: 'active',
    });
    if (error && !isUniqueViolation(error)) {
      throw new Error(`staff insert failed: ${error.message}`);
    }
    console.log(
      error
        ? '[seed] staff: already exists (skipped)'
        : '[seed] staff: created',
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 9.5: Set app_metadata on auth user (staff_id, casino_id, staff_role)
  // set_rls_context_from_staff() uses JWT app_metadata.staff_id for fast path.
  // This ensures the JWT includes the staff context without requiring fallback.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const { error } = await admin.auth.admin.updateUserById(authUserId, {
      app_metadata: {
        staff_id: PROOF.STAFF_ID,
        casino_id: PROOF.CASINO_1_ID,
        staff_role: 'pit_boss',
      },
    });
    if (error) {
      // Non-fatal — fallback path via user_id lookup still works
      console.log(
        `[seed] auth user app_metadata: update failed (non-fatal): ${error.message}`,
      );
    } else {
      console.log(
        '[seed] auth user app_metadata: set (staff_id, casino_id, staff_role)',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 10: Validate auth sign-in
  // Proof scripts use an authenticated client for producer RPC calls.
  // This validates that the JWT will be usable.
  // ─────────────────────────────────────────────────────────────────────────
  const { data: signInData, error: signInErr } =
    await anon.auth.signInWithPassword({
      email: PROOF.STAFF_EMAIL,
      password: PROOF.STAFF_PASSWORD,
    });

  if (signInErr || !signInData?.session) {
    throw new Error(
      `Auth sign-in failed: ${signInErr?.message ?? 'no session returned'}`,
    );
  }

  console.log(
    `[seed] auth sign-in: OK (access_token present, user_id=${signInData.session.user.id})`,
  );

  console.log(
    '[seed] PRD-082 proof harness seed complete. All fixtures ready.',
  );
}

seed().catch((err: Error) => {
  console.error('[seed] FATAL:', err.message);
  process.exit(1);
});
