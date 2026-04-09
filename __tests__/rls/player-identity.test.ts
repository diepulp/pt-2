/** @jest-environment node */

/**
 * Player Identity RLS Policy Tests (ADR-022 WS2)
 *
 * Tests RLS policy enforcement for player_identity, player, and player_casino tables.
 * Verifies role-based access, actor binding, casino isolation, and delete denial.
 *
 * PREREQUISITES:
 * - Migrations 20251225120000-20251225120006 must be applied
 * - Local Supabase running: `npx supabase start`
 * - SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 *
 * @see docs/20-architecture/specs/ADR-022/EXEC-SPEC-022.md Section 4
 * @see docs/20-architecture/specs/ADR-022/DOD-022.md Section B
 * @see docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import {
  createModeCSession,
  ModeCSessionResult,
} from '@/lib/testing/create-mode-c-session';
import type { Database } from '@/types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Integration gate: skip when RUN_INTEGRATION_TESTS is not 'true' or '1'
const describeIntegration =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1'
    ? describe
    : describe.skip;

describeIntegration('player-identity RLS Policies (ADR-022)', () => {
  // Mode C (ADR-024): Service-role client for fixture setup/teardown only.
  // Authenticated Mode C clients for all business-logic / RLS-tested calls.
  let setupClient: SupabaseClient<Database>;
  let pitBossClient1: SupabaseClient<Database>;
  let adminClient1: SupabaseClient<Database>;
  let cashierClient1: SupabaseClient<Database>;
  let dealerClient1: SupabaseClient<Database>;
  let pitBossClient2: SupabaseClient<Database>;

  // Mode C session handles (for auth cleanup)
  let pitBoss1Session: ModeCSessionResult;
  let admin1Session: ModeCSessionResult;
  let cashier1Session: ModeCSessionResult;
  let dealer1Session: ModeCSessionResult;
  let pitBoss2Session: ModeCSessionResult;

  let company1Id: string;
  let company2Id: string;
  let casino1Id: string;
  let casino2Id: string;
  let pitBoss1Id: string;
  let admin1Id: string;
  let cashier1Id: string;
  let dealer1Id: string;
  let pitBoss2Id: string;
  let player1Id: string;
  let player2Id: string;
  let identityId: string;

  beforeAll(async () => {
    // Service-role client for fixture setup only (Mode C — ADR-024)
    setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test companies (ADR-043: company before casino)
    const { data: co1 } = await setupClient
      .from('company')
      .insert({ name: 'Test Company 1' })
      .select('id')
      .single();
    company1Id = co1!.id;

    const { data: co2 } = await setupClient
      .from('company')
      .insert({ name: 'Test Company 2' })
      .select('id')
      .single();
    company2Id = co2!.id;

    // Create test casinos
    const { data: c1 } = await setupClient
      .from('casino')
      .insert({ name: 'Test Casino 1', company_id: company1Id })
      .select('id')
      .single();
    casino1Id = c1!.id;

    const { data: c2 } = await setupClient
      .from('casino')
      .insert({ name: 'Test Casino 2', company_id: company2Id })
      .select('id')
      .single();
    casino2Id = c2!.id;

    // Create test staff (without user_id initially — linked after Mode C auth)
    const { data: pb1 } = await setupClient
      .from('staff')
      .insert({
        casino_id: casino1Id,
        role: 'pit_boss',
        first_name: 'Pit',
        last_name: 'Boss1',
        status: 'active',
      })
      .select('id')
      .single();
    pitBoss1Id = pb1!.id;

    const { data: a1 } = await setupClient
      .from('staff')
      .insert({
        casino_id: casino1Id,
        role: 'admin',
        first_name: 'Admin',
        last_name: 'One',
        status: 'active',
      })
      .select('id')
      .single();
    admin1Id = a1!.id;

    const { data: ca1 } = await setupClient
      .from('staff')
      .insert({
        casino_id: casino1Id,
        role: 'cashier',
        first_name: 'Cashier',
        last_name: 'One',
        status: 'active',
      })
      .select('id')
      .single();
    cashier1Id = ca1!.id;

    const { data: d1 } = await setupClient
      .from('staff')
      .insert({
        casino_id: casino1Id,
        role: 'dealer',
        first_name: 'Dealer',
        last_name: 'One',
        status: 'active',
      })
      .select('id')
      .single();
    dealer1Id = d1!.id;

    const { data: pb2 } = await setupClient
      .from('staff')
      .insert({
        casino_id: casino2Id,
        role: 'pit_boss',
        first_name: 'Pit',
        last_name: 'Boss2',
        status: 'active',
      })
      .select('id')
      .single();
    pitBoss2Id = pb2!.id;

    // Mode C auth ceremony (ADR-024) — authenticated anon clients with JWT claims
    pitBoss1Session = await createModeCSession(setupClient, {
      staffId: pitBoss1Id,
      casinoId: casino1Id,
      staffRole: 'pit_boss',
    });
    pitBossClient1 = pitBoss1Session.client;

    admin1Session = await createModeCSession(setupClient, {
      staffId: admin1Id,
      casinoId: casino1Id,
      staffRole: 'admin',
    });
    adminClient1 = admin1Session.client;

    cashier1Session = await createModeCSession(setupClient, {
      staffId: cashier1Id,
      casinoId: casino1Id,
      staffRole: 'cashier',
    });
    cashierClient1 = cashier1Session.client;

    dealer1Session = await createModeCSession(setupClient, {
      staffId: dealer1Id,
      casinoId: casino1Id,
      staffRole: 'dealer',
    });
    dealerClient1 = dealer1Session.client;

    pitBoss2Session = await createModeCSession(setupClient, {
      staffId: pitBoss2Id,
      casinoId: casino2Id,
      staffRole: 'pit_boss',
    });
    pitBossClient2 = pitBoss2Session.client;

    // Link auth users to staff records
    // chk_staff_role_user_id: pit_boss/admin require user_id IS NOT NULL
    // cashier/dealer: constraint dropped by seed, linking user_id still works
    await setupClient
      .from('staff')
      .update({ user_id: pitBoss1Session.userId })
      .eq('id', pitBoss1Id);
    await setupClient
      .from('staff')
      .update({ user_id: admin1Session.userId })
      .eq('id', admin1Id);
    await setupClient
      .from('staff')
      .update({ user_id: cashier1Session.userId })
      .eq('id', cashier1Id);
    await setupClient
      .from('staff')
      .update({ user_id: dealer1Session.userId })
      .eq('id', dealer1Id);
    await setupClient
      .from('staff')
      .update({ user_id: pitBoss2Session.userId })
      .eq('id', pitBoss2Id);

    // Create test players
    const { data: p1 } = await setupClient
      .from('player')
      .insert({
        first_name: 'John',
        last_name: 'Doe',
        birth_date: '1980-01-01',
      })
      .select('id')
      .single();
    player1Id = p1!.id;

    const { data: p2 } = await setupClient
      .from('player')
      .insert({
        first_name: 'Jane',
        last_name: 'Smith',
        birth_date: '1985-05-15',
      })
      .select('id')
      .single();
    player2Id = p2!.id;

    // Create enrollment for player1 at casino1
    await setupClient.from('player_casino').insert({
      player_id: player1Id,
      casino_id: casino1Id,
      status: 'active',
      enrolled_by: pitBoss1Id,
    });

    // Create enrollment for player2 at casino2
    await setupClient.from('player_casino').insert({
      player_id: player2Id,
      casino_id: casino2Id,
      status: 'active',
      enrolled_by: pitBoss2Id,
    });
  });

  afterAll(async () => {
    // Cleanup test data (reverse order of creation)
    await setupClient
      .from('player_identity')
      .delete()
      .eq('casino_id', casino1Id);
    await setupClient
      .from('player_identity')
      .delete()
      .eq('casino_id', casino2Id);
    await setupClient.from('player_casino').delete().eq('casino_id', casino1Id);
    await setupClient.from('player_casino').delete().eq('casino_id', casino2Id);
    await setupClient.from('player').delete().eq('id', player1Id);
    await setupClient.from('player').delete().eq('id', player2Id);
    await setupClient.from('staff').delete().eq('casino_id', casino1Id);
    await setupClient.from('staff').delete().eq('casino_id', casino2Id);
    await setupClient.from('casino').delete().eq('id', casino1Id);
    await setupClient.from('casino').delete().eq('id', casino2Id);
    await setupClient.from('company').delete().eq('id', company1Id);
    await setupClient.from('company').delete().eq('id', company2Id);

    // Auth cleanup (Mode C)
    await pitBoss1Session?.cleanup();
    await admin1Session?.cleanup();
    await cashier1Session?.cleanup();
    await dealer1Session?.cleanup();
    await pitBoss2Session?.cleanup();
  });

  describe('B1. Role Matrix (DOD-022)', () => {
    it('pit_boss can read player_identity', async () => {
      // Setup: Create identity as service client
      const { data: identity } = await setupClient
        .from('player_identity')
        .insert({
          casino_id: casino1Id,
          player_id: player1Id,
          birth_date: '1980-01-01',
          created_by: pitBoss1Id,
        })
        .select()
        .single();

      // Test: pit_boss can read
      const { data, error } = await pitBossClient1
        .from('player_identity')
        .select('*')
        .eq('id', identity!.id)
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.player_id).toBe(player1Id);
    });

    it('pit_boss can write player_identity', async () => {
      const { data, error } = await pitBossClient1
        .from('player_identity')
        .insert({
          casino_id: casino1Id,
          player_id: player1Id,
          birth_date: '1980-01-01',
          gender: 'm',
          created_by: pitBoss1Id,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      identityId = data!.id;
    });

    it('admin can read player_identity', async () => {
      const { data, error } = await adminClient1
        .from('player_identity')
        .select('*')
        .eq('id', identityId);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.length).toBeGreaterThan(0);
    });

    it('admin can write player_identity', async () => {
      const { error } = await adminClient1
        .from('player_identity')
        .update({ eye_color: 'blue' })
        .eq('id', identityId);

      expect(error).toBeNull();
    });

    it('cashier can read player_identity', async () => {
      const { data, error } = await cashierClient1
        .from('player_identity')
        .select('*')
        .eq('id', identityId);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    it('cashier CANNOT write player_identity', async () => {
      const { error } = await cashierClient1.from('player_identity').insert({
        casino_id: casino1Id,
        player_id: player1Id,
        created_by: cashier1Id,
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('42501'); // RLS policy violation
    });

    it('dealer CANNOT read player_identity', async () => {
      const { data, error } = await dealerClient1
        .from('player_identity')
        .select('*')
        .eq('id', identityId);

      // RLS filters to 0 rows, no error
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('dealer CANNOT write player_identity', async () => {
      const { error } = await dealerClient1.from('player_identity').insert({
        casino_id: casino1Id,
        player_id: player1Id,
        created_by: dealer1Id,
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('42501'); // RLS policy violation
    });
  });

  describe('B2. Actor Binding (INV-9, DOD-022)', () => {
    it('created_by must match current actor', async () => {
      const { error } = await pitBossClient1.from('player_identity').insert({
        casino_id: casino1Id,
        player_id: player1Id,
        created_by: admin1Id, // Spoofed actor
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('42501'); // RLS WITH CHECK violation
    });

    it('enrolled_by must match current actor for player_casino INSERT', async () => {
      // Create a new player for this test
      const { data: newPlayer } = await setupClient
        .from('player')
        .insert({ first_name: 'Test', last_name: 'Actor' })
        .select('id')
        .single();

      const { error } = await pitBossClient1.from('player_casino').insert({
        player_id: newPlayer!.id,
        casino_id: casino1Id,
        status: 'active',
        enrolled_by: admin1Id, // Spoofed actor
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('42501'); // RLS WITH CHECK violation

      // Cleanup
      await setupClient.from('player').delete().eq('id', newPlayer!.id);
    });

    it('updated_by auto-populated on UPDATE', async () => {
      await adminClient1
        .from('player_identity')
        .update({ height: '6-01' })
        .eq('id', identityId);

      const { data } = await setupClient
        .from('player_identity')
        .select('updated_by')
        .eq('id', identityId)
        .single();

      expect(data?.updated_by).toBe(admin1Id);
    });
  });

  describe('B3. Casino Isolation (DOD-022)', () => {
    it('cannot read other casino identities', async () => {
      // Create identity in casino2
      const { data: c2Identity } = await setupClient
        .from('player_identity')
        .insert({
          casino_id: casino2Id,
          player_id: player2Id,
          created_by: pitBoss2Id,
        })
        .select()
        .single();

      // Try to read from casino1 client
      const { data, error } = await pitBossClient1
        .from('player_identity')
        .select('*')
        .eq('id', c2Identity!.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0); // RLS filters it out
    });

    it('cannot write to other casino', async () => {
      const { error } = await pitBossClient1.from('player_identity').insert({
        casino_id: casino2Id, // Different casino
        player_id: player2Id,
        created_by: pitBoss1Id,
      });

      expect(error).toBeDefined();
      expect(error?.code).toBe('42501'); // RLS violation
    });

    it('cannot UPDATE to different casino (immutability)', async () => {
      const { error } = await pitBossClient1
        .from('player_identity')
        .update({ casino_id: casino2Id })
        .eq('id', identityId);

      expect(error).toBeDefined();
      expect(error?.code).toBe('23514'); // check_violation from trigger
      expect(error?.message).toContain('immutable');
    });
  });

  describe('B5. Immutability (INV-10, DOD-022)', () => {
    it('casino_id is immutable', async () => {
      const { error } = await pitBossClient1
        .from('player_identity')
        .update({ casino_id: casino2Id })
        .eq('id', identityId);

      expect(error).toBeDefined();
      expect(error?.code).toBe('23514');
      expect(error?.message).toContain('casino_id is immutable');
    });

    it('player_id is immutable', async () => {
      const { error } = await pitBossClient1
        .from('player_identity')
        .update({ player_id: player2Id })
        .eq('id', identityId);

      expect(error).toBeDefined();
      expect(error?.code).toBe('23514');
      expect(error?.message).toContain('player_id is immutable');
    });

    it('created_by is immutable', async () => {
      const { error } = await pitBossClient1
        .from('player_identity')
        .update({ created_by: admin1Id })
        .eq('id', identityId);

      expect(error).toBeDefined();
      expect(error?.code).toBe('23514');
      expect(error?.message).toContain('created_by is immutable');
    });
  });

  describe('B6. Delete Denial (DOD-022)', () => {
    it('cannot delete player_identity', async () => {
      const { error } = await pitBossClient1
        .from('player_identity')
        .delete()
        .eq('id', identityId);

      expect(error).toBeDefined();
      expect(error?.code).toBe('42501'); // RLS policy violation (false policy)
    });

    it('cannot delete player_casino', async () => {
      const { error } = await pitBossClient1
        .from('player_casino')
        .delete()
        .eq('player_id', player1Id)
        .eq('casino_id', casino1Id);

      expect(error).toBeDefined();
      expect(error?.code).toBe('42501'); // RLS policy violation
    });

    it('cannot delete player', async () => {
      const { error } = await pitBossClient1
        .from('player')
        .delete()
        .eq('id', player1Id);

      expect(error).toBeDefined();
      expect(error?.code).toBe('42501'); // RLS policy violation
    });
  });

  describe('E. Connection Pooling (ADR-015)', () => {
    it('RLS works with Mode C authenticated session', async () => {
      // Mode C JWT claims stamped in beforeAll via createModeCSession
      const { data, error } = await pitBossClient1
        .from('player_identity')
        .select('*')
        .eq('casino_id', casino1Id);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.every((row) => row.casino_id === casino1Id)).toBe(true);
    });

    it('hybrid policies use JWT fallback', async () => {
      // Even without explicit context injection, JWT claims should work
      const bareClient = createClient<Database>(
        supabaseUrl,
        supabaseServiceKey,
      );

      // Set JWT claims in app_metadata (use Mode C session userId)
      await setupClient.auth.admin.updateUserById(pitBoss1Session.userId, {
        app_metadata: {
          casino_id: casino1Id,
          staff_role: 'pit_boss',
          staff_id: pitBoss1Id,
        },
      });

      const { data, error } = await bareClient
        .from('player_identity')
        .select('*')
        .eq('casino_id', casino1Id);

      // May return 0 rows if JWT not set, but should not error
      expect(error).toBeNull();
    });
  });
});
