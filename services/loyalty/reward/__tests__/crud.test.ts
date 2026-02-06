/**
 * Reward Catalog CRUD Unit Tests
 *
 * Tests CRUD operations with Supabase client doubles.
 * Coverage target: 90%+.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS5
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import * as crud from '../crud';
import type {
  CreateRewardInput,
  UpdateRewardInput,
  UpsertEarnConfigInput,
} from '../dtos';
import type { RewardCatalogRow, LoyaltyEarnConfigRow } from '../mappers';

// Import crud module for testing

// === Mock Fixtures ===

const catalogRow: RewardCatalogRow = {
  id: 'reward-uuid-1',
  casino_id: 'casino-uuid-1',
  code: 'COMP_MEAL_25',
  family: 'points_comp',
  kind: 'meal',
  name: '$25 Meal Comp',
  is_active: true,
  fulfillment: 'restaurant',
  metadata: { category: 'dining' },
  ui_tags: ['popular'],
  created_at: '2026-02-06T01:00:00Z',
  updated_at: '2026-02-06T01:00:00Z',
};

const earnConfigRow: LoyaltyEarnConfigRow = {
  casino_id: 'casino-uuid-1',
  points_per_theo: 10,
  default_point_multiplier: 1.0,
  rounding_policy: 'floor',
  is_active: true,
  effective_from: null,
  created_at: '2026-02-06T01:00:00Z',
  updated_at: '2026-02-06T01:00:00Z',
};

// === Supabase Client Double ===

function createMockBuilder() {
  const builder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
    // Terminal resolvers: make the builder thenable
    then: undefined as unknown as typeof Promise.prototype.then,
  };

  // By default, .then resolves the current builder data (for await on non-terminal chains)
  // Override per-test where needed
  return builder;
}

function createMockSupabase() {
  const builders: Record<string, ReturnType<typeof createMockBuilder>> = {};

  const getBuilder = (table: string) => {
    if (!builders[table]) {
      builders[table] = createMockBuilder();
    }
    return builders[table];
  };

  const supabase = {
    from: jest.fn((table: string) => getBuilder(table)),
  } as unknown as SupabaseClient<Database>;

  return { supabase, builders, getBuilder };
}

describe('reward crud', () => {
  describe('listRewards', () => {
    it('queries reward_catalog with default ordering', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');

      // Make the chain resolve
      builder.limit.mockResolvedValue({ data: [catalogRow], error: null });

      const result = await crud.listRewards(supabase);

      expect(supabase.from).toHaveBeenCalledWith('reward_catalog');
      expect(builder.select).toHaveBeenCalled();
      expect(builder.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('reward-uuid-1');
    });

    it('applies family filter when provided', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.limit.mockResolvedValue({ data: [], error: null });

      await crud.listRewards(supabase, { family: 'entitlement' });

      expect(builder.eq).toHaveBeenCalledWith('family', 'entitlement');
    });

    it('applies kind filter when provided', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.limit.mockResolvedValue({ data: [], error: null });

      await crud.listRewards(supabase, { kind: 'meal' });

      expect(builder.eq).toHaveBeenCalledWith('kind', 'meal');
    });

    it('applies isActive filter when provided', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.limit.mockResolvedValue({ data: [], error: null });

      await crud.listRewards(supabase, { isActive: true });

      expect(builder.eq).toHaveBeenCalledWith('is_active', true);
    });

    it('applies search filter with ilike', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.limit.mockResolvedValue({ data: [], error: null });

      await crud.listRewards(supabase, { search: 'meal' });

      expect(builder.ilike).toHaveBeenCalledWith('name', '%meal%');
    });

    it('applies range for offset', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.range.mockResolvedValue({ data: [], error: null });

      await crud.listRewards(supabase, { offset: 10, limit: 25 });

      expect(builder.range).toHaveBeenCalledWith(10, 34); // 10 + 25 - 1
    });

    it('caps limit at 100', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.limit.mockResolvedValue({ data: [], error: null });

      await crud.listRewards(supabase, { limit: 500 });

      expect(builder.limit).toHaveBeenCalledWith(100);
    });

    it('uses default limit of 50', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.limit.mockResolvedValue({ data: [], error: null });

      await crud.listRewards(supabase);

      expect(builder.limit).toHaveBeenCalledWith(50);
    });

    it('returns empty array when no data', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.limit.mockResolvedValue({ data: null, error: null });

      const result = await crud.listRewards(supabase);

      expect(result).toEqual([]);
    });

    it('throws DomainError on supabase error', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.limit.mockResolvedValue({
        data: null,
        error: { message: 'UNAUTHORIZED: RLS context not set' },
      });

      await expect(crud.listRewards(supabase)).rejects.toBeInstanceOf(
        DomainError,
      );
      await expect(crud.listRewards(supabase)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  describe('getReward', () => {
    it('fetches catalog + child records in parallel', async () => {
      const { supabase, getBuilder } = createMockSupabase();

      // Catalog query
      const catalogBuilder = getBuilder('reward_catalog');
      catalogBuilder.maybeSingle.mockResolvedValue({
        data: catalogRow,
        error: null,
      });

      // Child queries
      const ppBuilder = getBuilder('reward_price_points');
      ppBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

      const tierBuilder = getBuilder('reward_entitlement_tier');
      tierBuilder.order.mockResolvedValue({ data: [], error: null });

      const limitsBuilder = getBuilder('reward_limits');
      // reward_limits has no terminal call after eq, needs to resolve the chain
      limitsBuilder.eq.mockResolvedValue({ data: [], error: null });

      const eligBuilder = getBuilder('reward_eligibility');
      eligBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await crud.getReward(supabase, 'reward-uuid-1');

      expect(supabase.from).toHaveBeenCalledWith('reward_catalog');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('reward-uuid-1');
    });

    it('returns null when catalog not found', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const catalogBuilder = getBuilder('reward_catalog');
      catalogBuilder.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await crud.getReward(supabase, 'nonexistent-id');

      expect(result).toBeNull();
    });

    it('throws DomainError on catalog query error', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const catalogBuilder = getBuilder('reward_catalog');
      catalogBuilder.maybeSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      await expect(
        crud.getReward(supabase, 'reward-uuid-1'),
      ).rejects.toBeInstanceOf(DomainError);
    });
  });

  describe('createReward', () => {
    const input: CreateRewardInput = {
      casinoId: 'casino-uuid-1',
      code: 'COMP_MEAL_25',
      family: 'points_comp',
      kind: 'meal',
      name: '$25 Meal Comp',
    };

    it('inserts catalog and returns DTO', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({ data: catalogRow, error: null });

      const result = await crud.createReward(supabase, input);

      expect(supabase.from).toHaveBeenCalledWith('reward_catalog');
      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          casino_id: 'casino-uuid-1',
          code: 'COMP_MEAL_25',
          family: 'points_comp',
          kind: 'meal',
          name: '$25 Meal Comp',
        }),
      );
      expect(result.id).toBe('reward-uuid-1');
    });

    it('inserts child records when provided', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const catalogBuilder = getBuilder('reward_catalog');
      catalogBuilder.single.mockResolvedValue({
        data: catalogRow,
        error: null,
      });

      // Child table builders
      const ppBuilder = getBuilder('reward_price_points');
      ppBuilder.insert.mockResolvedValue({ error: null });

      const tierBuilder = getBuilder('reward_entitlement_tier');
      tierBuilder.insert.mockResolvedValue({ error: null });

      const limitsBuilder = getBuilder('reward_limits');
      limitsBuilder.insert.mockResolvedValue({ error: null });

      const eligBuilder = getBuilder('reward_eligibility');
      eligBuilder.insert.mockResolvedValue({ error: null });

      const inputWithChildren: CreateRewardInput = {
        ...input,
        pricePoints: { pointsCost: 250, allowOverdraw: false },
        entitlementTiers: [{ tier: 'gold', benefit: { match_play: 50 } }],
        limits: [{ maxIssues: 3, scope: 'per_gaming_day' }],
        eligibility: { minPointsBalance: 100 },
      };

      await crud.createReward(supabase, inputWithChildren);

      expect(supabase.from).toHaveBeenCalledWith('reward_price_points');
      expect(supabase.from).toHaveBeenCalledWith('reward_entitlement_tier');
      expect(supabase.from).toHaveBeenCalledWith('reward_limits');
      expect(supabase.from).toHaveBeenCalledWith('reward_eligibility');
    });

    it('maps 23505 unique violation to UNIQUE_VIOLATION', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "reward_catalog_casino_id_code_key"',
        },
      });

      await expect(crud.createReward(supabase, input)).rejects.toMatchObject({
        code: 'UNIQUE_VIOLATION',
      });
    });

    it('maps 23503 FK violation on casino_id to NOT_FOUND', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({
        data: null,
        error: {
          code: '23503',
          message: 'violates foreign key constraint "casino_id"',
        },
      });

      await expect(crud.createReward(supabase, input)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('maps FORBIDDEN error correctly', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({
        data: null,
        error: { message: 'FORBIDDEN: insufficient permissions' },
      });

      await expect(crud.createReward(supabase, input)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('maps 42501 RLS violation to FORBIDDEN', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({
        data: null,
        error: {
          code: '42501',
          message: 'new row violates row-level security policy',
        },
      });

      await expect(crud.createReward(supabase, input)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('updateReward', () => {
    const input: UpdateRewardInput = {
      id: 'reward-uuid-1',
      name: 'Updated Name',
      isActive: false,
    };

    it('updates catalog and returns DTO', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      const updatedRow = {
        ...catalogRow,
        name: 'Updated Name',
        is_active: false,
      };
      builder.single.mockResolvedValue({ data: updatedRow, error: null });

      const result = await crud.updateReward(supabase, input);

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Name',
          is_active: false,
        }),
      );
      expect(builder.eq).toHaveBeenCalledWith('id', 'reward-uuid-1');
      expect(result.name).toBe('Updated Name');
    });

    it('maps only provided fields to update', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({ data: catalogRow, error: null });

      await crud.updateReward(supabase, { id: 'x', name: 'New' });

      expect(builder.update).toHaveBeenCalledWith({ name: 'New' });
    });

    it('throws DomainError on error', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      await expect(crud.updateReward(supabase, input)).rejects.toBeInstanceOf(
        DomainError,
      );
    });
  });

  describe('toggleRewardActive', () => {
    it('updates is_active and returns DTO', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      const updatedRow = { ...catalogRow, is_active: false };
      builder.single.mockResolvedValue({ data: updatedRow, error: null });

      const result = await crud.toggleRewardActive(
        supabase,
        'reward-uuid-1',
        false,
      );

      expect(builder.update).toHaveBeenCalledWith({ is_active: false });
      expect(builder.eq).toHaveBeenCalledWith('id', 'reward-uuid-1');
      expect(result.isActive).toBe(false);
    });

    it('throws DomainError on error', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({
        data: null,
        error: { message: 'UNAUTHORIZED: RLS context not set' },
      });

      await expect(
        crud.toggleRewardActive(supabase, 'reward-uuid-1', true),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('getEarnConfig', () => {
    it('returns DTO when config exists', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('loyalty_earn_config');
      builder.maybeSingle.mockResolvedValue({
        data: earnConfigRow,
        error: null,
      });

      const result = await crud.getEarnConfig(supabase);

      expect(supabase.from).toHaveBeenCalledWith('loyalty_earn_config');
      expect(result).not.toBeNull();
      expect(result?.pointsPerTheo).toBe(10);
    });

    it('returns null when no config exists', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('loyalty_earn_config');
      builder.maybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await crud.getEarnConfig(supabase);

      expect(result).toBeNull();
    });

    it('throws DomainError on error', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('loyalty_earn_config');
      builder.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'UNAUTHORIZED: RLS context not set' },
      });

      await expect(crud.getEarnConfig(supabase)).rejects.toBeInstanceOf(
        DomainError,
      );
    });
  });

  describe('upsertEarnConfig', () => {
    const input: UpsertEarnConfigInput = {
      casinoId: 'casino-uuid-1',
      pointsPerTheo: 15,
      roundingPolicy: 'ceil',
    };

    it('updates existing config when found', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('loyalty_earn_config');

      // First call: maybeSingle to check existing
      builder.maybeSingle.mockResolvedValueOnce({
        data: earnConfigRow,
        error: null,
      });
      // Second call: single after update
      const updatedRow = {
        ...earnConfigRow,
        points_per_theo: 15,
        rounding_policy: 'ceil',
      };
      builder.single.mockResolvedValue({ data: updatedRow, error: null });

      const result = await crud.upsertEarnConfig(supabase, input);

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          points_per_theo: 15,
          rounding_policy: 'ceil',
        }),
      );
      expect(result.pointsPerTheo).toBe(15);
    });

    it('inserts new config when none exists', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('loyalty_earn_config');

      // First call: maybeSingle returns null (no existing config)
      builder.maybeSingle.mockResolvedValue({ data: null, error: null });
      // Insert then single
      builder.single.mockResolvedValue({
        data: {
          ...earnConfigRow,
          points_per_theo: 15,
          rounding_policy: 'ceil',
        },
        error: null,
      });

      const result = await crud.upsertEarnConfig(supabase, input);

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          casino_id: 'casino-uuid-1',
          points_per_theo: 15,
          rounding_policy: 'ceil',
        }),
      );
      expect(result).not.toBeNull();
    });

    it('uses defaults for missing fields on insert', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('loyalty_earn_config');

      builder.maybeSingle.mockResolvedValue({ data: null, error: null });
      builder.single.mockResolvedValue({
        data: earnConfigRow,
        error: null,
      });

      await crud.upsertEarnConfig(supabase, {
        casinoId: 'casino-uuid-1',
      });

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          points_per_theo: 10,
          default_point_multiplier: 1.0,
          rounding_policy: 'floor',
          is_active: true,
          effective_from: null,
        }),
      );
    });

    it('throws DomainError on insert error', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('loyalty_earn_config');

      // First maybeSingle: no existing config (note: error from first query is not checked)
      builder.maybeSingle.mockResolvedValue({ data: null, error: null });
      // Insert path: single returns error
      builder.single.mockResolvedValue({
        data: null,
        error: { message: 'FORBIDDEN: admin only' },
      });

      await expect(
        crud.upsertEarnConfig(supabase, input),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('listEligibleRewards', () => {
    it('returns empty array when no active rewards', async () => {
      const { supabase, getBuilder } = createMockSupabase();

      // player_loyalty
      const plBuilder = getBuilder('player_loyalty');
      plBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

      // reward_catalog
      const catBuilder = getBuilder('reward_catalog');
      catBuilder.order.mockResolvedValue({ data: [], error: null });

      const result = await crud.listEligibleRewards(supabase, 'player-uuid-1');

      expect(result).toEqual([]);
    });

    it('filters out rewards where player does not meet min_points_balance', async () => {
      const { supabase, getBuilder } = createMockSupabase();

      // Player with low balance
      const plBuilder = getBuilder('player_loyalty');
      plBuilder.maybeSingle.mockResolvedValue({
        data: { current_balance: 50, tier: null },
        error: null,
      });

      // One active reward requiring 100 points
      const catBuilder = getBuilder('reward_catalog');
      catBuilder.order.mockResolvedValue({
        data: [catalogRow],
        error: null,
      });

      // Child records
      const ppBuilder = getBuilder('reward_price_points');
      ppBuilder.in.mockReturnValue(ppBuilder);
      ppBuilder.in.mockResolvedValue({ data: [], error: null });

      const tierBuilder = getBuilder('reward_entitlement_tier');
      tierBuilder.in.mockReturnValue(tierBuilder);
      tierBuilder.order.mockResolvedValue({ data: [], error: null });

      const limitsBuilder = getBuilder('reward_limits');
      limitsBuilder.in.mockResolvedValue({ data: [], error: null });

      const eligBuilder = getBuilder('reward_eligibility');
      eligBuilder.in.mockResolvedValue({
        data: [
          {
            id: 'elig-1',
            reward_id: 'reward-uuid-1',
            casino_id: 'casino-uuid-1',
            min_points_balance: 100,
            min_tier: null,
            max_tier: null,
            visit_kinds: null,
          },
        ],
        error: null,
      });

      const result = await crud.listEligibleRewards(supabase, 'player-uuid-1');

      // Player has 50 pts, reward requires 100 — should be filtered out
      expect(result).toEqual([]);
    });

    it('includes rewards with no eligibility criteria', async () => {
      const { supabase, getBuilder } = createMockSupabase();

      const plBuilder = getBuilder('player_loyalty');
      plBuilder.maybeSingle.mockResolvedValue({
        data: { current_balance: 0, tier: null },
        error: null,
      });

      const catBuilder = getBuilder('reward_catalog');
      catBuilder.order.mockResolvedValue({
        data: [catalogRow],
        error: null,
      });

      // No child records
      const ppBuilder = getBuilder('reward_price_points');
      ppBuilder.in.mockReturnValue(ppBuilder);
      ppBuilder.in.mockResolvedValue({ data: [], error: null });

      const tierBuilder = getBuilder('reward_entitlement_tier');
      tierBuilder.in.mockReturnValue(tierBuilder);
      tierBuilder.order.mockResolvedValue({ data: [], error: null });

      const limitsBuilder = getBuilder('reward_limits');
      limitsBuilder.in.mockResolvedValue({ data: [], error: null });

      const eligBuilder = getBuilder('reward_eligibility');
      eligBuilder.in.mockResolvedValue({ data: [], error: null });

      const result = await crud.listEligibleRewards(supabase, 'player-uuid-1');

      // No eligibility row means open access
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('reward-uuid-1');
    });

    it('throws DomainError on rewards query error', async () => {
      const { supabase, getBuilder } = createMockSupabase();

      const plBuilder = getBuilder('player_loyalty');
      plBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

      const catBuilder = getBuilder('reward_catalog');
      catBuilder.order.mockResolvedValue({
        data: null,
        error: { message: 'UNAUTHORIZED: RLS context not set' },
      });

      await expect(
        crud.listEligibleRewards(supabase, 'player-uuid-1'),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('error mapping', () => {
    it('maps UNAUTHORIZED message to UNAUTHORIZED code', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.limit.mockResolvedValue({
        data: null,
        error: { message: 'UNAUTHORIZED: RLS context not set' },
      });

      await expect(crud.listRewards(supabase)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('maps 23505 on entitlement tier to UNIQUE_VIOLATION', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({ data: catalogRow, error: null });

      const tierBuilder = getBuilder('reward_entitlement_tier');
      tierBuilder.insert.mockResolvedValue({
        error: {
          code: '23505',
          message:
            'duplicate key violates unique constraint "reward_entitlement_tier"',
        },
      });

      await expect(
        crud.createReward(supabase, {
          ...{
            casinoId: 'c',
            code: 'X',
            family: 'entitlement',
            kind: 'k',
            name: 'N',
          },
          entitlementTiers: [{ tier: 'gold', benefit: {} }],
        }),
      ).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    });

    it('maps 23503 on reward_id to NOT_FOUND', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({ data: catalogRow, error: null });

      const ppBuilder = getBuilder('reward_price_points');
      ppBuilder.insert.mockResolvedValue({
        error: {
          code: '23503',
          message: 'violates foreign key constraint "reward_id"',
        },
      });

      await expect(
        crud.createReward(supabase, {
          casinoId: 'c',
          code: 'X',
          family: 'points_comp',
          kind: 'k',
          name: 'N',
          pricePoints: { pointsCost: 100 },
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('maps generic 23503 to FOREIGN_KEY_VIOLATION', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({
        data: null,
        error: {
          code: '23503',
          message: 'violates foreign key constraint "something_else"',
        },
      });

      await expect(
        crud.createReward(supabase, {
          casinoId: 'c',
          code: 'X',
          family: 'points_comp',
          kind: 'k',
          name: 'N',
        }),
      ).rejects.toMatchObject({ code: 'FOREIGN_KEY_VIOLATION' });
    });

    it('maps generic 23505 to UNIQUE_VIOLATION', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.single.mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "something_generic"',
        },
      });

      await expect(
        crud.createReward(supabase, {
          casinoId: 'c',
          code: 'X',
          family: 'points_comp',
          kind: 'k',
          name: 'N',
        }),
      ).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    });

    it('maps unknown errors to INTERNAL_ERROR', async () => {
      const { supabase, getBuilder } = createMockSupabase();
      const builder = getBuilder('reward_catalog');
      builder.limit.mockResolvedValue({
        data: null,
        error: { code: 'XXXXX', message: 'something unexpected' },
      });

      await expect(crud.listRewards(supabase)).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });
  });
});
