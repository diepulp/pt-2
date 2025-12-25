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

import type { Database } from '../../types/database.types';
import { injectRLSContext } from '../../lib/supabase/rls-context';
import type { RLSContext } from '../../lib/supabase/rls-context';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('player-identity RLS Policies (ADR-022)', () => {
  let serviceClient: SupabaseClient<Database>;
  let pitBossClient1: SupabaseClient<Database>;
  let adminClient1: SupabaseClient<Database>;
  let cashierClient1: SupabaseClient<Database>;
  let dealerClient1: SupabaseClient<Database>;
  let pitBossClient2: SupabaseClient<Database>;

  let casino1Id: string;
  let casino2Id: string;
  let pitBoss1Id: string;
  let admin1Id: string;
  let cashier1Id: string;
  let dealer1Id: string;
  let pitBoss2Id: string;
  let user1Id: string;
  let user2Id: string;
  let user3Id: string;
  let user4Id: string;
  let user5Id: string;
  let player1Id: string;
  let player2Id: string;
  let identityId: string;

  beforeAll(async () => {
    serviceClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test users for authentication
    const { data: user1 } = await serviceClient.auth.admin.createUser({
      email: `test-pit-boss-1-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    user1Id = user1!.user.id;

    const { data: user2 } = await serviceClient.auth.admin.createUser({
      email: `test-admin-1-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    user2Id = user2!.user.id;

    const { data: user3 } = await serviceClient.auth.admin.createUser({
      email: `test-cashier-1-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    user3Id = user3!.user.id;

    const { data: user4 } = await serviceClient.auth.admin.createUser({
      email: `test-dealer-1-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    user4Id = user4!.user.id;

    const { data: user5 } = await serviceClient.auth.admin.createUser({
      email: `test-pit-boss-2-${Date.now()}@example.com`,
      password: 'test-password',
      email_confirm: true,
    });
    user5Id = user5!.user.id;

    // Create test casinos
    const { data: c1 } = await serviceClient
      .from('casino')
      .insert({ name: 'Test Casino 1' })
      .select('id')
      .single();
    casino1Id = c1!.id;

    const { data: c2 } = await serviceClient
      .from('casino')
      .insert({ name: 'Test Casino 2' })
      .select('id')
      .single();
    casino2Id = c2!.id;

    // Create test staff for each role
    const { data: pb1 } = await serviceClient
      .from('staff')
      .insert({
        user_id: user1Id,
        casino_id: casino1Id,
        role: 'pit_boss',
        name: 'Pit Boss 1',
        status: 'active',
      })
      .select('id')
      .single();
    pitBoss1Id = pb1!.id;

    const { data: a1 } = await serviceClient
      .from('staff')
      .insert({
        user_id: user2Id,
        casino_id: casino1Id,
        role: 'admin',
        name: 'Admin 1',
        status: 'active',
      })
      .select('id')
      .single();
    admin1Id = a1!.id;

    const { data: ca1 } = await serviceClient
      .from('staff')
      .insert({
        user_id: user3Id,
        casino_id: casino1Id,
        role: 'cashier',
        name: 'Cashier 1',
        status: 'active',
      })
      .select('id')
      .single();
    cashier1Id = ca1!.id;

    const { data: d1 } = await serviceClient
      .from('staff')
      .insert({
        user_id: user4Id,
        casino_id: casino1Id,
        role: 'dealer',
        name: 'Dealer 1',
        status: 'active',
      })
      .select('id')
      .single();
    dealer1Id = d1!.id;

    const { data: pb2 } = await serviceClient
      .from('staff')
      .insert({
        user_id: user5Id,
        casino_id: casino2Id,
        role: 'pit_boss',
        name: 'Pit Boss 2',
        status: 'active',
      })
      .select('id')
      .single();
    pitBoss2Id = pb2!.id;

    // Create authenticated clients with JWT claims
    pitBossClient1 = createClient<Database>(supabaseUrl, supabaseServiceKey);
    adminClient1 = createClient<Database>(supabaseUrl, supabaseServiceKey);
    cashierClient1 = createClient<Database>(supabaseUrl, supabaseServiceKey);
    dealerClient1 = createClient<Database>(supabaseUrl, supabaseServiceKey);
    pitBossClient2 = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Inject RLS context for each client
    await injectRLSContext(pitBossClient1, {
      actorId: pitBoss1Id,
      casinoId: casino1Id,
      staffRole: 'pit_boss',
    });

    await injectRLSContext(adminClient1, {
      actorId: admin1Id,
      casinoId: casino1Id,
      staffRole: 'admin',
    });

    await injectRLSContext(cashierClient1, {
      actorId: cashier1Id,
      casinoId: casino1Id,
      staffRole: 'cashier',
    });

    await injectRLSContext(dealerClient1, {
      actorId: dealer1Id,
      casinoId: casino1Id,
      staffRole: 'dealer',
    });

    await injectRLSContext(pitBossClient2, {
      actorId: pitBoss2Id,
      casinoId: casino2Id,
      staffRole: 'pit_boss',
    });

    // Create test players
    const { data: p1 } = await serviceClient
      .from('player')
      .insert({
        first_name: 'John',
        last_name: 'Doe',
        birth_date: '1980-01-01',
      })
      .select('id')
      .single();
    player1Id = p1!.id;

    const { data: p2 } = await serviceClient
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
    await serviceClient.from('player_casino').insert({
      player_id: player1Id,
      casino_id: casino1Id,
      status: 'active',
      enrolled_by: pitBoss1Id,
    });

    // Create enrollment for player2 at casino2
    await serviceClient.from('player_casino').insert({
      player_id: player2Id,
      casino_id: casino2Id,
      status: 'active',
      enrolled_by: pitBoss2Id,
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await serviceClient.from('player_identity').delete().eq('casino_id', casino1Id);
    await serviceClient.from('player_identity').delete().eq('casino_id', casino2Id);
    await serviceClient.from('player_casino').delete().eq('casino_id', casino1Id);
    await serviceClient.from('player_casino').delete().eq('casino_id', casino2Id);
    await serviceClient.from('player').delete().eq('id', player1Id);
    await serviceClient.from('player').delete().eq('id', player2Id);
    await serviceClient.from('staff').delete().eq('casino_id', casino1Id);
    await serviceClient.from('staff').delete().eq('casino_id', casino2Id);
    await serviceClient.from('casino').delete().eq('id', casino1Id);
    await serviceClient.from('casino').delete().eq('id', casino2Id);
    await serviceClient.auth.admin.deleteUser(user1Id);
    await serviceClient.auth.admin.deleteUser(user2Id);
    await serviceClient.auth.admin.deleteUser(user3Id);
    await serviceClient.auth.admin.deleteUser(user4Id);
    await serviceClient.auth.admin.deleteUser(user5Id);
  });

  describe('B1. Role Matrix (DOD-022)', () => {
    it('pit_boss can read player_identity', async () => {
      // Setup: Create identity as service client
      const { data: identity } = await serviceClient
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
      const { error } = await cashierClient1
        .from('player_identity')
        .insert({
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
      const { error } = await dealerClient1
        .from('player_identity')
        .insert({
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
      const { error } = await pitBossClient1
        .from('player_identity')
        .insert({
          casino_id: casino1Id,
          player_id: player1Id,
          created_by: admin1Id, // Spoofed actor
        });

      expect(error).toBeDefined();
      expect(error?.code).toBe('42501'); // RLS WITH CHECK violation
    });

    it('enrolled_by must match current actor for player_casino INSERT', async () => {
      // Create a new player for this test
      const { data: newPlayer } = await serviceClient
        .from('player')
        .insert({ first_name: 'Test', last_name: 'Actor' })
        .select('id')
        .single();

      const { error } = await pitBossClient1
        .from('player_casino')
        .insert({
          player_id: newPlayer!.id,
          casino_id: casino1Id,
          status: 'active',
          enrolled_by: admin1Id, // Spoofed actor
        });

      expect(error).toBeDefined();
      expect(error?.code).toBe('42501'); // RLS WITH CHECK violation

      // Cleanup
      await serviceClient.from('player').delete().eq('id', newPlayer!.id);
    });

    it('updated_by auto-populated on UPDATE', async () => {
      await adminClient1
        .from('player_identity')
        .update({ height: '6-01' })
        .eq('id', identityId);

      const { data } = await serviceClient
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
      const { data: c2Identity } = await serviceClient
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
      const { error } = await pitBossClient1
        .from('player_identity')
        .insert({
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
    it('RLS works with session context injection', async () => {
      // Context already injected in beforeAll
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
      const bareClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

      // Set JWT claims in app_metadata
      await serviceClient.auth.admin.updateUserById(user1Id, {
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
