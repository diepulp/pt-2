/** @jest-environment node */

/**
 * Table Session Lifecycle Integration Tests
 *
 * Integration tests for table session state machine operations.
 * Tests state transitions, constraints, and RLS policies.
 *
 * State machine: OPEN → ACTIVE → RUNDOWN → CLOSED
 *   - rpc_open_table_session → creates in OPEN state
 *   - rpc_activate_table_session → transitions OPEN → ACTIVE
 *   - rpc_start_table_rundown → transitions ACTIVE → RUNDOWN
 *   - rpc_close_table_session → transitions ACTIVE|RUNDOWN → CLOSED
 *   - OPEN sessions can be cancelled with close_reason='cancelled'
 *
 * Auth model: ADR-024 Mode C — authenticated anon clients carry JWT with staff_id
 * in app_metadata; set_rls_context_from_staff() derives context server-side.
 *
 * PREREQUISITES:
 * - Migrations must be applied including table_session and RPCs
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable set
 *
 * @see PRD-TABLE-SESSION-LIFECYCLE-MVP
 * @see ADR-024 (authoritative context derivation)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Skip integration tests if environment not configured
const isIntegrationEnvironment =
  supabaseUrl &&
  SERVICE_ROLE_KEY &&
  ANON_KEY &&
  (process.env.RUN_INTEGRATION_TESTS === 'true' ||
    process.env.RUN_INTEGRATION_TESTS === '1');

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration('Table Session Lifecycle Integration Tests', () => {
  // setupClient: service-role, used only for fixture management (bypasses RLS)
  let setupClient: SupabaseClient<Database>;
  // Mode C authenticated anon clients for business operations
  let pitBossClient: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;

  // Test data IDs
  let companyId: string;
  let casinoId: string;
  let pitBossId: string;
  let pitBossUserId: string;
  let adminId: string;
  let adminUserId: string;
  let dealerUserId: string;
  let tableId1: string;
  let tableId2: string;
  let dropEventId: string;
  let inventorySnapshotId: string;

  const pitBossEmail = `test-root-t3-ts-pitboss-${Date.now()}@example.com`;
  const adminEmail = `test-root-t3-ts-admin-${Date.now() + 1}@example.com`;
  const dealerEmail = `test-root-t3-ts-dealer-${Date.now() + 2}@example.com`;
  const testPassword = 'test-password';

  /**
   * Helper: open a session and activate it (OPEN → ACTIVE).
   * Returns the session ID after activation.
   */
  async function openAndActivateSession(
    client: SupabaseClient<Database>,
    tableId: string,
  ): Promise<string> {
    const { data: opened, error: openError } = await client.rpc(
      'rpc_open_table_session',
      { p_gaming_table_id: tableId },
    );
    if (openError) throw new Error(`Open failed: ${openError.message}`);

    const { error: activateError } = await client.rpc(
      'rpc_activate_table_session',
      {
        p_table_session_id: opened.id,
        p_opening_total_cents: 0,
        p_dealer_confirmed: true,
        p_opening_note: 'Test activation — par bootstrap',
      },
    );
    if (activateError)
      throw new Error(`Activate failed: ${activateError.message}`);

    return opened.id;
  }

  beforeAll(async () => {
    // === FIXTURE SETUP (service-role) ===
    setupClient = createClient<Database>(supabaseUrl, SERVICE_ROLE_KEY);

    // 1. Create auth users WITHOUT staff_id (two-phase ADR-024 setup)
    const { data: pitBossUser, error: pitBossUserError } =
      await setupClient.auth.admin.createUser({
        email: pitBossEmail,
        password: testPassword,
        email_confirm: true,
        app_metadata: { staff_role: 'pit_boss' },
      });
    if (pitBossUserError) throw pitBossUserError;
    pitBossUserId = pitBossUser.user.id;

    const { data: adminUser, error: adminUserError } =
      await setupClient.auth.admin.createUser({
        email: adminEmail,
        password: testPassword,
        email_confirm: true,
        app_metadata: { staff_role: 'admin' },
      });
    if (adminUserError) throw adminUserError;
    adminUserId = adminUser.user.id;

    const { data: dealerUser, error: dealerUserError } =
      await setupClient.auth.admin.createUser({
        email: dealerEmail,
        password: testPassword,
        email_confirm: true,
        app_metadata: { staff_role: 'dealer' },
      });
    if (dealerUserError) throw dealerUserError;
    dealerUserId = dealerUser.user.id;

    // 2. Create test company (ADR-043: company before casino)
    const { data: company, error: companyError } = await setupClient
      .from('company')
      .insert({ name: 'Session Test Company' })
      .select('id')
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    // 3. Create test casino with company_id
    const { data: casino, error: casinoError } = await setupClient
      .from('casino')
      .insert({ name: 'Session Test Casino', company_id: companyId })
      .select('id')
      .single();
    if (casinoError) throw casinoError;
    casinoId = casino.id;

    // Create casino_settings (required for compute_gaming_day)
    const { error: settingsError } = await setupClient
      .from('casino_settings')
      .insert({
        casino_id: casinoId,
        gaming_day_start_time: '06:00',
        timezone: 'America/Los_Angeles',
      });
    if (settingsError) throw settingsError;

    // 4. Create test staff records
    const { data: pitBoss, error: pitBossError } = await setupClient
      .from('staff')
      .insert({
        user_id: pitBossUserId,
        casino_id: casinoId,
        role: 'pit_boss',
        first_name: 'Session',
        last_name: 'Pit Boss',
        status: 'active',
      })
      .select('id')
      .single();
    if (pitBossError) throw pitBossError;
    pitBossId = pitBoss.id;

    const { data: admin, error: adminError } = await setupClient
      .from('staff')
      .insert({
        user_id: adminUserId,
        casino_id: casinoId,
        role: 'admin',
        first_name: 'Session',
        last_name: 'Admin',
        status: 'active',
      })
      .select('id')
      .single();
    if (adminError) throw adminError;
    adminId = admin.id;

    // Create test staff - dealer (should NOT be able to perform session operations)
    const { error: dealerError } = await setupClient
      .from('staff')
      .insert({
        user_id: dealerUserId,
        casino_id: casinoId,
        role: 'dealer',
        first_name: 'Session',
        last_name: 'Dealer',
        status: 'active',
      })
      .select('id')
      .single();
    if (dealerError) throw dealerError;

    // 5. Stamp staff_id into app_metadata (ADR-024 two-phase)
    await setupClient.auth.admin.updateUserById(pitBossUserId, {
      app_metadata: {
        staff_id: pitBossId,
        casino_id: casinoId,
        staff_role: 'pit_boss',
      },
    });
    await setupClient.auth.admin.updateUserById(adminUserId, {
      app_metadata: {
        staff_id: adminId,
        casino_id: casinoId,
        staff_role: 'admin',
      },
    });

    // 6. Sign in via throwaway clients to get JWTs
    const throwaway1 = createClient<Database>(supabaseUrl, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session1, error: signIn1Error } =
      await throwaway1.auth.signInWithPassword({
        email: pitBossEmail,
        password: testPassword,
      });
    if (signIn1Error || !session1.session)
      throw signIn1Error ?? new Error('Pit boss sign-in returned no session');

    const throwaway2 = createClient<Database>(supabaseUrl, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session2, error: signIn2Error } =
      await throwaway2.auth.signInWithPassword({
        email: adminEmail,
        password: testPassword,
      });
    if (signIn2Error || !session2.session)
      throw signIn2Error ?? new Error('Admin sign-in returned no session');

    // 7. Create Mode C authenticated anon clients (ADR-024)
    pitBossClient = createClient<Database>(supabaseUrl, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${session1.session.access_token}`,
        },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    adminClient = createClient<Database>(supabaseUrl, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${session2.session.access_token}`,
        },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 8. Create test tables (service-role for fixture setup)
    const { data: table1, error: table1Error } = await setupClient
      .from('gaming_table')
      .insert({
        casino_id: casinoId,
        label: 'SESSION-01',
        type: 'blackjack',
        pit: 'PIT-A',
        status: 'active',
      })
      .select('id')
      .single();
    if (table1Error) throw table1Error;
    tableId1 = table1.id;

    const { data: table2, error: table2Error } = await setupClient
      .from('gaming_table')
      .insert({
        casino_id: casinoId,
        label: 'SESSION-02',
        type: 'blackjack',
        pit: 'PIT-A',
        status: 'active',
      })
      .select('id')
      .single();
    if (table2Error) throw table2Error;
    tableId2 = table2.id;

    // 9. Create test drop event (for close operation)
    const { data: drop, error: dropError } = await setupClient
      .from('table_drop_event')
      .insert({
        casino_id: casinoId,
        table_id: tableId1,
        drop_box_id: `TEST-BOX-${Date.now()}`,
        removed_by: pitBossId,
      })
      .select('id')
      .single();
    if (dropError) throw dropError;
    dropEventId = drop.id;

    // 10. Create test inventory snapshot (for close operation)
    const { data: snapshot, error: snapshotError } = await setupClient
      .from('table_inventory_snapshot')
      .insert({
        casino_id: casinoId,
        table_id: tableId1,
        counted_by: pitBossId,
        chipset: { '1': 100, '5': 50, '25': 20 },
        snapshot_type: 'close',
      })
      .select('id')
      .single();
    if (snapshotError) throw snapshotError;
    inventorySnapshotId = snapshot.id;
  });

  afterAll(async () => {
    // Cleanup test data in reverse order of dependencies
    await setupClient.from('table_session').delete().eq('casino_id', casinoId);
    await setupClient
      .from('table_inventory_snapshot')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient
      .from('table_drop_event')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient.from('gaming_table').delete().eq('casino_id', casinoId);
    await setupClient.from('staff').delete().eq('casino_id', casinoId);
    await setupClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient.from('casino').delete().eq('id', casinoId);
    await setupClient.from('company').delete().eq('id', companyId);
    await setupClient.auth.admin.deleteUser(pitBossUserId);
    await setupClient.auth.admin.deleteUser(adminUserId);
    await setupClient.auth.admin.deleteUser(dealerUserId);
  });

  describe('rpc_open_table_session', () => {
    let createdSessionId: string | null = null;

    afterAll(async () => {
      // Cleanup any sessions created in this describe block
      if (createdSessionId) {
        await setupClient
          .from('table_session')
          .delete()
          .eq('id', createdSessionId);
      }
    });

    it('opens a new session in OPEN state', async () => {
      const { data, error } = await pitBossClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId2, // Use table2 to avoid conflicts
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.id).toBeDefined();
      expect(data.status).toBe('OPEN');
      expect(data.casino_id).toBe(casinoId);
      expect(data.gaming_table_id).toBe(tableId2);
      expect(data.opened_by_staff_id).toBe(pitBossId);
      expect(data.gaming_day).toBeDefined();
      expect(data.opened_at).toBeDefined();

      createdSessionId = data.id;
    });

    it('auto-computes gaming_day based on casino settings', async () => {
      // Clean up any existing session on table1
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId1)
        .neq('status', 'CLOSED');

      const { data, error } = await pitBossClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId1,
        },
      );

      expect(error).toBeNull();
      expect(data.gaming_day).toBeDefined();
      // Gaming day should be a valid date format (YYYY-MM-DD)
      expect(data.gaming_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Cleanup
      await setupClient.from('table_session').delete().eq('id', data.id);
    });

    it('allows admin to open session', async () => {
      // Clean up any existing session on table2
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      const { data, error } = await adminClient.rpc('rpc_open_table_session', {
        p_gaming_table_id: tableId2,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.opened_by_staff_id).toBe(adminId);

      // Cleanup
      await setupClient.from('table_session').delete().eq('id', data.id);
    });
  });

  describe('Double-open Prevention (Constraint Test)', () => {
    let existingSessionId: string;

    beforeAll(async () => {
      // Ensure no existing session on table1
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId1)
        .neq('status', 'CLOSED');

      // Create an OPEN session (constraint prevents second open even without activation)
      const { data } = await pitBossClient.rpc('rpc_open_table_session', {
        p_gaming_table_id: tableId1,
      });
      existingSessionId = data!.id;
    });

    afterAll(async () => {
      await setupClient
        .from('table_session')
        .delete()
        .eq('id', existingSessionId);
    });

    it('prevents opening second session for same table', async () => {
      const { error } = await pitBossClient.rpc('rpc_open_table_session', {
        p_gaming_table_id: tableId1,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('active_session_exists');
    });

    it('allows opening session for different table', async () => {
      // Clean up any existing session on table2
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      const { data, error } = await pitBossClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId2,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.gaming_table_id).toBe(tableId2);

      // Cleanup
      await setupClient.from('table_session').delete().eq('id', data.id);
    });
  });

  describe('State Machine Transitions', () => {
    let sessionId: string;

    beforeAll(async () => {
      // Ensure no existing session on table1
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId1)
        .neq('status', 'CLOSED');

      // Create and activate a session (OPEN → ACTIVE)
      sessionId = await openAndActivateSession(pitBossClient, tableId1);
    });

    afterAll(async () => {
      await setupClient.from('table_session').delete().eq('id', sessionId);
    });

    it('transitions ACTIVE → RUNDOWN', async () => {
      const { data, error } = await pitBossClient.rpc(
        'rpc_start_table_rundown',
        {
          p_table_session_id: sessionId,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.status).toBe('RUNDOWN');
      expect(data.rundown_started_at).toBeDefined();
      expect(data.rundown_started_by_staff_id).toBe(pitBossId);
    });

    it('prevents RUNDOWN → RUNDOWN (already in rundown)', async () => {
      const { error } = await pitBossClient.rpc('rpc_start_table_rundown', {
        p_table_session_id: sessionId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('invalid_state_transition');
    });

    it('transitions RUNDOWN → CLOSED with drop_event_id', async () => {
      const { data, error } = await pitBossClient.rpc(
        'rpc_close_table_session',
        {
          p_table_session_id: sessionId,
          p_drop_event_id: dropEventId,
          p_notes: 'Test close with drop event',
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.status).toBe('CLOSED');
      expect(data.closed_at).toBeDefined();
      expect(data.closed_by_staff_id).toBe(pitBossId);
      expect(data.drop_event_id).toBe(dropEventId);
      expect(data.notes).toBe('Test close with drop event');
    });
  });

  describe('Close Session Artifact Requirements', () => {
    let sessionId: string;

    beforeAll(async () => {
      // Create a fresh session in RUNDOWN state: OPEN → ACTIVE → RUNDOWN
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      sessionId = await openAndActivateSession(pitBossClient, tableId2);

      await pitBossClient.rpc('rpc_start_table_rundown', {
        p_table_session_id: sessionId,
      });
    });

    afterAll(async () => {
      await setupClient.from('table_session').delete().eq('id', sessionId);
    });

    it('rejects close without any artifact', async () => {
      const { error } = await pitBossClient.rpc('rpc_close_table_session', {
        p_table_session_id: sessionId,
        // No drop_event_id or closing_inventory_snapshot_id
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('missing_closing_artifact');
    });

    it('accepts close with closing_inventory_snapshot_id', async () => {
      const { data, error } = await pitBossClient.rpc(
        'rpc_close_table_session',
        {
          p_table_session_id: sessionId,
          p_closing_inventory_snapshot_id: inventorySnapshotId,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.status).toBe('CLOSED');
      expect(data.closing_inventory_snapshot_id).toBe(inventorySnapshotId);
    });
  });

  describe('rpc_get_current_table_session', () => {
    let activeSessionId: string;

    beforeAll(async () => {
      // Create and activate session on table1 (OPEN → ACTIVE)
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId1)
        .neq('status', 'CLOSED');

      activeSessionId = await openAndActivateSession(pitBossClient, tableId1);
    });

    afterAll(async () => {
      await setupClient
        .from('table_session')
        .delete()
        .eq('id', activeSessionId);
    });

    it('returns current session for table with active session', async () => {
      const { data, error } = await pitBossClient.rpc(
        'rpc_get_current_table_session',
        {
          p_gaming_table_id: tableId1,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.id).toBe(activeSessionId);
      expect(data.status).not.toBe('CLOSED');
    });

    it('returns null/empty for table without active session', async () => {
      // Ensure table2 has no active session
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      const { data, error } = await pitBossClient.rpc(
        'rpc_get_current_table_session',
        {
          p_gaming_table_id: tableId2,
        },
      );

      expect(error).toBeNull();
      // RPC returns a row with all null fields when no session found
      if (data === null) {
        expect(data).toBeNull();
      } else {
        expect(data.id).toBeNull();
      }
    });
  });

  describe('Shortcut Close (ACTIVE → CLOSED)', () => {
    let sessionId: string;

    beforeAll(async () => {
      // Create and activate a fresh session (OPEN → ACTIVE, not in RUNDOWN)
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      sessionId = await openAndActivateSession(pitBossClient, tableId2);
    });

    afterAll(async () => {
      await setupClient.from('table_session').delete().eq('id', sessionId);
    });

    it('allows closing directly from ACTIVE state (shortcut)', async () => {
      const { data, error } = await pitBossClient.rpc(
        'rpc_close_table_session',
        {
          p_table_session_id: sessionId,
          p_drop_event_id: dropEventId,
          p_notes: 'Shortcut close from ACTIVE',
        },
      );

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.status).toBe('CLOSED');
      // Rundown fields should NOT be set for shortcut close
      expect(data.rundown_started_at).toBeNull();
      expect(data.rundown_started_by_staff_id).toBeNull();
    });
  });

  describe('Invalid State Transitions', () => {
    let closedSessionId: string;

    beforeAll(async () => {
      // Create, activate, and immediately close a session
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      const sid = await openAndActivateSession(pitBossClient, tableId2);

      const { data: closed, error: closeError } = await pitBossClient.rpc(
        'rpc_close_table_session',
        {
          p_table_session_id: sid,
          p_drop_event_id: dropEventId,
        },
      );
      if (closeError) throw new Error(`Close failed: ${closeError.message}`);

      closedSessionId = closed!.id;
    });

    afterAll(async () => {
      await setupClient
        .from('table_session')
        .delete()
        .eq('id', closedSessionId);
    });

    it('prevents rundown on CLOSED session', async () => {
      const { error } = await pitBossClient.rpc('rpc_start_table_rundown', {
        p_table_session_id: closedSessionId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('invalid_state_transition');
    });

    it('prevents close on already CLOSED session', async () => {
      const { error } = await pitBossClient.rpc('rpc_close_table_session', {
        p_table_session_id: closedSessionId,
        p_drop_event_id: dropEventId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('invalid_state_transition');
    });

    it('rejects non-existent session ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const { error } = await pitBossClient.rpc('rpc_start_table_rundown', {
        p_table_session_id: fakeId,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('session_not_found');
    });
  });

  describe('Reopen After Close', () => {
    it('allows opening new session after previous is closed', async () => {
      // Clean up any existing sessions
      await setupClient
        .from('table_session')
        .delete()
        .eq('gaming_table_id', tableId2)
        .neq('status', 'CLOSED');

      // Open and activate first session
      const session1Id = await openAndActivateSession(pitBossClient, tableId2);

      // Close it
      const { error: closeError } = await pitBossClient.rpc(
        'rpc_close_table_session',
        {
          p_table_session_id: session1Id,
          p_drop_event_id: dropEventId,
        },
      );
      expect(closeError).toBeNull();

      // Open second session - should succeed
      const { data: session2, error } = await pitBossClient.rpc(
        'rpc_open_table_session',
        {
          p_gaming_table_id: tableId2,
        },
      );

      expect(error).toBeNull();
      expect(session2).toBeDefined();
      expect(session2.id).not.toBe(session1Id);
      expect(session2.status).toBe('OPEN');

      // Cleanup
      await setupClient.from('table_session').delete().eq('id', session2.id);
    });
  });
});
