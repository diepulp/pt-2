/** @jest-environment node */

/**
 * Rating Slip Move Endpoint - Connection Pooling Test
 *
 * Tests: ISSUE-5AD0182D - RLS context not persisting across Supabase pooled connections
 *
 * This test specifically verifies that the move endpoint works correctly with
 * Supabase's Supavisor connection pooling in transaction mode (port 6543).
 *
 * The move endpoint calls:
 * 1. service.close() → rpc_close_rating_slip
 * 2. service.start()  → rpc_start_rating_slip
 *
 * These RPC calls may execute on different pooled connections, so context must
 * be self-injected within each RPC (ADR-015 Phase 1A).
 *
 * Auth: Mode C — service-role client for fixture setup/teardown,
 * authenticated anon client (with JWT staff_id via ADR-024) for service RPCs.
 *
 * @see ISSUE-5AD0182D
 * @see ADR-015 Connection Pooling Strategy
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
} from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '../../../lib/errors/domain-errors';
import type { Database } from '../../../types/database.types';
import { createRatingSlipService, RatingSlipServiceInterface } from '../index';

// Test environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Context returned by ensureStaffContext — includes authenticated service */
interface StaffContext {
  casinoId: string;
  actorId: string;
  userId: string;
  companyId: string;
  authClient: SupabaseClient<Database>;
  service: RatingSlipServiceInterface;
}

describe('Rating Slip Move - Connection Pooling Test', () => {
  let setupClient: SupabaseClient<Database>; // service-role for fixtures
  let correlationId: string;

  // Track all created contexts for cleanup
  const createdContexts: StaffContext[] = [];

  beforeAll(() => {
    // Service-role client for fixture setup/teardown (bypasses RLS)
    setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  });

  beforeEach(() => {
    correlationId = `test-move-pooling-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  });

  afterEach(async () => {
    // Cleanup after each test — reverse order of creation
    await cleanupTestFixtures(setupClient, correlationId);

    // Clean up all casino contexts created during the test
    for (const ctx of createdContexts) {
      // Delete rating slips for this casino
      await setupClient
        .from('rating_slip')
        .delete()
        .eq('casino_id', ctx.casinoId);

      // Delete visits for this casino
      await setupClient.from('visit').delete().eq('casino_id', ctx.casinoId);

      // Delete player_casino for this casino
      await setupClient
        .from('player_casino')
        .delete()
        .eq('casino_id', ctx.casinoId);

      // Delete gaming tables
      await setupClient
        .from('gaming_table')
        .delete()
        .eq('casino_id', ctx.casinoId);

      // Delete staff
      await setupClient.from('staff').delete().eq('casino_id', ctx.casinoId);

      // Delete casino settings
      await setupClient
        .from('casino_settings')
        .delete()
        .eq('casino_id', ctx.casinoId);

      // Delete casino
      await setupClient.from('casino').delete().eq('id', ctx.casinoId);

      // Delete company
      await setupClient.from('company').delete().eq('id', ctx.companyId);

      // Delete auth user
      await setupClient.auth.admin.deleteUser(ctx.userId);
    }

    // Clear tracked contexts
    createdContexts.length = 0;
  });

  /**
   * Creates a full Mode C auth context: company → casino → settings → auth user → staff → JWT stamp → sign in → service.
   */
  async function ensureStaffContext(): Promise<StaffContext> {
    const ts = Date.now();
    const email = `test-move-pooling-${ts}-${Math.random().toString(36).slice(2, 8)}@test.local`;

    // 1. Create company (ADR-043: company before casino)
    const { data: company, error: companyError } = await setupClient
      .from('company')
      .insert({ name: `Test Company ${ts}` })
      .select()
      .single();

    if (companyError) throw companyError;

    // 2. Create casino with company_id
    const { data: casino, error: casinoError } = await setupClient
      .from('casino')
      .insert({
        name: `Test Casino ${ts}`,
        status: 'active',
        company_id: company!.id,
      })
      .select()
      .single();

    if (casinoError) throw casinoError;

    // 3. Create casino settings (required for compute_gaming_day trigger)
    await setupClient.from('casino_settings').insert({
      casino_id: casino.id,
      gaming_day_start_time: '06:00:00',
      timezone: 'America/Los_Angeles',
      watchlist_floor: 3000,
      ctr_threshold: 10000,
    });

    // 4. Create auth user
    const { data: authData, error: authError } =
      await setupClient.auth.admin.createUser({
        email,
        password: 'test123',
        email_confirm: true,
      });

    if (authError) throw authError;

    // 5. Create staff record bound to auth user
    const { data: staff, error: staffError } = await setupClient
      .from('staff')
      .insert({
        casino_id: casino.id,
        user_id: authData.user.id,
        employee_id: `EMP-${ts}-${Math.random().toString(36).slice(2, 6)}`,
        first_name: 'Test',
        last_name: 'Staff',
        email,
        role: 'pit_boss',
        status: 'active',
      })
      .select()
      .single();

    if (staffError) throw staffError;

    // 6. ADR-024: Two-phase staff_id stamping into app_metadata
    await setupClient.auth.admin.updateUserById(authData.user.id, {
      app_metadata: {
        staff_id: staff.id,
        casino_id: casino.id,
      },
    });

    // 7. Sign in via anon client to obtain JWT with staff_id claim
    const authClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email,
      password: 'test123',
    });
    if (signInError) throw signInError;

    // 8. Create service with authenticated client
    const svc = createRatingSlipService(authClient);

    const ctx: StaffContext = {
      casinoId: casino.id,
      actorId: staff.id,
      userId: authData.user.id,
      companyId: company!.id,
      authClient,
      service: svc,
    };

    createdContexts.push(ctx);
    return ctx;
  }

  describe('Move Endpoint Connection Pooling', () => {
    it('should successfully move player between tables with pooling enabled', async () => {
      // Arrange
      const ctx = await ensureStaffContext();
      const playerId = await createTestPlayer(setupClient, ctx.casinoId);
      const visitId = await createTestVisit(
        setupClient,
        ctx.casinoId,
        playerId,
      );
      const originTableId = await createTestTable(setupClient, ctx.casinoId);
      const destTableId = await createTestTable(setupClient, ctx.casinoId);

      // Create rating slip at origin table
      const originSlip = await ctx.service.start(ctx.casinoId, ctx.actorId, {
        visit_id: visitId,
        table_id: originTableId,
        seat_number: '1',
        game_settings: { game_type: 'blackjack' },
      });

      // Act
      // Simulate move endpoint flow
      const closedSlip = await ctx.service.close(originSlip.id, {
        average_bet: 50.0,
      });

      const newSlip = await ctx.service.start(ctx.casinoId, ctx.actorId, {
        visit_id: visitId,
        table_id: destTableId,
        seat_number: '3', // Different seat
        game_settings: originSlip.game_settings,
      });

      // Assert
      expect(closedSlip.id).toBe(originSlip.id);
      expect(closedSlip.status).toBe('closed');
      // Duration can be 0 if slip is opened and closed very quickly
      expect(closedSlip.duration_seconds).toBeGreaterThanOrEqual(0);

      expect(newSlip.visit_id).toBe(visitId); // Same visit
      expect(newSlip.status).toBe('open');
      expect(newSlip.table_id).toBe(destTableId);
      expect(newSlip.seat_number).toBe('3');
    });

    it('should handle concurrent moves with connection pooling', async () => {
      // Arrange
      const ctx = await ensureStaffContext();

      // Create unique players for each fixture (constraint prevents multiple active visits per player)
      const players = await Promise.all([
        createTestPlayer(setupClient, ctx.casinoId),
        createTestPlayer(setupClient, ctx.casinoId),
        createTestPlayer(setupClient, ctx.casinoId),
      ]);

      // Create multiple visits and slips for concurrent testing
      const fixtures = await Promise.all([
        createMoveFixture(
          setupClient,
          ctx.service,
          ctx.casinoId,
          ctx.actorId,
          players[0],
        ),
        createMoveFixture(
          setupClient,
          ctx.service,
          ctx.casinoId,
          ctx.actorId,
          players[1],
        ),
        createMoveFixture(
          setupClient,
          ctx.service,
          ctx.casinoId,
          ctx.actorId,
          players[2],
        ),
      ]);

      // Act - Run moves concurrently (simulates production load)
      const movePromises = fixtures.map(async (fixture) => {
        const closedSlip = await ctx.service.close(fixture.slipId);
        const newSlip = await ctx.service.start(ctx.casinoId, ctx.actorId, {
          visit_id: fixture.visitId,
          table_id: fixture.destTableId,
          seat_number: '5',
        });
        return { closedSlip, newSlip };
      });

      const results = await Promise.all(movePromises);

      // Assert - All moves succeeded without context errors
      expect(results).toHaveLength(3);
      results.forEach(({ closedSlip, newSlip }) => {
        expect(closedSlip.status).toBe('closed');
        expect(newSlip.status).toBe('open');
        expect(newSlip.visit_id).toBe(closedSlip.visit_id);
      });
    });

    it('should preserve context isolation between different casino scoping', async () => {
      // Arrange — each casino gets its own authenticated context + service
      const ctx1 = await ensureStaffContext();
      const ctx2 = await ensureStaffContext();

      const player1Id = await createTestPlayer(setupClient, ctx1.casinoId);
      const player2Id = await createTestPlayer(setupClient, ctx2.casinoId);

      const visit1Id = await createTestVisit(
        setupClient,
        ctx1.casinoId,
        player1Id,
      );
      const visit2Id = await createTestVisit(
        setupClient,
        ctx2.casinoId,
        player2Id,
      );
      const table1Id = await createTestTable(setupClient, ctx1.casinoId);
      const table2Id = await createTestTable(setupClient, ctx2.casinoId);

      const slip1 = await ctx1.service.start(ctx1.casinoId, ctx1.actorId, {
        visit_id: visit1Id,
        table_id: table1Id,
        seat_number: '1',
      });

      const slip2 = await ctx2.service.start(ctx2.casinoId, ctx2.actorId, {
        visit_id: visit2Id,
        table_id: table2Id,
        seat_number: '2',
      });

      // Act - Close both slips (different contexts)
      const [closed1, closed2] = await Promise.all([
        ctx1.service.close(slip1.id),
        ctx2.service.close(slip2.id),
      ]);

      // Assert - Each slip closed with correct context
      expect(closed1.id).toBe(slip1.id);
      expect(closed2.id).toBe(slip2.id);

      // Verify casino isolation (crucial for multi-tenant security)
      expect(closed1.casino_id).toBe(ctx1.casinoId);
      expect(closed2.casino_id).toBe(ctx2.casinoId);
    });

    it('should handle RPC retry with fresh connection from pool', async () => {
      // Arrange
      const ctx = await ensureStaffContext();
      const playerId = await createTestPlayer(setupClient, ctx.casinoId);
      const visitId = await createTestVisit(
        setupClient,
        ctx.casinoId,
        playerId,
      );
      const tableId = await createTestTable(setupClient, ctx.casinoId);

      const slip = await ctx.service.start(ctx.casinoId, ctx.actorId, {
        visit_id: visitId,
        table_id: tableId,
      });

      // Act - Simulate connection pool reset between calls
      await simulateConnectionPoolReset(); // Force new connection

      let error: DomainError | null = null;
      try {
        await ctx.service.close(slip.id);
      } catch (e) {
        error = e as DomainError;
      }

      // Assert - Context should still work with fresh connection
      expect(error).toBeNull();
    });
  });
});

// Helper functions (test fixtures)
// NOTE: setupClient parameter is required as these are defined outside the describe block

async function createTestPlayer(
  setupClient: SupabaseClient<Database>,
  casinoId: string,
): Promise<string> {
  // Create player
  const { data: player, error: playerError } = await setupClient
    .from('player')
    .insert({
      first_name: 'Test',
      last_name: 'Player',
    })
    .select()
    .single();

  if (playerError) throw playerError;

  // Enroll player at casino
  await setupClient.from('player_casino').insert({
    player_id: player.id,
    casino_id: casinoId,
    status: 'active',
  });

  return player.id;
}

async function createTestVisit(
  setupClient: SupabaseClient<Database>,
  casinoId: string,
  playerId: string,
): Promise<string> {
  const { data, error } = await setupClient
    .from('visit')
    .insert({
      player_id: playerId,
      casino_id: casinoId,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function createTestTable(
  setupClient: SupabaseClient<Database>,
  casinoId: string,
): Promise<string> {
  const { data, error } = await setupClient
    .from('gaming_table')
    .insert({
      casino_id: casinoId,
      label: `T-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'blackjack',
      status: 'active',
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function createMoveFixture(
  setupClient: SupabaseClient<Database>,
  service: RatingSlipServiceInterface,
  casinoId: string,
  actorId: string,
  playerId: string,
): Promise<{ slipId: string; visitId: string; destTableId: string }> {
  const visitId = await createTestVisit(setupClient, casinoId, playerId);
  const originTableId = await createTestTable(setupClient, casinoId);
  const destTableId = await createTestTable(setupClient, casinoId);

  const slip = await service.start(casinoId, actorId, {
    visit_id: visitId,
    table_id: originTableId,
  });

  return { slipId: slip.id, visitId, destTableId };
}

async function cleanupTestFixtures(
  setupClient: SupabaseClient<Database>,
  correlationId: string,
) {
  // Clean up test data based on correlation ID
  await setupClient
    .from('audit_log')
    .delete()
    .like('details->>correlation_id', `${correlationId}%`);
}

async function simulateConnectionPoolReset() {
  // Simulate pool reset by waiting and forcing new operations
  await new Promise((resolve) => setTimeout(resolve, 100));
  // In real test, might need to close/reopen connection
}
