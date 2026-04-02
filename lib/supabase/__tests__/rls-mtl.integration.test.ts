/** @jest-environment node */

/**
 * RLS MTL Integration Tests (PRD-005 WS7)
 *
 * Tests RLS policy enforcement for mtl_entry and mtl_audit_note tables.
 * Verifies authorization matrix per ADR-025 and append-only enforcement.
 *
 * Auth model: ADR-024 Mode C — authenticated anon clients carry JWT with staff_id
 * in app_metadata; set_rls_context_from_staff() derives context server-side.
 *
 * Authorization Matrix (ADR-025 v1.1.0):
 * - mtl_entry SELECT: pit_boss, cashier, admin
 * - mtl_entry INSERT: pit_boss, cashier, admin
 * - mtl_entry UPDATE: NOBODY (append-only)
 * - mtl_entry DELETE: NOBODY (append-only)
 * - mtl_audit_note SELECT: pit_boss, admin
 * - mtl_audit_note INSERT: pit_boss, admin
 * - mtl_audit_note UPDATE: NOBODY (append-only)
 * - mtl_audit_note DELETE: NOBODY (append-only)
 *
 * PREREQUISITES:
 * - Migration 20260103002836_prd005_mtl_service.sql must be applied
 * - Migration 20260103004320_prd005_mtl_occurred_at_and_guards.sql must be applied
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable set
 *
 * @see docs/10-prd/PRD-005-mtl-service.md
 * @see docs/80-adrs/ADR-025-mtl-authorization-model.md
 * @see docs/80-adrs/ADR-024-authoritative-context-derivation.md
 * @see services/mtl/index.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
// eslint-disable-next-line no-restricted-imports -- Integration tests require direct Supabase client
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';

(RUN_INTEGRATION ? describe : describe.skip)(
  'RLS MTL Policies (PRD-005 WS7)',
  () => {
    let setupClient: SupabaseClient<Database>; // Service role bypasses RLS (fixture only)
    let pitBossClient: SupabaseClient<Database>; // Authenticated as pit_boss (Mode C)
    let cashierClient: SupabaseClient<Database>; // Authenticated as cashier (Mode C)
    let adminClient: SupabaseClient<Database>; // Authenticated as admin (Mode C)
    let dealerClient: SupabaseClient<Database>; // Authenticated as dealer (Mode C, no access)
    let crossCasinoClient: SupabaseClient<Database>; // Different casino context (Mode C)

    // Test data IDs
    let testCompany1Id: string;
    let testCompany2Id: string;
    let testCasino1Id: string;
    let testCasino2Id: string;
    let testPitBossId: string;
    let testCashierId: string;
    let testAdminId: string;
    let testDealerId: string;
    let testCrossCasinoStaffId: string;
    let testUser1Id: string;
    let testUser2Id: string;
    let testUser3Id: string;
    let testUser4Id: string;
    let testUser5Id: string;
    let testPlayer1Id: string;
    let testPlayer2Id: string;
    let testEntry1Id: string;
    let testEntry2Id: string;
    let testAuditNote1Id: string;

    const ts = Date.now();
    const testEmail1 = `test-rls-t3-mtl-pitboss-${ts}@example.com`;
    const testEmail2 = `test-rls-t3-mtl-cashier-${ts}@example.com`;
    const testEmail3 = `test-rls-t3-mtl-admin-${ts}@example.com`;
    const testEmail4 = `test-rls-t3-mtl-dealer-${ts}@example.com`;
    const testEmail5 = `test-rls-t3-mtl-crosscasino-${ts}@example.com`;
    const testPassword = 'test-password-12345';

    beforeAll(async () => {
      // Service client for setup (bypasses RLS)
      setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

      // =========================================================================
      // Create Test Users (Phase 1: no staff_id yet — two-phase ADR-024 setup)
      // =========================================================================

      const { data: authUser1, error: authError1 } =
        await setupClient.auth.admin.createUser({
          email: testEmail1,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'pit_boss' },
        });
      if (authError1) throw authError1;
      testUser1Id = authUser1.user.id;

      const { data: authUser2, error: authError2 } =
        await setupClient.auth.admin.createUser({
          email: testEmail2,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'cashier' },
        });
      if (authError2) throw authError2;
      testUser2Id = authUser2.user.id;

      const { data: authUser3, error: authError3 } =
        await setupClient.auth.admin.createUser({
          email: testEmail3,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'admin' },
        });
      if (authError3) throw authError3;
      testUser3Id = authUser3.user.id;

      const { data: authUser4, error: authError4 } =
        await setupClient.auth.admin.createUser({
          email: testEmail4,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'dealer' },
        });
      if (authError4) throw authError4;
      testUser4Id = authUser4.user.id;

      const { data: authUser5, error: authError5 } =
        await setupClient.auth.admin.createUser({
          email: testEmail5,
          password: testPassword,
          email_confirm: true,
          app_metadata: { staff_role: 'pit_boss' },
        });
      if (authError5) throw authError5;
      testUser5Id = authUser5.user.id;

      // =========================================================================
      // Create Test Companies (ADR-043: casino.company_id NOT NULL)
      // =========================================================================

      const { data: company1 } = await setupClient
        .from('company')
        .insert({ name: 'RLS MTL Test Company 1' })
        .select()
        .single();
      if (!company1) throw new Error('Failed to create test company 1');
      testCompany1Id = company1.id;

      const { data: company2 } = await setupClient
        .from('company')
        .insert({ name: 'RLS MTL Test Company 2' })
        .select()
        .single();
      if (!company2) throw new Error('Failed to create test company 2');
      testCompany2Id = company2.id;

      // =========================================================================
      // Create Test Casinos
      // =========================================================================

      const { data: casino1, error: casino1Error } = await setupClient
        .from('casino')
        .insert({
          name: 'RLS MTL Test Casino 1',
          company_id: testCompany1Id,
          status: 'active',
        })
        .select()
        .single();

      if (casino1Error) throw casino1Error;
      testCasino1Id = casino1.id;

      const { data: casino2, error: casino2Error } = await setupClient
        .from('casino')
        .insert({
          name: 'RLS MTL Test Casino 2',
          company_id: testCompany2Id,
          status: 'active',
        })
        .select()
        .single();

      if (casino2Error) throw casino2Error;
      testCasino2Id = casino2.id;

      // Create casino settings (required for gaming_day trigger)
      await setupClient.from('casino_settings').insert([
        {
          casino_id: testCasino1Id,
          gaming_day_start_time: '06:00:00',
          timezone: 'America/Los_Angeles',
          watchlist_floor: 3000,
          ctr_threshold: 10000,
        },
        {
          casino_id: testCasino2Id,
          gaming_day_start_time: '06:00:00',
          timezone: 'America/Los_Angeles',
          watchlist_floor: 3000,
          ctr_threshold: 10000,
        },
      ]);

      // =========================================================================
      // Create Test Staff (Different Roles)
      // =========================================================================

      const { data: pitBoss, error: pitBossError } = await setupClient
        .from('staff')
        .insert({
          casino_id: testCasino1Id,
          user_id: testUser1Id,
          employee_id: 'RLS-MTL-PITBOSS',
          first_name: 'Test',
          last_name: 'PitBoss',
          role: 'pit_boss',
          status: 'active',
        })
        .select()
        .single();

      if (pitBossError) throw pitBossError;
      testPitBossId = pitBoss.id;

      const { data: cashier, error: cashierError } = await setupClient
        .from('staff')
        .insert({
          casino_id: testCasino1Id,
          user_id: testUser2Id,
          employee_id: 'RLS-MTL-CASHIER',
          first_name: 'Test',
          last_name: 'Cashier',
          role: 'cashier',
          status: 'active',
        })
        .select()
        .single();

      if (cashierError) throw cashierError;
      testCashierId = cashier.id;

      const { data: admin, error: adminError } = await setupClient
        .from('staff')
        .insert({
          casino_id: testCasino1Id,
          user_id: testUser3Id,
          employee_id: 'RLS-MTL-ADMIN',
          first_name: 'Test',
          last_name: 'Admin',
          role: 'admin',
          status: 'active',
        })
        .select()
        .single();

      if (adminError) throw adminError;
      testAdminId = admin.id;

      const { data: dealer, error: dealerError } = await setupClient
        .from('staff')
        .insert({
          casino_id: testCasino1Id,
          user_id: testUser4Id,
          employee_id: 'RLS-MTL-DEALER',
          first_name: 'Test',
          last_name: 'Dealer',
          role: 'dealer',
          status: 'active',
        })
        .select()
        .single();

      if (dealerError) throw dealerError;
      testDealerId = dealer.id;

      // Staff in Casino 2 (for cross-casino tests)
      const { data: crossCasinoStaff, error: crossError } = await setupClient
        .from('staff')
        .insert({
          casino_id: testCasino2Id,
          user_id: testUser5Id,
          employee_id: 'RLS-MTL-CROSS',
          first_name: 'Test',
          last_name: 'CrossCasino',
          role: 'pit_boss',
          status: 'active',
        })
        .select()
        .single();

      if (crossError) throw crossError;
      testCrossCasinoStaffId = crossCasinoStaff.id;

      // =========================================================================
      // Stamp staff_id into app_metadata (ADR-024 Phase 2)
      // =========================================================================

      await setupClient.auth.admin.updateUserById(testUser1Id, {
        app_metadata: {
          staff_id: testPitBossId,
          casino_id: testCasino1Id,
          staff_role: 'pit_boss',
        },
      });
      await setupClient.auth.admin.updateUserById(testUser2Id, {
        app_metadata: {
          staff_id: testCashierId,
          casino_id: testCasino1Id,
          staff_role: 'cashier',
        },
      });
      await setupClient.auth.admin.updateUserById(testUser3Id, {
        app_metadata: {
          staff_id: testAdminId,
          casino_id: testCasino1Id,
          staff_role: 'admin',
        },
      });
      await setupClient.auth.admin.updateUserById(testUser4Id, {
        app_metadata: {
          staff_id: testDealerId,
          casino_id: testCasino1Id,
          staff_role: 'dealer',
        },
      });
      await setupClient.auth.admin.updateUserById(testUser5Id, {
        app_metadata: {
          staff_id: testCrossCasinoStaffId,
          casino_id: testCasino2Id,
          staff_role: 'pit_boss',
        },
      });

      // =========================================================================
      // Sign in via throwaway clients to get JWTs (Mode C — ADR-024)
      // =========================================================================

      const throwaway1 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: session1, error: signIn1Error } =
        await throwaway1.auth.signInWithPassword({
          email: testEmail1,
          password: testPassword,
        });
      if (signIn1Error || !session1.session)
        throw signIn1Error ?? new Error('Sign-in pitboss returned no session');

      const throwaway2 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: session2, error: signIn2Error } =
        await throwaway2.auth.signInWithPassword({
          email: testEmail2,
          password: testPassword,
        });
      if (signIn2Error || !session2.session)
        throw signIn2Error ?? new Error('Sign-in cashier returned no session');

      const throwaway3 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: session3, error: signIn3Error } =
        await throwaway3.auth.signInWithPassword({
          email: testEmail3,
          password: testPassword,
        });
      if (signIn3Error || !session3.session)
        throw signIn3Error ?? new Error('Sign-in admin returned no session');

      const throwaway4 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: session4, error: signIn4Error } =
        await throwaway4.auth.signInWithPassword({
          email: testEmail4,
          password: testPassword,
        });
      if (signIn4Error || !session4.session)
        throw signIn4Error ?? new Error('Sign-in dealer returned no session');

      const throwaway5 = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: session5, error: signIn5Error } =
        await throwaway5.auth.signInWithPassword({
          email: testEmail5,
          password: testPassword,
        });
      if (signIn5Error || !session5.session)
        throw (
          signIn5Error ?? new Error('Sign-in crosscasino returned no session')
        );

      // =========================================================================
      // Create Mode C Authenticated Anon Clients (ADR-024)
      // =========================================================================

      pitBossClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: { Authorization: `Bearer ${session1.session.access_token}` },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      cashierClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: { Authorization: `Bearer ${session2.session.access_token}` },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      adminClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: { Authorization: `Bearer ${session3.session.access_token}` },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      dealerClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: { Authorization: `Bearer ${session4.session.access_token}` },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      crossCasinoClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: { Authorization: `Bearer ${session5.session.access_token}` },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // =========================================================================
      // Create Test Players
      // =========================================================================

      const { data: player1, error: player1Error } = await setupClient
        .from('player')
        .insert({
          first_name: 'MTLTest',
          last_name: 'Player1',
        })
        .select()
        .single();

      if (player1Error) throw player1Error;
      testPlayer1Id = player1.id;

      const { data: player2, error: player2Error } = await setupClient
        .from('player')
        .insert({
          first_name: 'MTLTest',
          last_name: 'Player2',
        })
        .select()
        .single();

      if (player2Error) throw player2Error;
      testPlayer2Id = player2.id;

      // Enroll players in casinos
      await setupClient.from('player_casino').insert([
        { player_id: testPlayer1Id, casino_id: testCasino1Id },
        { player_id: testPlayer2Id, casino_id: testCasino2Id },
      ]);

      // =========================================================================
      // Create Test MTL Entries (via service role to bypass RLS for setup)
      // =========================================================================

      const { data: entry1, error: entry1Error } = await setupClient
        .from('mtl_entry')
        .insert({
          casino_id: testCasino1Id,
          patron_uuid: testPlayer1Id,
          staff_id: testPitBossId,
          amount: 5000,
          direction: 'in',
          txn_type: 'buy_in',
          source: 'table',
          idempotency_key: 'rls-mtl-test-entry-1',
        })
        .select()
        .single();

      if (entry1Error) throw entry1Error;
      testEntry1Id = entry1.id;

      const { data: entry2, error: entry2Error } = await setupClient
        .from('mtl_entry')
        .insert({
          casino_id: testCasino2Id,
          patron_uuid: testPlayer2Id,
          staff_id: testCrossCasinoStaffId,
          amount: 8000,
          direction: 'in',
          txn_type: 'buy_in',
          source: 'cage',
          idempotency_key: 'rls-mtl-test-entry-2',
        })
        .select()
        .single();

      if (entry2Error) throw entry2Error;
      testEntry2Id = entry2.id;

      // =========================================================================
      // Create Test Audit Note
      // =========================================================================

      const { data: auditNote1, error: auditNote1Error } = await setupClient
        .from('mtl_audit_note')
        .insert({
          mtl_entry_id: testEntry1Id,
          staff_id: testPitBossId,
          note: 'RLS test audit note',
        })
        .select()
        .single();

      if (auditNote1Error) throw auditNote1Error;
      testAuditNote1Id = auditNote1.id;
    });

    afterAll(async () => {
      // Clean up test data (in reverse order of creation)
      // Note: Can't delete MTL entries/notes due to append-only triggers,
      // so we use service role with trigger bypass

      // Disable triggers for cleanup (ignore errors if RPC doesn't exist)
      try {
        await setupClient.rpc('exec_sql', {
          sql: 'ALTER TABLE mtl_audit_note DISABLE TRIGGER trg_mtl_audit_note_no_delete',
        });
      } catch {
        /* ignore */
      }
      try {
        await setupClient.rpc('exec_sql', {
          sql: 'ALTER TABLE mtl_entry DISABLE TRIGGER trg_mtl_entry_no_delete',
        });
      } catch {
        /* ignore */
      }

      try {
        await setupClient
          .from('mtl_audit_note')
          .delete()
          .eq('id', testAuditNote1Id);
      } catch {
        /* ignore */
      }
      try {
        await setupClient.from('mtl_entry').delete().eq('id', testEntry1Id);
      } catch {
        /* ignore */
      }
      try {
        await setupClient.from('mtl_entry').delete().eq('id', testEntry2Id);
      } catch {
        /* ignore */
      }

      // Re-enable triggers
      try {
        await setupClient.rpc('exec_sql', {
          sql: 'ALTER TABLE mtl_audit_note ENABLE TRIGGER trg_mtl_audit_note_no_delete',
        });
      } catch {
        /* ignore */
      }
      try {
        await setupClient.rpc('exec_sql', {
          sql: 'ALTER TABLE mtl_entry ENABLE TRIGGER trg_mtl_entry_no_delete',
        });
      } catch {
        /* ignore */
      }

      // Clean up other test data
      await setupClient
        .from('player_casino')
        .delete()
        .eq('player_id', testPlayer1Id);
      await setupClient
        .from('player_casino')
        .delete()
        .eq('player_id', testPlayer2Id);
      await setupClient.from('player').delete().eq('id', testPlayer1Id);
      await setupClient.from('player').delete().eq('id', testPlayer2Id);
      await setupClient.from('staff').delete().eq('id', testPitBossId);
      await setupClient.from('staff').delete().eq('id', testCashierId);
      await setupClient.from('staff').delete().eq('id', testAdminId);
      await setupClient.from('staff').delete().eq('id', testDealerId);
      await setupClient.from('staff').delete().eq('id', testCrossCasinoStaffId);
      await setupClient
        .from('casino_settings')
        .delete()
        .eq('casino_id', testCasino1Id);
      await setupClient
        .from('casino_settings')
        .delete()
        .eq('casino_id', testCasino2Id);
      await setupClient.from('casino').delete().eq('id', testCasino1Id);
      await setupClient.from('casino').delete().eq('id', testCasino2Id);

      // Clean up companies (ADR-043)
      await setupClient.from('company').delete().eq('id', testCompany1Id);
      await setupClient.from('company').delete().eq('id', testCompany2Id);

      // Clean up test users
      for (const userId of [
        testUser1Id,
        testUser2Id,
        testUser3Id,
        testUser4Id,
        testUser5Id,
      ]) {
        if (userId) {
          try {
            await setupClient.auth.admin.deleteUser(userId);
          } catch {
            /* ignore */
          }
        }
      }
    });

    // ===========================================================================
    // 1. mtl_entry SELECT Policies (ADR-025: pit_boss, cashier, admin)
    // ===========================================================================

    describe('mtl_entry SELECT Policies', () => {
      it('pit_boss can SELECT mtl_entry', async () => {
        const { data, error } = await pitBossClient
          .from('mtl_entry')
          .select('*')
          .eq('id', testEntry1Id);

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBe(1);
        expect(data?.[0].id).toBe(testEntry1Id);
      });

      it('cashier can SELECT mtl_entry (form UX per ADR-025 v1.1.0)', async () => {
        const { data, error } = await cashierClient
          .from('mtl_entry')
          .select('*')
          .eq('id', testEntry1Id);

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBe(1);
      });

      it('admin can SELECT mtl_entry', async () => {
        const { data, error } = await adminClient
          .from('mtl_entry')
          .select('*')
          .eq('id', testEntry1Id);

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBe(1);
      });

      it('dealer CANNOT SELECT mtl_entry', async () => {
        const { data, error } = await dealerClient
          .from('mtl_entry')
          .select('*')
          .eq('id', testEntry1Id);

        // Should return empty (RLS filters out)
        expect(error).toBeNull();
        expect(data).toEqual([]);
      });
    });

    // ===========================================================================
    // 2. mtl_entry INSERT Policies (ADR-025: pit_boss, cashier, admin)
    // ===========================================================================

    describe('mtl_entry INSERT Policies', () => {
      it('pit_boss can INSERT mtl_entry', async () => {
        const { data, error } = await pitBossClient
          .from('mtl_entry')
          .insert({
            casino_id: testCasino1Id,
            patron_uuid: testPlayer1Id,
            staff_id: testPitBossId,
            amount: 2000,
            direction: 'in',
            txn_type: 'buy_in',
            source: 'table',
            idempotency_key: `rls-mtl-pitboss-insert-${Date.now()}`,
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.amount).toBe(2000);
      });

      it('cashier can INSERT mtl_entry', async () => {
        const { data, error } = await cashierClient
          .from('mtl_entry')
          .insert({
            casino_id: testCasino1Id,
            patron_uuid: testPlayer1Id,
            staff_id: testCashierId,
            amount: 3000,
            direction: 'out',
            txn_type: 'cash_out',
            source: 'cage',
            idempotency_key: `rls-mtl-cashier-insert-${Date.now()}`,
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.amount).toBe(3000);
      });

      it('admin can INSERT mtl_entry', async () => {
        const { data, error } = await adminClient
          .from('mtl_entry')
          .insert({
            casino_id: testCasino1Id,
            patron_uuid: testPlayer1Id,
            staff_id: testAdminId,
            amount: 15000,
            direction: 'in',
            txn_type: 'front_money',
            source: 'cage',
            idempotency_key: `rls-mtl-admin-insert-${Date.now()}`,
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.amount).toBe(15000);
      });

      it('dealer CANNOT INSERT mtl_entry', async () => {
        const { error } = await dealerClient.from('mtl_entry').insert({
          casino_id: testCasino1Id,
          patron_uuid: testPlayer1Id,
          staff_id: testDealerId,
          amount: 100,
          direction: 'in',
          txn_type: 'buy_in',
          source: 'table',
          idempotency_key: `rls-mtl-dealer-insert-${Date.now()}`,
        });

        // Should fail with RLS violation
        expect(error).not.toBeNull();
      });
    });

    // ===========================================================================
    // 3. mtl_entry Append-Only (UPDATE/DELETE Blocked)
    // ===========================================================================

    describe('mtl_entry Append-Only Enforcement', () => {
      it('pit_boss CANNOT UPDATE mtl_entry', async () => {
        const { error } = await pitBossClient
          .from('mtl_entry')
          .update({ amount: 9999 })
          .eq('id', testEntry1Id);

        // Should fail - no UPDATE policy exists
        expect(error).not.toBeNull();
      });

      it('admin CANNOT UPDATE mtl_entry', async () => {
        const { error } = await adminClient
          .from('mtl_entry')
          .update({ amount: 9999 })
          .eq('id', testEntry1Id);

        // Should fail - no UPDATE policy exists
        expect(error).not.toBeNull();
      });

      it('pit_boss CANNOT DELETE mtl_entry', async () => {
        const { error } = await pitBossClient
          .from('mtl_entry')
          .delete()
          .eq('id', testEntry1Id);

        // Should fail - no DELETE policy exists
        expect(error).not.toBeNull();
      });

      it('admin CANNOT DELETE mtl_entry', async () => {
        const { error } = await adminClient
          .from('mtl_entry')
          .delete()
          .eq('id', testEntry1Id);

        // Should fail - no DELETE policy exists
        expect(error).not.toBeNull();
      });

      it('BEFORE triggers block UPDATE via service_role', async () => {
        // This tests the belt+suspenders layer - triggers as final defense
        const { error } = await setupClient
          .from('mtl_entry')
          .update({ amount: 9999 })
          .eq('id', testEntry1Id);

        // Should fail with trigger exception
        expect(error).not.toBeNull();
        expect(error?.message).toContain('immutable');
      });

      it('BEFORE triggers block DELETE via service_role', async () => {
        // This tests the belt+suspenders layer - triggers as final defense
        const { error } = await setupClient
          .from('mtl_entry')
          .delete()
          .eq('id', testEntry1Id);

        // Should fail with trigger exception
        expect(error).not.toBeNull();
        expect(error?.message).toContain('immutable');
      });
    });

    // ===========================================================================
    // 4. mtl_audit_note SELECT Policies (ADR-025: pit_boss, admin only)
    // ===========================================================================

    describe('mtl_audit_note SELECT Policies', () => {
      it('pit_boss can SELECT mtl_audit_note', async () => {
        const { data, error } = await pitBossClient
          .from('mtl_audit_note')
          .select('*')
          .eq('id', testAuditNote1Id);

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBe(1);
      });

      it('admin can SELECT mtl_audit_note', async () => {
        const { data, error } = await adminClient
          .from('mtl_audit_note')
          .select('*')
          .eq('id', testAuditNote1Id);

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBe(1);
      });

      it('cashier CANNOT SELECT mtl_audit_note', async () => {
        const { data, error } = await cashierClient
          .from('mtl_audit_note')
          .select('*')
          .eq('id', testAuditNote1Id);

        // Should return empty (RLS filters out)
        expect(error).toBeNull();
        expect(data).toEqual([]);
      });
    });

    // ===========================================================================
    // 5. mtl_audit_note INSERT Policies (ADR-025: pit_boss, admin only)
    // ===========================================================================

    describe('mtl_audit_note INSERT Policies', () => {
      it('pit_boss can INSERT mtl_audit_note', async () => {
        const { data, error } = await pitBossClient
          .from('mtl_audit_note')
          .insert({
            mtl_entry_id: testEntry1Id,
            staff_id: testPitBossId,
            note: 'Pit boss audit note test',
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.note).toBe('Pit boss audit note test');
      });

      it('admin can INSERT mtl_audit_note', async () => {
        const { data, error } = await adminClient
          .from('mtl_audit_note')
          .insert({
            mtl_entry_id: testEntry1Id,
            staff_id: testAdminId,
            note: 'Admin audit note test',
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.note).toBe('Admin audit note test');
      });

      it('cashier CANNOT INSERT mtl_audit_note', async () => {
        const { error } = await cashierClient.from('mtl_audit_note').insert({
          mtl_entry_id: testEntry1Id,
          staff_id: testCashierId,
          note: 'Cashier should not be able to add this',
        });

        // Should fail with RLS violation
        expect(error).not.toBeNull();
      });
    });

    // ===========================================================================
    // 6. mtl_audit_note Append-Only (UPDATE/DELETE Blocked)
    // ===========================================================================

    describe('mtl_audit_note Append-Only Enforcement', () => {
      it('pit_boss CANNOT UPDATE mtl_audit_note', async () => {
        const { error } = await pitBossClient
          .from('mtl_audit_note')
          .update({ note: 'Modified note' })
          .eq('id', testAuditNote1Id);

        // Should fail - no UPDATE policy exists
        expect(error).not.toBeNull();
      });

      it('admin CANNOT UPDATE mtl_audit_note', async () => {
        const { error } = await adminClient
          .from('mtl_audit_note')
          .update({ note: 'Modified note' })
          .eq('id', testAuditNote1Id);

        // Should fail - no UPDATE policy exists
        expect(error).not.toBeNull();
      });

      it('pit_boss CANNOT DELETE mtl_audit_note', async () => {
        const { error } = await pitBossClient
          .from('mtl_audit_note')
          .delete()
          .eq('id', testAuditNote1Id);

        // Should fail - no DELETE policy exists
        expect(error).not.toBeNull();
      });

      it('admin CANNOT DELETE mtl_audit_note', async () => {
        const { error } = await adminClient
          .from('mtl_audit_note')
          .delete()
          .eq('id', testAuditNote1Id);

        // Should fail - no DELETE policy exists
        expect(error).not.toBeNull();
      });

      it('BEFORE triggers block UPDATE on mtl_audit_note via service_role', async () => {
        const { error } = await setupClient
          .from('mtl_audit_note')
          .update({ note: 'Modified note' })
          .eq('id', testAuditNote1Id);

        // Should fail with trigger exception
        expect(error).not.toBeNull();
        expect(error?.message).toContain('immutable');
      });

      it('BEFORE triggers block DELETE on mtl_audit_note via service_role', async () => {
        const { error } = await setupClient
          .from('mtl_audit_note')
          .delete()
          .eq('id', testAuditNote1Id);

        // Should fail with trigger exception
        expect(error).not.toBeNull();
        expect(error?.message).toContain('immutable');
      });
    });

    // ===========================================================================
    // 7. Cross-Casino Isolation
    // ===========================================================================

    describe('Cross-Casino Isolation', () => {
      it('pit_boss CANNOT SELECT mtl_entry from another casino', async () => {
        const { data, error } = await pitBossClient
          .from('mtl_entry')
          .select('*')
          .eq('id', testEntry2Id); // Entry from Casino 2

        // Should return empty - RLS filters out cross-casino data
        expect(error).toBeNull();
        expect(data).toEqual([]);
      });

      it('pit_boss CANNOT INSERT mtl_entry to another casino', async () => {
        const { error } = await pitBossClient.from('mtl_entry').insert({
          casino_id: testCasino2Id, // Different casino!
          patron_uuid: testPlayer2Id,
          staff_id: testPitBossId,
          amount: 1000,
          direction: 'in',
          txn_type: 'buy_in',
          source: 'table',
          idempotency_key: `rls-mtl-cross-insert-${Date.now()}`,
        });

        // Should fail with RLS violation
        expect(error).not.toBeNull();
      });

      it('pit_boss CANNOT add audit_note to entry from another casino', async () => {
        const { error } = await pitBossClient.from('mtl_audit_note').insert({
          mtl_entry_id: testEntry2Id, // Entry from Casino 2!
          staff_id: testPitBossId,
          note: 'Should not be allowed',
        });

        // Should fail with RLS violation
        expect(error).not.toBeNull();
      });

      it('admin CANNOT access data from another casino', async () => {
        const { data, error } = await adminClient
          .from('mtl_entry')
          .select('*')
          .eq('casino_id', testCasino2Id);

        // Should return empty - admin is still casino-scoped per ADR-025 INV-5
        expect(error).toBeNull();
        expect(data).toEqual([]);
      });
    });

    // ===========================================================================
    // 8. Gaming Day Summary View Access
    // ===========================================================================

    describe('mtl_gaming_day_summary View Access', () => {
      it('pit_boss can SELECT from mtl_gaming_day_summary', async () => {
        const { data, error } = await pitBossClient
          .from('mtl_gaming_day_summary')
          .select('*')
          .eq('casino_id', testCasino1Id)
          .limit(5);

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        // View inherits RLS from underlying mtl_entry table
      });

      it('admin can SELECT from mtl_gaming_day_summary', async () => {
        const { data, error } = await adminClient
          .from('mtl_gaming_day_summary')
          .select('*')
          .eq('casino_id', testCasino1Id)
          .limit(5);

        expect(error).toBeNull();
        expect(data).not.toBeNull();
      });

      it('cashier can SELECT from mtl_gaming_day_summary (inherits mtl_entry access)', async () => {
        const { data, error } = await cashierClient
          .from('mtl_gaming_day_summary')
          .select('*')
          .eq('casino_id', testCasino1Id)
          .limit(5);

        // Note: View inherits RLS from mtl_entry which now allows cashier SELECT
        // Gaming Day Summary dashboard UI gating is at route level, not RLS
        expect(error).toBeNull();
        expect(data).not.toBeNull();
      });
    });
  },
);
