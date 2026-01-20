/**
 * RLS MTL Integration Tests (PRD-005 WS7)
 *
 * Tests RLS policy enforcement for mtl_entry and mtl_audit_note tables.
 * Verifies authorization matrix per ADR-025 and append-only enforcement.
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
 *
 * @see docs/10-prd/PRD-005-mtl-service.md
 * @see docs/80-adrs/ADR-025-mtl-authorization-model.md
 * @see services/mtl/index.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
// eslint-disable-next-line no-restricted-imports -- Integration tests require direct Supabase client
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';
import { injectRLSContext } from '../rls-context';
import type { RLSContext } from '../rls-context';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Skip integration tests if database credentials not available
const shouldSkip = !supabaseUrl || !supabaseServiceKey;

// Conditionally run describe block
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('RLS MTL Policies (PRD-005 WS7)', () => {
  let serviceClient: SupabaseClient<Database>; // Service role bypasses RLS
  let pitBossClient: SupabaseClient<Database>; // Authenticated as pit_boss
  let cashierClient: SupabaseClient<Database>; // Authenticated as cashier
  let adminClient: SupabaseClient<Database>; // Authenticated as admin
  let dealerClient: SupabaseClient<Database>; // Authenticated as dealer (no access)
  let crossCasinoClient: SupabaseClient<Database>; // Different casino context

  // Test data IDs
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

  beforeAll(async () => {
    // Service client for setup (bypasses RLS)
    serviceClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // =========================================================================
    // Create Test Users
    // =========================================================================

    const createOrGetUser = async (email: string): Promise<string> => {
      const { data: authUser, error: authError } =
        await serviceClient.auth.admin.createUser({
          email,
          password: 'test-password-12345',
          email_confirm: true,
        });

      if (authError) {
        const { data: existingUsers } =
          await serviceClient.auth.admin.listUsers();
        const existing = existingUsers?.users?.find((u) => u.email === email);
        if (existing) return existing.id;
        throw authError;
      }
      return authUser.user.id;
    };

    testUser1Id = await createOrGetUser('test-rls-mtl-pitboss@example.com');
    testUser2Id = await createOrGetUser('test-rls-mtl-cashier@example.com');
    testUser3Id = await createOrGetUser('test-rls-mtl-admin@example.com');
    testUser4Id = await createOrGetUser('test-rls-mtl-dealer@example.com');
    testUser5Id = await createOrGetUser('test-rls-mtl-crosscasino@example.com');

    // =========================================================================
    // Create Test Casinos
    // =========================================================================

    const { data: casino1, error: casino1Error } = await serviceClient
      .from('casino')
      .insert({
        name: 'RLS MTL Test Casino 1',
        status: 'active',
      })
      .select()
      .single();

    if (casino1Error) throw casino1Error;
    testCasino1Id = casino1.id;

    const { data: casino2, error: casino2Error } = await serviceClient
      .from('casino')
      .insert({
        name: 'RLS MTL Test Casino 2',
        status: 'active',
      })
      .select()
      .single();

    if (casino2Error) throw casino2Error;
    testCasino2Id = casino2.id;

    // Create casino settings (required for gaming_day trigger)
    await serviceClient.from('casino_settings').insert([
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

    const { data: pitBoss, error: pitBossError } = await serviceClient
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

    const { data: cashier, error: cashierError } = await serviceClient
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

    const { data: admin, error: adminError } = await serviceClient
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

    const { data: dealer, error: dealerError } = await serviceClient
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
    const { data: crossCasinoStaff, error: crossError } = await serviceClient
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
    // Create Test Players
    // =========================================================================

    const { data: player1, error: player1Error } = await serviceClient
      .from('player')
      .insert({
        first_name: 'MTLTest',
        last_name: 'Player1',
      })
      .select()
      .single();

    if (player1Error) throw player1Error;
    testPlayer1Id = player1.id;

    const { data: player2, error: player2Error } = await serviceClient
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
    await serviceClient.from('player_casino').insert([
      { player_id: testPlayer1Id, casino_id: testCasino1Id },
      { player_id: testPlayer2Id, casino_id: testCasino2Id },
    ]);

    // =========================================================================
    // Create Test MTL Entries (via service role to bypass RLS for setup)
    // =========================================================================

    const { data: entry1, error: entry1Error } = await serviceClient
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

    const { data: entry2, error: entry2Error } = await serviceClient
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

    const { data: auditNote1, error: auditNote1Error } = await serviceClient
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

    // =========================================================================
    // Create Authenticated Clients
    // =========================================================================

    pitBossClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
    cashierClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
    adminClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
    dealerClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
    crossCasinoClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
  });

  afterAll(async () => {
    // Clean up test data (in reverse order of creation)
    // Note: Can't delete MTL entries/notes due to append-only triggers,
    // so we use service role with trigger bypass

    // Disable triggers for cleanup (ignore errors if RPC doesn't exist)
    try {
      await serviceClient.rpc('exec_sql', {
        sql: 'ALTER TABLE mtl_audit_note DISABLE TRIGGER trg_mtl_audit_note_no_delete',
      });
    } catch {
      /* ignore */
    }
    try {
      await serviceClient.rpc('exec_sql', {
        sql: 'ALTER TABLE mtl_entry DISABLE TRIGGER trg_mtl_entry_no_delete',
      });
    } catch {
      /* ignore */
    }

    try {
      await serviceClient
        .from('mtl_audit_note')
        .delete()
        .eq('id', testAuditNote1Id);
    } catch {
      /* ignore */
    }
    try {
      await serviceClient.from('mtl_entry').delete().eq('id', testEntry1Id);
    } catch {
      /* ignore */
    }
    try {
      await serviceClient.from('mtl_entry').delete().eq('id', testEntry2Id);
    } catch {
      /* ignore */
    }

    // Re-enable triggers
    try {
      await serviceClient.rpc('exec_sql', {
        sql: 'ALTER TABLE mtl_audit_note ENABLE TRIGGER trg_mtl_audit_note_no_delete',
      });
    } catch {
      /* ignore */
    }
    try {
      await serviceClient.rpc('exec_sql', {
        sql: 'ALTER TABLE mtl_entry ENABLE TRIGGER trg_mtl_entry_no_delete',
      });
    } catch {
      /* ignore */
    }

    // Clean up other test data
    await serviceClient
      .from('player_casino')
      .delete()
      .eq('player_id', testPlayer1Id);
    await serviceClient
      .from('player_casino')
      .delete()
      .eq('player_id', testPlayer2Id);
    await serviceClient.from('player').delete().eq('id', testPlayer1Id);
    await serviceClient.from('player').delete().eq('id', testPlayer2Id);
    await serviceClient.from('staff').delete().eq('id', testPitBossId);
    await serviceClient.from('staff').delete().eq('id', testCashierId);
    await serviceClient.from('staff').delete().eq('id', testAdminId);
    await serviceClient.from('staff').delete().eq('id', testDealerId);
    await serviceClient.from('staff').delete().eq('id', testCrossCasinoStaffId);
    await serviceClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasino1Id);
    await serviceClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasino2Id);
    await serviceClient.from('casino').delete().eq('id', testCasino1Id);
    await serviceClient.from('casino').delete().eq('id', testCasino2Id);

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
          await serviceClient.auth.admin.deleteUser(userId);
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
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-pitboss-select');

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
      const context: RLSContext = {
        actorId: testCashierId,
        casinoId: testCasino1Id,
        staffRole: 'cashier',
      };

      await injectRLSContext(cashierClient, context, 'mtl-cashier-select');

      const { data, error } = await cashierClient
        .from('mtl_entry')
        .select('*')
        .eq('id', testEntry1Id);

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.length).toBe(1);
    });

    it('admin can SELECT mtl_entry', async () => {
      const context: RLSContext = {
        actorId: testAdminId,
        casinoId: testCasino1Id,
        staffRole: 'admin',
      };

      await injectRLSContext(adminClient, context, 'mtl-admin-select');

      const { data, error } = await adminClient
        .from('mtl_entry')
        .select('*')
        .eq('id', testEntry1Id);

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.length).toBe(1);
    });

    it('dealer CANNOT SELECT mtl_entry', async () => {
      const context: RLSContext = {
        actorId: testDealerId,
        casinoId: testCasino1Id,
        staffRole: 'dealer',
      };

      await injectRLSContext(dealerClient, context, 'mtl-dealer-select');

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
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-pitboss-insert');

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
      const context: RLSContext = {
        actorId: testCashierId,
        casinoId: testCasino1Id,
        staffRole: 'cashier',
      };

      await injectRLSContext(cashierClient, context, 'mtl-cashier-insert');

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
      const context: RLSContext = {
        actorId: testAdminId,
        casinoId: testCasino1Id,
        staffRole: 'admin',
      };

      await injectRLSContext(adminClient, context, 'mtl-admin-insert');

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
      const context: RLSContext = {
        actorId: testDealerId,
        casinoId: testCasino1Id,
        staffRole: 'dealer',
      };

      await injectRLSContext(dealerClient, context, 'mtl-dealer-insert');

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
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-pitboss-update');

      const { error } = await pitBossClient
        .from('mtl_entry')
        .update({ amount: 9999 })
        .eq('id', testEntry1Id);

      // Should fail - no UPDATE policy exists
      expect(error).not.toBeNull();
    });

    it('admin CANNOT UPDATE mtl_entry', async () => {
      const context: RLSContext = {
        actorId: testAdminId,
        casinoId: testCasino1Id,
        staffRole: 'admin',
      };

      await injectRLSContext(adminClient, context, 'mtl-admin-update');

      const { error } = await adminClient
        .from('mtl_entry')
        .update({ amount: 9999 })
        .eq('id', testEntry1Id);

      // Should fail - no UPDATE policy exists
      expect(error).not.toBeNull();
    });

    it('pit_boss CANNOT DELETE mtl_entry', async () => {
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-pitboss-delete');

      const { error } = await pitBossClient
        .from('mtl_entry')
        .delete()
        .eq('id', testEntry1Id);

      // Should fail - no DELETE policy exists
      expect(error).not.toBeNull();
    });

    it('admin CANNOT DELETE mtl_entry', async () => {
      const context: RLSContext = {
        actorId: testAdminId,
        casinoId: testCasino1Id,
        staffRole: 'admin',
      };

      await injectRLSContext(adminClient, context, 'mtl-admin-delete');

      const { error } = await adminClient
        .from('mtl_entry')
        .delete()
        .eq('id', testEntry1Id);

      // Should fail - no DELETE policy exists
      expect(error).not.toBeNull();
    });

    it('BEFORE triggers block UPDATE via service_role', async () => {
      // This tests the belt+suspenders layer - triggers as final defense
      const { error } = await serviceClient
        .from('mtl_entry')
        .update({ amount: 9999 })
        .eq('id', testEntry1Id);

      // Should fail with trigger exception
      expect(error).not.toBeNull();
      expect(error?.message).toContain('immutable');
    });

    it('BEFORE triggers block DELETE via service_role', async () => {
      // This tests the belt+suspenders layer - triggers as final defense
      const { error } = await serviceClient
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
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-note-pitboss-select');

      const { data, error } = await pitBossClient
        .from('mtl_audit_note')
        .select('*')
        .eq('id', testAuditNote1Id);

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.length).toBe(1);
    });

    it('admin can SELECT mtl_audit_note', async () => {
      const context: RLSContext = {
        actorId: testAdminId,
        casinoId: testCasino1Id,
        staffRole: 'admin',
      };

      await injectRLSContext(adminClient, context, 'mtl-note-admin-select');

      const { data, error } = await adminClient
        .from('mtl_audit_note')
        .select('*')
        .eq('id', testAuditNote1Id);

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.length).toBe(1);
    });

    it('cashier CANNOT SELECT mtl_audit_note', async () => {
      const context: RLSContext = {
        actorId: testCashierId,
        casinoId: testCasino1Id,
        staffRole: 'cashier',
      };

      await injectRLSContext(cashierClient, context, 'mtl-note-cashier-select');

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
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-note-pitboss-insert');

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
      const context: RLSContext = {
        actorId: testAdminId,
        casinoId: testCasino1Id,
        staffRole: 'admin',
      };

      await injectRLSContext(adminClient, context, 'mtl-note-admin-insert');

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
      const context: RLSContext = {
        actorId: testCashierId,
        casinoId: testCasino1Id,
        staffRole: 'cashier',
      };

      await injectRLSContext(cashierClient, context, 'mtl-note-cashier-insert');

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
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-note-pitboss-update');

      const { error } = await pitBossClient
        .from('mtl_audit_note')
        .update({ note: 'Modified note' })
        .eq('id', testAuditNote1Id);

      // Should fail - no UPDATE policy exists
      expect(error).not.toBeNull();
    });

    it('admin CANNOT UPDATE mtl_audit_note', async () => {
      const context: RLSContext = {
        actorId: testAdminId,
        casinoId: testCasino1Id,
        staffRole: 'admin',
      };

      await injectRLSContext(adminClient, context, 'mtl-note-admin-update');

      const { error } = await adminClient
        .from('mtl_audit_note')
        .update({ note: 'Modified note' })
        .eq('id', testAuditNote1Id);

      // Should fail - no UPDATE policy exists
      expect(error).not.toBeNull();
    });

    it('pit_boss CANNOT DELETE mtl_audit_note', async () => {
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-note-pitboss-delete');

      const { error } = await pitBossClient
        .from('mtl_audit_note')
        .delete()
        .eq('id', testAuditNote1Id);

      // Should fail - no DELETE policy exists
      expect(error).not.toBeNull();
    });

    it('admin CANNOT DELETE mtl_audit_note', async () => {
      const context: RLSContext = {
        actorId: testAdminId,
        casinoId: testCasino1Id,
        staffRole: 'admin',
      };

      await injectRLSContext(adminClient, context, 'mtl-note-admin-delete');

      const { error } = await adminClient
        .from('mtl_audit_note')
        .delete()
        .eq('id', testAuditNote1Id);

      // Should fail - no DELETE policy exists
      expect(error).not.toBeNull();
    });

    it('BEFORE triggers block UPDATE on mtl_audit_note via service_role', async () => {
      const { error } = await serviceClient
        .from('mtl_audit_note')
        .update({ note: 'Modified note' })
        .eq('id', testAuditNote1Id);

      // Should fail with trigger exception
      expect(error).not.toBeNull();
      expect(error?.message).toContain('immutable');
    });

    it('BEFORE triggers block DELETE on mtl_audit_note via service_role', async () => {
      const { error } = await serviceClient
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
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-cross-select');

      const { data, error } = await pitBossClient
        .from('mtl_entry')
        .select('*')
        .eq('id', testEntry2Id); // Entry from Casino 2

      // Should return empty - RLS filters out cross-casino data
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('pit_boss CANNOT INSERT mtl_entry to another casino', async () => {
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-cross-insert');

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
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-cross-note-insert');

      const { error } = await pitBossClient.from('mtl_audit_note').insert({
        mtl_entry_id: testEntry2Id, // Entry from Casino 2!
        staff_id: testPitBossId,
        note: 'Should not be allowed',
      });

      // Should fail with RLS violation
      expect(error).not.toBeNull();
    });

    it('admin CANNOT access data from another casino', async () => {
      const context: RLSContext = {
        actorId: testAdminId,
        casinoId: testCasino1Id,
        staffRole: 'admin',
      };

      await injectRLSContext(adminClient, context, 'mtl-admin-cross');

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
      const context: RLSContext = {
        actorId: testPitBossId,
        casinoId: testCasino1Id,
        staffRole: 'pit_boss',
      };

      await injectRLSContext(pitBossClient, context, 'mtl-summary-pitboss');

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
      const context: RLSContext = {
        actorId: testAdminId,
        casinoId: testCasino1Id,
        staffRole: 'admin',
      };

      await injectRLSContext(adminClient, context, 'mtl-summary-admin');

      const { data, error } = await adminClient
        .from('mtl_gaming_day_summary')
        .select('*')
        .eq('casino_id', testCasino1Id)
        .limit(5);

      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    it('cashier can SELECT from mtl_gaming_day_summary (inherits mtl_entry access)', async () => {
      const context: RLSContext = {
        actorId: testCashierId,
        casinoId: testCasino1Id,
        staffRole: 'cashier',
      };

      await injectRLSContext(cashierClient, context, 'mtl-summary-cashier');

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
});
