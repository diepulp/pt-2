/** @jest-environment node */

/**
 * Promo Outbox Contract Integration Tests (PRD-028)
 *
 * REGRESSION PREVENTION: PRD-028
 * "loyalty_outbox dropped in 20251213003000, promo RPCs fail with 'relation does not exist'"
 *
 * Tests that the loyalty_outbox table schema matches the INSERT contract used
 * by the three promo RPCs after restoration via migration 20260206005335.
 *
 * AUTH: Mode C (ADR-024) — setupClient (service-role) for fixture creation,
 * pitBossClient (authenticated anon) via createModeCSession for ADR-024
 * consistency. Direct INSERT tests remain on setupClient because the RPCs
 * themselves run as postgres (SECURITY DEFINER bypass pattern).
 *
 * NOTE: The promo RPCs have a pre-existing bug where they reference audit_log
 * columns (dto_after, dto_before, correlation_id) that don't exist. Since
 * PRD-028 does not modify the RPCs, we test the outbox schema contract directly
 * using the same INSERT pattern the RPCs use. Once the audit_log schema is
 * fixed, these tests can be upgraded to call the RPCs end-to-end.
 *
 * @see PRD-028 Restore loyalty_outbox Table
 * @see ADR-024 RLS Context Self-Injection Remediation
 * @see ADR-033 Hard Dependency: loyalty_outbox
 */

import { randomUUID } from 'crypto';

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { createModeCSession } from '@/lib/testing/create-mode-c-session';
import type { Database } from '@/types/database.types';

// ============================================================================
// Test Configuration
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEST_PREFIX = 'test-poc-mc'; // promo-outbox-contract Mode C

// ============================================================================
// Test Fixture Types
// ============================================================================

interface TestFixture {
  casinoId: string;
  staffId: string;
  cleanup: () => Promise<void>;
}

// ============================================================================
// Test Suite
// ============================================================================

const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';

(RUN_INTEGRATION ? describe : describe.skip)(
  'loyalty_outbox promo RPC contract (PRD-028)',
  () => {
    let setupClient: SupabaseClient<Database>;
    let pitBossClient: SupabaseClient<Database>;
    let authCleanup: (() => Promise<void>) | undefined;
    let fixture: TestFixture;

    beforeAll(async () => {
      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error(
          'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
        );
      }

      // Phase 1: Service-role client for fixture setup
      setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Phase 2: Create shared test fixtures (company, casino, staff)
      fixture = await createTestFixture(setupClient);

      // Phase 3: Mode C auth ceremony (ADR-024)
      const session = await createModeCSession(setupClient, {
        staffId: fixture.staffId,
        casinoId: fixture.casinoId,
        staffRole: 'pit_boss',
      });
      pitBossClient = session.client;
      authCleanup = session.cleanup;

      // Link auth user to staff record
      await setupClient
        .from('staff')
        .update({ user_id: session.userId })
        .eq('id', fixture.staffId);
    }, 15_000);

    afterAll(async () => {
      await authCleanup?.();
      if (fixture?.cleanup) {
        await fixture.cleanup();
      }
    }, 15_000);

    // ========================================================================
    // TEST 1: promo_coupon_issued outbox contract
    // ========================================================================
    it('accepts promo_coupon_issued INSERT matching RPC contract (4-column subset)', async () => {
      // This mirrors the exact INSERT from rpc_issue_promo_coupon (migration 20260106235611, lines 392-411)
      // setupClient — SECURITY DEFINER bypass pattern test
      const { data, error } = await setupClient
        .from('loyalty_outbox')
        .insert({
          casino_id: fixture.casinoId,
          event_type: 'promo_coupon_issued',
          payload: {
            coupon_id: randomUUID(),
            promo_program_id: randomUUID(),
            validation_number: `${TEST_PREFIX}-ISSUE-${Date.now()}`,
            face_value_amount: 25,
            player_id: randomUUID(),
            visit_id: randomUUID(),
            issued_by: randomUUID(),
            correlation_id: randomUUID(),
          },
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.event_type).toBe('promo_coupon_issued');
      expect(data!.casino_id).toBe(fixture.casinoId);
      expect(data!.payload).toBeDefined();

      const payload = data!.payload as Record<string, unknown>;
      expect(payload.coupon_id).toBeDefined();
      expect(payload.promo_program_id).toBeDefined();
      expect(payload.correlation_id).toBeDefined();
    });

    // ========================================================================
    // TEST 2: promo_coupon_voided outbox contract
    // ========================================================================
    it('accepts promo_coupon_voided INSERT matching RPC contract', async () => {
      // This mirrors the exact INSERT from rpc_void_promo_coupon (migration 20260106235611, lines 532-547)
      // setupClient — SECURITY DEFINER bypass pattern test
      const { data, error } = await setupClient
        .from('loyalty_outbox')
        .insert({
          casino_id: fixture.casinoId,
          event_type: 'promo_coupon_voided',
          payload: {
            coupon_id: randomUUID(),
            validation_number: `${TEST_PREFIX}-VOID-${Date.now()}`,
            voided_by: randomUUID(),
            correlation_id: randomUUID(),
          },
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.event_type).toBe('promo_coupon_voided');
      expect(data!.casino_id).toBe(fixture.casinoId);

      const payload = data!.payload as Record<string, unknown>;
      expect(payload.coupon_id).toBeDefined();
      expect(payload.voided_by).toBeDefined();
      expect(payload.correlation_id).toBeDefined();
    });

    // ========================================================================
    // TEST 3: promo_coupon_replaced outbox contract
    // ========================================================================
    it('accepts promo_coupon_replaced INSERT matching RPC contract', async () => {
      // This mirrors the exact INSERT from rpc_replace_promo_coupon (migration 20260106235611, lines 706-723)
      // setupClient — SECURITY DEFINER bypass pattern test
      const { data, error } = await setupClient
        .from('loyalty_outbox')
        .insert({
          casino_id: fixture.casinoId,
          event_type: 'promo_coupon_replaced',
          payload: {
            old_coupon_id: randomUUID(),
            old_validation_number: `${TEST_PREFIX}-OLD-${Date.now()}`,
            new_coupon_id: randomUUID(),
            new_validation_number: `${TEST_PREFIX}-NEW-${Date.now()}`,
            replaced_by: randomUUID(),
            correlation_id: randomUUID(),
          },
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.event_type).toBe('promo_coupon_replaced');
      expect(data!.casino_id).toBe(fixture.casinoId);

      const payload = data!.payload as Record<string, unknown>;
      expect(payload.old_coupon_id).toBeDefined();
      expect(payload.new_coupon_id).toBeDefined();
      expect(payload.replaced_by).toBeDefined();
      expect(payload.correlation_id).toBeDefined();
    });

    // ========================================================================
    // TEST 4: Omitted columns resolve to schema defaults
    // ========================================================================
    it('omitted columns resolve to schema defaults (id, ledger_id, processed_at, attempt_count)', async () => {
      // setupClient — SECURITY DEFINER bypass pattern test
      const { data, error } = await setupClient
        .from('loyalty_outbox')
        .insert({
          casino_id: fixture.casinoId,
          event_type: 'promo_coupon_issued',
          payload: { coupon_id: randomUUID(), test: 'defaults' },
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();

      // id: valid UUID (auto-generated by gen_random_uuid())
      expect(data!.id).toBeDefined();
      expect(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          data!.id,
        ),
      ).toBe(true);

      // ledger_id: NULL (promo events have no ledger entry)
      expect(data!.ledger_id).toBeNull();

      // processed_at: NULL (no consumer has processed it)
      expect(data!.processed_at).toBeNull();

      // attempt_count: 0 (default)
      expect(data!.attempt_count).toBe(0);

      // created_at: within 30s of now (not NULL, not epoch)
      const createdAt = new Date(data!.created_at).getTime();
      const now = Date.now();
      expect(Math.abs(now - createdAt)).toBeLessThan(30_000);
    });

    // ========================================================================
    // TEST 5: Table ownership matches RPC definer role
    // ========================================================================
    it('table ownership validates RLS bypass analysis (table exists and is queryable)', async () => {
      // Verify table exists by querying it (setupClient — service role bypasses RLS)
      const { data, error } = await setupClient
        .from('loyalty_outbox')
        .select('id')
        .eq('casino_id', fixture.casinoId)
        .limit(1);

      expect(error).toBeNull();
      expect(data).toBeDefined();

      // Table exists and is queryable. Ownership was verified by the migration's
      // $owner_check$ block which asserts: tableowner = current_user (postgres).
      // In Supabase, migrations run as 'postgres' -- the same role that owns
      // SECURITY DEFINER promo RPCs, confirming the RLS bypass analysis:
      // the RPCs run as postgres (table owner), which is exempt from RLS.
    });
  },
);

// ============================================================================
// Fixture Factory
// ============================================================================

async function createTestFixture(
  setupClient: SupabaseClient<Database>,
): Promise<TestFixture> {
  // Create company (ADR-043: company before casino)
  const { data: company, error: companyError } = await setupClient
    .from('company')
    .insert({ name: `${TEST_PREFIX} Company ${Date.now()}` })
    .select()
    .single();

  if (companyError || !company) {
    throw new Error(`Failed to create company: ${companyError?.message}`);
  }

  // Create casino (minimal -- we only need a valid casino_id for FK)
  const { data: casino, error: casinoError } = await setupClient
    .from('casino')
    .insert({
      name: `${TEST_PREFIX} Casino ${Date.now()}`,
      status: 'active',
      company_id: company.id,
    })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create casino: ${casinoError?.message}`);
  }

  // Create staff actor for Mode C (ADR-024) — user_id linked after auth ceremony in beforeAll
  const { data: actor, error: actorError } = await setupClient
    .from('staff')
    .insert({
      casino_id: casino.id,
      employee_id: `${TEST_PREFIX}-001`,
      first_name: 'Test',
      last_name: 'Actor',
      email: `${TEST_PREFIX}-actor-${Date.now()}@test.local`,
      role: 'pit_boss',
      status: 'active',
    })
    .select()
    .single();

  if (actorError || !actor) {
    throw new Error(`Failed to create actor: ${actorError?.message}`);
  }

  const cleanup = async () => {
    // Clean outbox rows
    await setupClient
      .from('loyalty_outbox')
      .delete()
      .eq('casino_id', casino.id);

    // Clean staff
    await setupClient.from('staff').delete().eq('id', actor.id);

    // Clean casino (CASCADE handles settings etc.)
    await setupClient.from('casino').delete().eq('id', casino.id);

    // Clean company (ADR-043)
    await setupClient.from('company').delete().eq('id', company.id);
  };

  return {
    casinoId: casino.id,
    staffId: actor.id,
    cleanup,
  };
}
