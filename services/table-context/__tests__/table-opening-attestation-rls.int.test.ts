/** @jest-environment node */

/**
 * PRD-059: table_opening_attestation RLS Policy — Integration Tests
 *
 * Mode C JWT auth (ADR-024): authenticated anon clients per casino.
 * Two authenticated clients (casinoAClient, casinoBClient) with separate
 * casino contexts to verify cross-casino RLS isolation.
 *
 * Tests:
 * AC-22: Direct INSERT from authenticated role denied
 * AC-23: Cross-casino SELECT denied
 *
 * PREREQUISITES:
 * - Migrations must be applied including PRD-059 custody gate schema + RLS
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable set
 * - RUN_INTEGRATION_TESTS=true
 *
 * @see supabase/migrations/20260326020248_prd059_open_custody_schema.sql
 * @see docs/30-security/SEC-001-rls-policy-matrix.md
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isIntegrationEnvironment =
  supabaseUrl &&
  supabaseServiceKey &&
  supabaseAnonKey &&
  process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration('PRD-059: table_opening_attestation RLS Policies', () => {
  // setupClient: service-role, for fixture creation/teardown/verification
  let setupClient: SupabaseClient<Database>;
  // casinoAClient: authenticated anon client with Casino A staff_id JWT
  let casinoAClient: SupabaseClient<Database>;
  // casinoBClient: authenticated anon client with Casino B staff_id JWT
  let casinoBClient: SupabaseClient<Database>;

  // Casino A entities
  let companyAId: string;
  let casinoAId: string;
  let pitBossAId: string;
  let pitBossAUserId: string;
  let tableAId: string;
  let sessionAId: string;
  let attestationAId: string;

  // Casino B entities
  let companyBId: string;
  let casinoBId: string;
  let pitBossBId: string;
  let pitBossBUserId: string;

  const PB_A_EMAIL = `test-tc-mode-c-rls-a-${Date.now()}@test.com`;
  const PB_B_EMAIL = `test-tc-mode-c-rls-b-${Date.now()}@test.com`;
  const TEST_PASSWORD = 'TestPassword123!';

  beforeAll(async () => {
    setupClient = createClient<Database>(supabaseUrl!, supabaseServiceKey!);

    // -----------------------------------------------------------------------
    // Casino A setup
    // -----------------------------------------------------------------------
    const { data: userA } = await setupClient.auth.admin.createUser({
      email: PB_A_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    pitBossAUserId = userA!.user!.id;

    const { data: companyA } = await setupClient
      .from('company')
      .insert({ name: 'PRD-059 RLS Casino A Co' })
      .select('id')
      .single();
    companyAId = companyA!.id;

    const { data: casinoA } = await setupClient
      .from('casino')
      .insert({ name: 'PRD-059 RLS Casino A', company_id: companyA!.id })
      .select('id')
      .single();
    casinoAId = casinoA!.id;

    await setupClient.from('casino_settings').insert({
      casino_id: casinoAId,
      gaming_day_start_time: '06:00',
      timezone: 'America/Los_Angeles',
    });

    const { data: staffA } = await setupClient
      .from('staff')
      .insert({
        user_id: pitBossAUserId,
        casino_id: casinoAId,
        role: 'pit_boss',
        first_name: 'CasinoA',
        last_name: 'PitBoss',
        status: 'active',
      })
      .select('id')
      .single();
    pitBossAId = staffA!.id;

    // Two-phase ADR-024: stamp staff_id for Casino A
    await setupClient.auth.admin.updateUserById(pitBossAUserId, {
      app_metadata: {
        casino_id: casinoAId,
        staff_id: pitBossAId,
        staff_role: 'pit_boss',
      },
    });

    const { data: tableA } = await setupClient
      .from('gaming_table')
      .insert({
        casino_id: casinoAId,
        label: 'PRD059-RLS-A-T1',
        type: 'blackjack',
        pit: 'PIT-A',
        status: 'active',
      })
      .select('id')
      .single();
    tableAId = tableA!.id;

    // Sign in Casino A pit boss
    casinoAClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
    const { error: signInAErr } = await casinoAClient.auth.signInWithPassword({
      email: PB_A_EMAIL,
      password: TEST_PASSWORD,
    });
    if (signInAErr)
      throw new Error(`Casino A sign-in failed: ${signInAErr.message}`);

    // Create an OPEN session and activate it (to get an attestation row)
    const { data: sessionA } = await casinoAClient.rpc(
      'rpc_open_table_session',
      { p_gaming_table_id: tableAId },
    );
    sessionAId = sessionA!.id;

    await casinoAClient.rpc('rpc_activate_table_session', {
      p_table_session_id: sessionAId,
      p_opening_total_cents: 50000,
      p_dealer_confirmed: true,
      p_opening_note: 'Bootstrap for RLS test',
    });

    // Get the attestation ID via setupClient
    const { data: attRow } = await setupClient
      .from('table_opening_attestation')
      .select('id')
      .eq('session_id', sessionAId)
      .single();
    attestationAId = attRow!.id;

    // -----------------------------------------------------------------------
    // Casino B setup
    // -----------------------------------------------------------------------
    const { data: userB } = await setupClient.auth.admin.createUser({
      email: PB_B_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    pitBossBUserId = userB!.user!.id;

    const { data: companyB } = await setupClient
      .from('company')
      .insert({ name: 'PRD-059 RLS Casino B Co' })
      .select('id')
      .single();
    companyBId = companyB!.id;

    const { data: casinoB } = await setupClient
      .from('casino')
      .insert({ name: 'PRD-059 RLS Casino B', company_id: companyB!.id })
      .select('id')
      .single();
    casinoBId = casinoB!.id;

    await setupClient.from('casino_settings').insert({
      casino_id: casinoBId,
      gaming_day_start_time: '06:00',
      timezone: 'America/Los_Angeles',
    });

    const { data: staffB } = await setupClient
      .from('staff')
      .insert({
        user_id: pitBossBUserId,
        casino_id: casinoBId,
        role: 'pit_boss',
        first_name: 'CasinoB',
        last_name: 'PitBoss',
        status: 'active',
      })
      .select('id')
      .single();
    pitBossBId = staffB!.id;

    // Two-phase ADR-024: stamp staff_id for Casino B
    await setupClient.auth.admin.updateUserById(pitBossBUserId, {
      app_metadata: {
        casino_id: casinoBId,
        staff_id: pitBossBId,
        staff_role: 'pit_boss',
      },
    });

    // Sign in Casino B pit boss
    casinoBClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
    const { error: signInBErr } = await casinoBClient.auth.signInWithPassword({
      email: PB_B_EMAIL,
      password: TEST_PASSWORD,
    });
    if (signInBErr)
      throw new Error(`Casino B sign-in failed: ${signInBErr.message}`);
  });

  afterAll(async () => {
    // Cleanup Casino A (via setupClient)
    await setupClient.from('audit_log').delete().eq('casino_id', casinoAId);
    await setupClient
      .from('table_opening_attestation')
      .delete()
      .eq('casino_id', casinoAId);
    await setupClient
      .from('table_rundown_report')
      .delete()
      .eq('casino_id', casinoAId);
    await setupClient.from('table_session').delete().eq('casino_id', casinoAId);
    await setupClient
      .from('table_inventory_snapshot')
      .delete()
      .eq('casino_id', casinoAId);
    await setupClient
      .from('table_drop_event')
      .delete()
      .eq('casino_id', casinoAId);
    await setupClient.from('gaming_table').delete().eq('casino_id', casinoAId);
    await setupClient.from('staff').delete().eq('casino_id', casinoAId);
    await setupClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casinoAId);
    await setupClient.from('casino').delete().eq('id', casinoAId);
    await setupClient.from('company').delete().eq('id', companyAId);
    await setupClient.auth.admin.deleteUser(pitBossAUserId);

    // Cleanup Casino B (via setupClient)
    await setupClient.from('audit_log').delete().eq('casino_id', casinoBId);
    await setupClient
      .from('table_opening_attestation')
      .delete()
      .eq('casino_id', casinoBId);
    await setupClient
      .from('table_rundown_report')
      .delete()
      .eq('casino_id', casinoBId);
    await setupClient.from('table_session').delete().eq('casino_id', casinoBId);
    await setupClient.from('gaming_table').delete().eq('casino_id', casinoBId);
    await setupClient.from('staff').delete().eq('casino_id', casinoBId);
    await setupClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casinoBId);
    await setupClient.from('casino').delete().eq('id', casinoBId);
    await setupClient.from('company').delete().eq('id', companyBId);
    await setupClient.auth.admin.deleteUser(pitBossBUserId);
  });

  // =========================================================================
  // AC-22: Direct INSERT from authenticated role denied
  // =========================================================================
  describe('AC-22: direct INSERT denied', () => {
    it('INSERT into table_opening_attestation fails from authenticated client (RLS + REVOKE)', async () => {
      // Attempt direct INSERT via Casino A authenticated client
      // The table has INSERT denied via both REVOKE and RLS WITH CHECK(false)
      const { error } = await casinoAClient
        .from('table_opening_attestation')
        .insert({
          casino_id: casinoAId,
          session_id: sessionAId,
          opening_total_cents: 99999,
          attested_by: pitBossAId,
          dealer_confirmed: true,
          provenance_source: 'par_bootstrap',
        } as Record<string, unknown>);

      // Should fail — INSERT revoked for authenticated role
      expect(error).not.toBeNull();

      // Verify the RPC-created attestation is still the only one
      const { data: allAttestations } = await setupClient
        .from('table_opening_attestation')
        .select('id')
        .eq('session_id', sessionAId);

      expect(allAttestations).toHaveLength(1);
    });
  });

  // =========================================================================
  // AC-23: Cross-casino SELECT denied
  // =========================================================================
  describe('AC-23: cross-casino SELECT denied', () => {
    it('Casino B context cannot see Casino A attestation', async () => {
      // Casino B authenticated client tries to read Casino A's attestation
      const { data: attestation } = await casinoBClient
        .from('table_opening_attestation')
        .select('*')
        .eq('id', attestationAId)
        .maybeSingle();

      // RLS filters this out — Casino B context cannot see Casino A data
      expect(attestation).toBeNull();
    });

    it('Casino A context can see its own attestation', async () => {
      const { data: attestations } = await casinoAClient
        .from('table_opening_attestation')
        .select('id, casino_id')
        .eq('casino_id', casinoAId);

      expect(attestations).not.toBeNull();
      expect(attestations!.length).toBeGreaterThanOrEqual(1);
      expect(attestations![0].casino_id).toBe(casinoAId);
    });

    it('Casino B has no attestation rows for Casino A casino_id', async () => {
      // Casino B client queries with Casino A's casino_id filter
      const { data: casinoAAttestations } = await casinoBClient
        .from('table_opening_attestation')
        .select('id')
        .eq('casino_id', casinoAId);

      // RLS ensures Casino B sees nothing from Casino A
      expect(casinoAAttestations).toHaveLength(0);

      // Casino B also has no attestations (none created)
      const { data: casinoBAttestations } = await casinoBClient
        .from('table_opening_attestation')
        .select('id')
        .eq('casino_id', casinoBId);

      expect(casinoBAttestations).toHaveLength(0);
    });
  });
});
