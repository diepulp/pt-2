/** @jest-environment node */

/**
 * Reward Catalog Integration Tests (PRD-LOYALTY-ADMIN-CATALOG WS5)
 *
 * Tests reward catalog service layer + WS1-tightened Zod schema validation.
 *
 * Two test categories:
 * 1. Service layer happy-path: createReward, updateReward, toggleRewardActive, getReward
 *    with nested child records — uses Mode C authenticated client (ADR-024).
 * 2. Schema validation rejection: Tests tightened enums (tier, fulfillment, benefit)
 *    via safeParse directly — no database needed.
 *
 * @testEnvironment node
 * @see PRD-LOYALTY-ADMIN-CATALOG
 * @see ADR-033 Loyalty Reward Domain Model
 * @see ADR-024 Authoritative context derivation
 * @see ADR-044 Testing Governance
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { createModeCSession } from '@/lib/testing/create-mode-c-session';
import type { Database } from '@/types/database.types';

import type { RewardCatalogDTO, RewardDetailDTO } from '../dtos';
import { createRewardService } from '../index';
import type { RewardService } from '../index';
import { createRewardSchema, updateRewardSchema } from '../schemas';

// ============================================================================
// Test Configuration
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEST_PREFIX = 'test-rcint'; // reward-catalog integration

// ============================================================================
// Service Layer Integration Tests
// ============================================================================

describe('Reward Catalog Integration (service layer + schema validation)', () => {
  let setupClient: SupabaseClient<Database>;
  let pitBossClient: SupabaseClient<Database>;
  let authCleanup: (() => Promise<void>) | undefined;

  let testCompanyId: string;
  let testCasinoId: string;
  let testActorId: string;
  let service: RewardService;

  beforeAll(async () => {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
      );
    }

    // Service-role client for setup only (bypasses RLS)
    setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create test company (ADR-043: company before casino)
    const { data: company } = await setupClient
      .from('company')
      .insert({ name: `${TEST_PREFIX} Company ${Date.now()}` })
      .select()
      .single();
    if (!company) throw new Error('Failed to create test company');
    testCompanyId = company.id;

    // Create a casino for test isolation
    const { data: casino, error: casinoError } = await setupClient
      .from('casino')
      .insert({
        name: `${TEST_PREFIX} Casino ${Date.now()}`,
        status: 'active',
        company_id: testCompanyId,
      })
      .select()
      .single();

    if (casinoError || !casino) {
      throw new Error(`Failed to create test casino: ${casinoError?.message}`);
    }
    testCasinoId = casino.id;

    // Create test staff (pit_boss)
    const testEmail = `${TEST_PREFIX.toLowerCase()}-${Date.now()}@test.com`;
    const { data: actor } = await setupClient
      .from('staff')
      .insert({
        casino_id: testCasinoId,
        employee_id: `${TEST_PREFIX}-PB-${Date.now()}`,
        first_name: 'Test',
        last_name: 'PitBoss',
        email: testEmail,
        role: 'pit_boss',
        status: 'active',
      })
      .select()
      .single();
    if (!actor) throw new Error('Failed to create test staff');
    testActorId = actor.id;

    // Mode C auth ceremony (ADR-024): creates auth user, stamps JWT claims, returns authenticated client
    const session = await createModeCSession(setupClient, {
      staffId: testActorId,
      casinoId: testCasinoId,
      staffRole: 'pit_boss',
    });
    pitBossClient = session.client;
    authCleanup = session.cleanup;

    // Link auth user to staff record
    await setupClient
      .from('staff')
      .update({ user_id: session.userId })
      .eq('id', testActorId);

    // Wire service to Mode C authenticated client (not service-role)
    service = createRewardService(pitBossClient);
  }, 30_000);

  afterAll(async () => {
    // Delete child records first (FK constraints) — use setupClient (service-role) for cleanup
    await setupClient
      .from('reward_eligibility')
      .delete()
      .eq('casino_id', testCasinoId);
    await setupClient
      .from('reward_limits')
      .delete()
      .eq('casino_id', testCasinoId);
    await setupClient
      .from('reward_entitlement_tier')
      .delete()
      .eq('casino_id', testCasinoId);
    await setupClient
      .from('reward_price_points')
      .delete()
      .eq('casino_id', testCasinoId);
    await setupClient
      .from('reward_catalog')
      .delete()
      .eq('casino_id', testCasinoId);
    await setupClient.from('staff').delete().eq('casino_id', testCasinoId);
    await setupClient.from('casino').delete().eq('id', testCasinoId);
    await setupClient.from('company').delete().eq('id', testCompanyId);
    // Clean up Mode C auth user
    await authCleanup?.();
  }, 15_000);

  // ==========================================================================
  // SCENARIO 1: Create points_comp reward with valid pricePoints
  // ==========================================================================
  it('creates a points_comp reward with valid pricePoints and returns RewardCatalogDTO', async () => {
    const code = `${TEST_PREFIX}_PC_${Date.now()}`;
    const result: RewardCatalogDTO = await service.createReward({
      casinoId: testCasinoId,
      code,
      family: 'points_comp',
      kind: 'meal',
      name: '$25 Meal Comp',
      fulfillment: 'comp_slip',
      pricePoints: { pointsCost: 250, allowOverdraw: false },
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.casinoId).toBe(testCasinoId);
    expect(result.code).toBe(code);
    expect(result.family).toBe('points_comp');
    expect(result.kind).toBe('meal');
    expect(result.name).toBe('$25 Meal Comp');
    expect(result.isActive).toBe(true);
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  // ==========================================================================
  // SCENARIO 2: Create entitlement reward with valid tier entries
  // ==========================================================================
  it('creates an entitlement reward with valid tier entries and returns RewardCatalogDTO', async () => {
    const code = `${TEST_PREFIX}_ENT_${Date.now()}`;
    const result: RewardCatalogDTO = await service.createReward({
      casinoId: testCasinoId,
      code,
      family: 'entitlement',
      kind: 'match_play',
      name: 'Gold Match Play',
      entitlementTiers: [
        {
          tier: 'gold',
          benefit: { face_value_cents: 2500, instrument_type: 'match_play' },
        },
        {
          tier: 'platinum',
          benefit: { face_value_cents: 5000, instrument_type: 'match_play' },
        },
      ],
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.family).toBe('entitlement');
    expect(result.kind).toBe('match_play');

    // Verify child records via getReward
    const detail: RewardDetailDTO | null = await service.getReward(result.id);
    expect(detail).not.toBeNull();
    expect(detail!.entitlementTiers).toHaveLength(2);
    expect(detail!.entitlementTiers.map((t) => t.tier).sort()).toEqual([
      'gold',
      'platinum',
    ]);
  });

  // ==========================================================================
  // SCENARIO 3: Create points_comp without pricePoints succeeds (optional)
  // ==========================================================================
  it('creates a points_comp reward without pricePoints (optional per cross-field policy)', async () => {
    const code = `${TEST_PREFIX}_NOPP_${Date.now()}`;
    const result: RewardCatalogDTO = await service.createReward({
      casinoId: testCasinoId,
      code,
      family: 'points_comp',
      kind: 'beverage',
      name: 'Free Beverage',
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.family).toBe('points_comp');

    // Verify no price points child record
    const detail = await service.getReward(result.id);
    expect(detail).not.toBeNull();
    expect(detail!.pricePoints).toBeNull();
  });

  // ==========================================================================
  // SCENARIO 4: Update reward name + kind returns updated DTO
  // ==========================================================================
  it('updates reward name and kind and returns updated DTO', async () => {
    // Create a reward to update
    const code = `${TEST_PREFIX}_UPD_${Date.now()}`;
    const created = await service.createReward({
      casinoId: testCasinoId,
      code,
      family: 'points_comp',
      kind: 'meal',
      name: 'Original Name',
    });

    const updated: RewardCatalogDTO = await service.updateReward({
      id: created.id,
      name: 'Updated Name',
      kind: 'beverage',
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Updated Name');
    expect(updated.kind).toBe('beverage');
    // Family should remain unchanged
    expect(updated.family).toBe('points_comp');
  });

  // ==========================================================================
  // SCENARIO 5: Update reward with nested pricePoints — getReward returns updated child
  // ==========================================================================
  it('updates reward with nested pricePoints and getReward returns updated child record', async () => {
    const code = `${TEST_PREFIX}_NESTEDPP_${Date.now()}`;
    const created = await service.createReward({
      casinoId: testCasinoId,
      code,
      family: 'points_comp',
      kind: 'meal',
      name: 'Nested PP Test',
      pricePoints: { pointsCost: 100, allowOverdraw: false },
    });

    // Update with new price points
    await service.updateReward({
      id: created.id,
      pricePoints: { pointsCost: 500, allowOverdraw: true },
    });

    const detail = await service.getReward(created.id);
    expect(detail).not.toBeNull();
    expect(detail!.pricePoints).not.toBeNull();
    expect(detail!.pricePoints!.pointsCost).toBe(500);
    expect(detail!.pricePoints!.allowOverdraw).toBe(true);
  });

  // ==========================================================================
  // SCENARIO 6: Update reward with nested entitlementTiers — getReward returns new set
  // ==========================================================================
  it('updates reward with nested entitlementTiers and getReward returns new set', async () => {
    const code = `${TEST_PREFIX}_NESTEDTIER_${Date.now()}`;
    const created = await service.createReward({
      casinoId: testCasinoId,
      code,
      family: 'entitlement',
      kind: 'free_play',
      name: 'Nested Tier Test',
      entitlementTiers: [
        {
          tier: 'gold',
          benefit: { face_value_cents: 1000, instrument_type: 'free_play' },
        },
      ],
    });

    // Replace tiers with a new set
    await service.updateReward({
      id: created.id,
      entitlementTiers: [
        {
          tier: 'silver',
          benefit: { face_value_cents: 500, instrument_type: 'free_play' },
        },
        {
          tier: 'diamond',
          benefit: { face_value_cents: 10000, instrument_type: 'match_play' },
        },
      ],
    });

    const detail = await service.getReward(created.id);
    expect(detail).not.toBeNull();
    expect(detail!.entitlementTiers).toHaveLength(2);
    const tierNames = detail!.entitlementTiers.map((t) => t.tier).sort();
    expect(tierNames).toEqual(['diamond', 'silver']);
  });

  // ==========================================================================
  // SCENARIO 7: Toggle reward active/inactive
  // ==========================================================================
  it('toggles reward active/inactive and returns DTO with toggled is_active', async () => {
    const code = `${TEST_PREFIX}_TOGGLE_${Date.now()}`;
    const created = await service.createReward({
      casinoId: testCasinoId,
      code,
      family: 'points_comp',
      kind: 'meal',
      name: 'Toggle Test',
    });

    expect(created.isActive).toBe(true);

    // Toggle to inactive
    const deactivated = await service.toggleRewardActive(created.id, false);
    expect(deactivated.isActive).toBe(false);
    expect(deactivated.id).toBe(created.id);

    // Toggle back to active
    const reactivated = await service.toggleRewardActive(created.id, true);
    expect(reactivated.isActive).toBe(true);
  });

  // ==========================================================================
  // SCENARIO 8: Reject invalid tier value 'legendary'
  // ==========================================================================
  it('rejects invalid tier value "legendary" via entitlementTiers in createRewardSchema', () => {
    const result = createRewardSchema.safeParse({
      code: 'TEST_CODE',
      family: 'entitlement',
      kind: 'match_play',
      name: 'Invalid Tier Test',
      entitlementTiers: [
        {
          tier: 'legendary', // not in ['bronze', 'silver', 'gold', 'platinum', 'diamond']
          benefit: { face_value_cents: 1000, instrument_type: 'match_play' },
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const tierIssues = result.error.issues.filter((issue) =>
        issue.path.includes('tier'),
      );
      expect(tierIssues.length).toBeGreaterThan(0);
    }
  });

  // ==========================================================================
  // SCENARIO 9: Reject invalid benefit JSONB (missing face_value_cents)
  // ==========================================================================
  it('rejects invalid benefit JSONB missing face_value_cents via createRewardSchema', () => {
    const result = createRewardSchema.safeParse({
      code: 'TEST_CODE',
      family: 'entitlement',
      kind: 'match_play',
      name: 'Invalid Benefit Test',
      entitlementTiers: [
        {
          tier: 'gold',
          benefit: { instrument_type: 'match_play' }, // missing face_value_cents
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const benefitIssues = result.error.issues.filter(
        (issue) =>
          issue.path.includes('benefit') ||
          issue.path.includes('face_value_cents'),
      );
      expect(benefitIssues.length).toBeGreaterThan(0);
    }
  });

  // ==========================================================================
  // SCENARIO 10: Reject invalid fulfillment value 'print'
  // ==========================================================================
  it('rejects invalid fulfillment value "print" via createRewardSchema.safeParse', () => {
    const result = createRewardSchema.safeParse({
      code: 'TEST_CODE',
      family: 'points_comp',
      kind: 'meal',
      name: 'Invalid Fulfillment Test',
      fulfillment: 'print', // not in ['comp_slip', 'coupon', 'none']
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fulfillmentIssues = result.error.issues.filter((issue) =>
        issue.path.includes('fulfillment'),
      );
      expect(fulfillmentIssues.length).toBeGreaterThan(0);
    }
  });

  // ==========================================================================
  // Additional schema validation: updateRewardSchema with nested tiers
  // ==========================================================================
  it('rejects invalid tier in updateRewardSchema.entitlementTiers', () => {
    const result = updateRewardSchema.safeParse({
      entitlementTiers: [
        {
          tier: 'legendary',
          benefit: { face_value_cents: 1000, instrument_type: 'match_play' },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid fulfillment in updateRewardSchema', () => {
    const result = updateRewardSchema.safeParse({
      fulfillment: 'print',
    });

    expect(result.success).toBe(false);
  });
});
