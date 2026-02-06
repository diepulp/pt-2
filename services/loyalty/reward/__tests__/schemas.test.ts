/**
 * Reward Catalog Zod Schema Unit Tests
 *
 * Tests validation schemas: valid accept, invalid reject, coercion behavior.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS5
 */

import {
  createRewardSchema,
  eligibleRewardsQuerySchema,
  rewardListQuerySchema,
  rewardRouteParamsSchema,
  updateRewardSchema,
  upsertEarnConfigSchema,
} from '../schemas';

describe('reward schemas', () => {
  describe('rewardRouteParamsSchema', () => {
    it('accepts valid UUID', () => {
      const result = rewardRouteParamsSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.success).toBe(true);
    });

    it('rejects non-UUID string', () => {
      const result = rewardRouteParamsSchema.safeParse({ id: 'not-a-uuid' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Invalid reward ID');
      }
    });

    it('rejects missing id', () => {
      const result = rewardRouteParamsSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('createRewardSchema', () => {
    const validInput = {
      code: 'COMP_MEAL_25',
      family: 'points_comp' as const,
      kind: 'meal',
      name: '$25 Meal Comp',
    };

    it('accepts valid minimal input', () => {
      const result = createRewardSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('accepts input with all optional fields', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        fulfillment: 'restaurant',
        metadata: { category: 'dining' },
        uiTags: ['popular'],
        pricePoints: { pointsCost: 250, allowOverdraw: false },
        entitlementTiers: [{ tier: 'gold', benefit: { match_play: 50 } }],
        limits: [
          {
            maxIssues: 3,
            scope: 'per_gaming_day',
            cooldownMinutes: 60,
            requiresNote: true,
          },
        ],
        eligibility: {
          minPointsBalance: 100,
          minTier: 'silver',
          maxTier: 'platinum',
          visitKinds: ['gaming'],
        },
      });

      expect(result.success).toBe(true);
    });

    it('rejects empty code', () => {
      const result = createRewardSchema.safeParse({ ...validInput, code: '' });

      expect(result.success).toBe(false);
    });

    it('rejects code over 50 chars', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        code: 'x'.repeat(51),
      });

      expect(result.success).toBe(false);
    });

    it('rejects invalid family', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        family: 'invalid_family',
      });

      expect(result.success).toBe(false);
    });

    it('accepts points_comp family', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        family: 'points_comp',
      });

      expect(result.success).toBe(true);
    });

    it('accepts entitlement family', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        family: 'entitlement',
      });

      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = createRewardSchema.safeParse({ ...validInput, name: '' });

      expect(result.success).toBe(false);
    });

    it('rejects name over 200 chars', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        name: 'x'.repeat(201),
      });

      expect(result.success).toBe(false);
    });

    it('rejects negative points cost', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        pricePoints: { pointsCost: -1 },
      });

      expect(result.success).toBe(false);
    });

    it('accepts zero points cost (complimentary)', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        pricePoints: { pointsCost: 0 },
      });

      expect(result.success).toBe(true);
    });

    it('rejects non-integer points cost', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        pricePoints: { pointsCost: 1.5 },
      });

      expect(result.success).toBe(false);
    });

    it('rejects zero maxIssues in limits', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        limits: [{ maxIssues: 0, scope: 'per_gaming_day' }],
      });

      expect(result.success).toBe(false);
    });

    it('rejects negative maxIssues in limits', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        limits: [{ maxIssues: -1, scope: 'per_gaming_day' }],
      });

      expect(result.success).toBe(false);
    });

    it('rejects empty tier in entitlement tiers', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        entitlementTiers: [{ tier: '', benefit: {} }],
      });

      expect(result.success).toBe(false);
    });

    it('rejects empty scope in limits', () => {
      const result = createRewardSchema.safeParse({
        ...validInput,
        limits: [{ maxIssues: 3, scope: '' }],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('updateRewardSchema', () => {
    it('accepts valid partial update', () => {
      const result = updateRewardSchema.safeParse({ name: 'Updated Name' });

      expect(result.success).toBe(true);
    });

    it('accepts empty object (no changes)', () => {
      const result = updateRewardSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it('accepts isActive boolean', () => {
      const result = updateRewardSchema.safeParse({ isActive: false });

      expect(result.success).toBe(true);
    });

    it('accepts nullable fulfillment', () => {
      const result = updateRewardSchema.safeParse({ fulfillment: null });

      expect(result.success).toBe(true);
    });

    it('accepts nullable uiTags', () => {
      const result = updateRewardSchema.safeParse({ uiTags: null });

      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = updateRewardSchema.safeParse({ name: '' });

      expect(result.success).toBe(false);
    });

    it('rejects name over 200 chars', () => {
      const result = updateRewardSchema.safeParse({
        name: 'x'.repeat(201),
      });

      expect(result.success).toBe(false);
    });
  });

  describe('rewardListQuerySchema', () => {
    it('accepts empty query (all defaults)', () => {
      const result = rewardListQuerySchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it('accepts all filter params', () => {
      const result = rewardListQuerySchema.safeParse({
        family: 'points_comp',
        kind: 'meal',
        isActive: true,
        search: 'meal',
        limit: 25,
        offset: 10,
      });

      expect(result.success).toBe(true);
    });

    it('coerces string boolean for isActive', () => {
      const result = rewardListQuerySchema.safeParse({ isActive: 'true' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isActive).toBe(true);
      }
    });

    it('coerces string number for limit', () => {
      const result = rewardListQuerySchema.safeParse({ limit: '50' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('coerces string number for offset', () => {
      const result = rewardListQuerySchema.safeParse({ offset: '10' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.offset).toBe(10);
      }
    });

    it('rejects limit over 100', () => {
      const result = rewardListQuerySchema.safeParse({ limit: 101 });

      expect(result.success).toBe(false);
    });

    it('rejects negative offset', () => {
      const result = rewardListQuerySchema.safeParse({ offset: -1 });

      expect(result.success).toBe(false);
    });

    it('rejects zero limit', () => {
      const result = rewardListQuerySchema.safeParse({ limit: 0 });

      expect(result.success).toBe(false);
    });

    it('rejects invalid family enum', () => {
      const result = rewardListQuerySchema.safeParse({
        family: 'not_a_family',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('upsertEarnConfigSchema', () => {
    it('accepts valid partial update', () => {
      const result = upsertEarnConfigSchema.safeParse({
        pointsPerTheo: 15,
        defaultPointMultiplier: 2.0,
        roundingPolicy: 'ceil',
      });

      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = upsertEarnConfigSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it('accepts nullable effectiveFrom', () => {
      const result = upsertEarnConfigSchema.safeParse({
        effectiveFrom: null,
      });

      expect(result.success).toBe(true);
    });

    it('accepts valid datetime for effectiveFrom', () => {
      const result = upsertEarnConfigSchema.safeParse({
        effectiveFrom: '2026-03-01T00:00:00Z',
      });

      expect(result.success).toBe(true);
    });

    it('rejects non-positive pointsPerTheo', () => {
      const result = upsertEarnConfigSchema.safeParse({ pointsPerTheo: 0 });

      expect(result.success).toBe(false);
    });

    it('rejects negative multiplier', () => {
      const result = upsertEarnConfigSchema.safeParse({
        defaultPointMultiplier: -1,
      });

      expect(result.success).toBe(false);
    });

    it('rejects invalid rounding policy', () => {
      const result = upsertEarnConfigSchema.safeParse({
        roundingPolicy: 'truncate',
      });

      expect(result.success).toBe(false);
    });

    it('accepts all valid rounding policies', () => {
      for (const policy of ['floor', 'ceil', 'round']) {
        const result = upsertEarnConfigSchema.safeParse({
          roundingPolicy: policy,
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid datetime for effectiveFrom', () => {
      const result = upsertEarnConfigSchema.safeParse({
        effectiveFrom: 'not-a-date',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('eligibleRewardsQuerySchema', () => {
    it('accepts valid UUID', () => {
      const result = eligibleRewardsQuerySchema.safeParse({
        playerId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.success).toBe(true);
    });

    it('rejects missing playerId', () => {
      const result = eligibleRewardsQuerySchema.safeParse({});

      expect(result.success).toBe(false);
    });

    it('rejects non-UUID playerId', () => {
      const result = eligibleRewardsQuerySchema.safeParse({
        playerId: 'not-a-uuid',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Invalid player ID');
      }
    });
  });
});
