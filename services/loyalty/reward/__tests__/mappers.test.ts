/**
 * Reward Catalog Mappers Unit Tests
 *
 * Tests all Row → DTO transformations, type guards, composite mappers,
 * and error shape helper. Coverage target: 100%.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS5
 */

import {
  isLoyaltyEarnConfigRow,
  isRewardCatalogRow,
  isRewardEligibilityRow,
  isRewardEntitlementTierRow,
  isRewardLimitsRow,
  isRewardPricePointsRow,
  parseEarnConfigRow,
  parseRewardCatalogRow,
  parseRewardEligibilityRow,
  parseRewardEntitlementTierRow,
  parseRewardLimitsRow,
  parseRewardPricePointsRow,
  toEarnConfigDTO,
  toEligibleRewardDTO,
  toErrorShape,
  toRewardCatalogDTO,
  toRewardDetailDTO,
  toRewardEligibilityDTO,
  toRewardEntitlementTierDTO,
  toRewardLimitDTO,
  toRewardPricePointsDTO,
} from '../mappers';
import type {
  LoyaltyEarnConfigRow,
  RewardCatalogRow,
  RewardEligibilityRow,
  RewardEntitlementTierRow,
  RewardLimitsRow,
  RewardPricePointsRow,
} from '../mappers';

// === Test Fixtures ===

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
  ui_tags: ['popular', 'dining'],
  created_at: '2026-02-06T01:00:00Z',
  updated_at: '2026-02-06T01:00:00Z',
};

const pricePointsRow: RewardPricePointsRow = {
  reward_id: 'reward-uuid-1',
  casino_id: 'casino-uuid-1',
  points_cost: 250,
  allow_overdraw: false,
};

const entitlementTierRow: RewardEntitlementTierRow = {
  id: 'tier-uuid-1',
  reward_id: 'reward-uuid-1',
  casino_id: 'casino-uuid-1',
  tier: 'gold',
  benefit: { match_play: 50 },
};

const limitsRow: RewardLimitsRow = {
  id: 'limit-uuid-1',
  reward_id: 'reward-uuid-1',
  casino_id: 'casino-uuid-1',
  max_issues: 3,
  scope: 'per_gaming_day',
  cooldown_minutes: 60,
  requires_note: true,
};

const eligibilityRow: RewardEligibilityRow = {
  id: 'elig-uuid-1',
  reward_id: 'reward-uuid-1',
  casino_id: 'casino-uuid-1',
  min_points_balance: 100,
  min_tier: 'silver',
  max_tier: 'platinum',
  visit_kinds: ['gaming', 'reward_identified'],
};

const earnConfigRow: LoyaltyEarnConfigRow = {
  casino_id: 'casino-uuid-1',
  points_per_theo: 10,
  default_point_multiplier: 1.5,
  rounding_policy: 'floor',
  is_active: true,
  effective_from: '2026-01-01T00:00:00Z',
  created_at: '2026-02-06T01:00:00Z',
  updated_at: '2026-02-06T01:00:00Z',
};

// === Type Guards ===

describe('reward mappers', () => {
  describe('isRewardCatalogRow', () => {
    it('returns true for valid row', () => {
      expect(isRewardCatalogRow(catalogRow)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isRewardCatalogRow(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isRewardCatalogRow('string')).toBe(false);
      expect(isRewardCatalogRow(42)).toBe(false);
      expect(isRewardCatalogRow(undefined)).toBe(false);
    });

    it('returns false when missing required fields', () => {
      expect(isRewardCatalogRow({ id: 'x', casino_id: 'y' })).toBe(false);
    });
  });

  describe('isRewardPricePointsRow', () => {
    it('returns true for valid row', () => {
      expect(isRewardPricePointsRow(pricePointsRow)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isRewardPricePointsRow(null)).toBe(false);
    });

    it('returns false when missing reward_id', () => {
      expect(isRewardPricePointsRow({ points_cost: 100 })).toBe(false);
    });
  });

  describe('isRewardEntitlementTierRow', () => {
    it('returns true for valid row', () => {
      expect(isRewardEntitlementTierRow(entitlementTierRow)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isRewardEntitlementTierRow(null)).toBe(false);
    });

    it('returns false when missing required fields', () => {
      expect(isRewardEntitlementTierRow({ id: 'x' })).toBe(false);
    });
  });

  describe('isRewardLimitsRow', () => {
    it('returns true for valid row', () => {
      expect(isRewardLimitsRow(limitsRow)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isRewardLimitsRow(null)).toBe(false);
    });

    it('returns false when missing required fields', () => {
      expect(isRewardLimitsRow({ id: 'x', reward_id: 'y' })).toBe(false);
    });
  });

  describe('isRewardEligibilityRow', () => {
    it('returns true for valid row', () => {
      expect(isRewardEligibilityRow(eligibilityRow)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isRewardEligibilityRow(null)).toBe(false);
    });

    it('returns false when missing casino_id', () => {
      expect(isRewardEligibilityRow({ id: 'x', reward_id: 'y' })).toBe(false);
    });
  });

  describe('isLoyaltyEarnConfigRow', () => {
    it('returns true for valid row', () => {
      expect(isLoyaltyEarnConfigRow(earnConfigRow)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isLoyaltyEarnConfigRow(null)).toBe(false);
    });

    it('returns false when missing points_per_theo', () => {
      expect(isLoyaltyEarnConfigRow({ casino_id: 'x' })).toBe(false);
    });
  });

  // === Direct Mappers ===

  describe('toRewardCatalogDTO', () => {
    it('maps snake_case row to camelCase DTO', () => {
      const result = toRewardCatalogDTO(catalogRow);

      expect(result).toEqual({
        id: 'reward-uuid-1',
        casinoId: 'casino-uuid-1',
        code: 'COMP_MEAL_25',
        family: 'points_comp',
        kind: 'meal',
        name: '$25 Meal Comp',
        isActive: true,
        fulfillment: 'restaurant',
        metadata: { category: 'dining' },
        uiTags: ['popular', 'dining'],
        createdAt: '2026-02-06T01:00:00Z',
        updatedAt: '2026-02-06T01:00:00Z',
      });
    });

    it('handles null fulfillment and ui_tags', () => {
      const row: RewardCatalogRow = {
        ...catalogRow,
        fulfillment: null,
        ui_tags: null,
      };

      const result = toRewardCatalogDTO(row);

      expect(result.fulfillment).toBeNull();
      expect(result.uiTags).toBeNull();
    });

    it('narrows null metadata to empty object', () => {
      const row: RewardCatalogRow = {
        ...catalogRow,
        metadata: null,
      };

      const result = toRewardCatalogDTO(row);

      expect(result.metadata).toEqual({});
    });

    it('narrows array metadata to empty object', () => {
      const row: RewardCatalogRow = {
        ...catalogRow,
        metadata: [1, 2, 3],
      };

      const result = toRewardCatalogDTO(row);

      expect(result.metadata).toEqual({});
    });
  });

  describe('toRewardPricePointsDTO', () => {
    it('maps snake_case row to camelCase DTO', () => {
      const result = toRewardPricePointsDTO(pricePointsRow);

      expect(result).toEqual({
        rewardId: 'reward-uuid-1',
        casinoId: 'casino-uuid-1',
        pointsCost: 250,
        allowOverdraw: false,
      });
    });

    it('converts points_cost to Number', () => {
      const row: RewardPricePointsRow = {
        ...pricePointsRow,
        // Supabase may return numeric as string
        points_cost: 0,
      };

      const result = toRewardPricePointsDTO(row);

      expect(result.pointsCost).toBe(0);
      expect(typeof result.pointsCost).toBe('number');
    });
  });

  describe('toRewardEntitlementTierDTO', () => {
    it('maps snake_case row to camelCase DTO', () => {
      const result = toRewardEntitlementTierDTO(entitlementTierRow);

      expect(result).toEqual({
        id: 'tier-uuid-1',
        rewardId: 'reward-uuid-1',
        casinoId: 'casino-uuid-1',
        tier: 'gold',
        benefit: { match_play: 50 },
      });
    });

    it('narrows null benefit to empty object', () => {
      const row: RewardEntitlementTierRow = {
        ...entitlementTierRow,
        benefit: null,
      };

      const result = toRewardEntitlementTierDTO(row);

      expect(result.benefit).toEqual({});
    });
  });

  describe('toRewardLimitDTO', () => {
    it('maps snake_case row to camelCase DTO', () => {
      const result = toRewardLimitDTO(limitsRow);

      expect(result).toEqual({
        id: 'limit-uuid-1',
        rewardId: 'reward-uuid-1',
        casinoId: 'casino-uuid-1',
        maxIssues: 3,
        scope: 'per_gaming_day',
        cooldownMinutes: 60,
        requiresNote: true,
      });
    });

    it('handles null cooldown_minutes', () => {
      const row: RewardLimitsRow = {
        ...limitsRow,
        cooldown_minutes: null,
      };

      const result = toRewardLimitDTO(row);

      expect(result.cooldownMinutes).toBeNull();
    });
  });

  describe('toRewardEligibilityDTO', () => {
    it('maps snake_case row to camelCase DTO', () => {
      const result = toRewardEligibilityDTO(eligibilityRow);

      expect(result).toEqual({
        id: 'elig-uuid-1',
        rewardId: 'reward-uuid-1',
        casinoId: 'casino-uuid-1',
        minPointsBalance: 100,
        minTier: 'silver',
        maxTier: 'platinum',
        visitKinds: ['gaming', 'reward_identified'],
      });
    });

    it('handles all nullable fields as null', () => {
      const row: RewardEligibilityRow = {
        ...eligibilityRow,
        min_points_balance: null,
        min_tier: null,
        max_tier: null,
        visit_kinds: null,
      };

      const result = toRewardEligibilityDTO(row);

      expect(result.minPointsBalance).toBeNull();
      expect(result.minTier).toBeNull();
      expect(result.maxTier).toBeNull();
      expect(result.visitKinds).toBeNull();
    });
  });

  describe('toEarnConfigDTO', () => {
    it('maps snake_case row to camelCase DTO', () => {
      const result = toEarnConfigDTO(earnConfigRow);

      expect(result).toEqual({
        casinoId: 'casino-uuid-1',
        pointsPerTheo: 10,
        defaultPointMultiplier: 1.5,
        roundingPolicy: 'floor',
        isActive: true,
        effectiveFrom: '2026-01-01T00:00:00Z',
        createdAt: '2026-02-06T01:00:00Z',
        updatedAt: '2026-02-06T01:00:00Z',
      });
    });

    it('handles null effective_from', () => {
      const row: LoyaltyEarnConfigRow = {
        ...earnConfigRow,
        effective_from: null,
      };

      const result = toEarnConfigDTO(row);

      expect(result.effectiveFrom).toBeNull();
    });

    it('converts numeric fields to Number', () => {
      const result = toEarnConfigDTO(earnConfigRow);

      expect(typeof result.pointsPerTheo).toBe('number');
      expect(typeof result.defaultPointMultiplier).toBe('number');
    });
  });

  // === Parse Mappers (type guard + direct mapper) ===

  describe('parseRewardCatalogRow', () => {
    it('returns DTO for valid data', () => {
      const result = parseRewardCatalogRow(catalogRow);

      expect(result.id).toBe('reward-uuid-1');
      expect(result.casinoId).toBe('casino-uuid-1');
    });

    it('throws for invalid data', () => {
      expect(() => parseRewardCatalogRow({ foo: 'bar' })).toThrow(
        'Invalid RewardCatalogRow structure',
      );
    });

    it('throws for null', () => {
      expect(() => parseRewardCatalogRow(null)).toThrow(
        'Invalid RewardCatalogRow structure',
      );
    });
  });

  describe('parseRewardPricePointsRow', () => {
    it('returns DTO for valid data', () => {
      const result = parseRewardPricePointsRow(pricePointsRow);

      expect(result.rewardId).toBe('reward-uuid-1');
    });

    it('throws for invalid data', () => {
      expect(() => parseRewardPricePointsRow({ foo: 'bar' })).toThrow(
        'Invalid RewardPricePointsRow structure',
      );
    });
  });

  describe('parseRewardEntitlementTierRow', () => {
    it('returns DTO for valid data', () => {
      const result = parseRewardEntitlementTierRow(entitlementTierRow);

      expect(result.tier).toBe('gold');
    });

    it('throws for invalid data', () => {
      expect(() => parseRewardEntitlementTierRow(null)).toThrow(
        'Invalid RewardEntitlementTierRow structure',
      );
    });
  });

  describe('parseRewardLimitsRow', () => {
    it('returns DTO for valid data', () => {
      const result = parseRewardLimitsRow(limitsRow);

      expect(result.maxIssues).toBe(3);
    });

    it('throws for invalid data', () => {
      expect(() => parseRewardLimitsRow(42)).toThrow(
        'Invalid RewardLimitsRow structure',
      );
    });
  });

  describe('parseRewardEligibilityRow', () => {
    it('returns DTO for valid data', () => {
      const result = parseRewardEligibilityRow(eligibilityRow);

      expect(result.minPointsBalance).toBe(100);
    });

    it('throws for invalid data', () => {
      expect(() => parseRewardEligibilityRow(undefined)).toThrow(
        'Invalid RewardEligibilityRow structure',
      );
    });
  });

  describe('parseEarnConfigRow', () => {
    it('returns DTO for valid data', () => {
      const result = parseEarnConfigRow(earnConfigRow);

      expect(result.pointsPerTheo).toBe(10);
    });

    it('throws for invalid data', () => {
      expect(() => parseEarnConfigRow({})).toThrow(
        'Invalid LoyaltyEarnConfigRow structure',
      );
    });
  });

  // === Composite Mappers ===

  describe('toRewardDetailDTO', () => {
    it('assembles catalog + all child records', () => {
      const result = toRewardDetailDTO(
        catalogRow,
        pricePointsRow,
        [entitlementTierRow],
        [limitsRow],
        eligibilityRow,
      );

      expect(result.id).toBe('reward-uuid-1');
      expect(result.casinoId).toBe('casino-uuid-1');
      expect(result.pricePoints).toEqual({
        rewardId: 'reward-uuid-1',
        casinoId: 'casino-uuid-1',
        pointsCost: 250,
        allowOverdraw: false,
      });
      expect(result.entitlementTiers).toHaveLength(1);
      expect(result.entitlementTiers[0].tier).toBe('gold');
      expect(result.limits).toHaveLength(1);
      expect(result.limits[0].maxIssues).toBe(3);
      expect(result.eligibility).not.toBeNull();
      expect(result.eligibility?.minTier).toBe('silver');
    });

    it('handles null price points and eligibility', () => {
      const result = toRewardDetailDTO(catalogRow, null, [], [], null);

      expect(result.pricePoints).toBeNull();
      expect(result.entitlementTiers).toEqual([]);
      expect(result.limits).toEqual([]);
      expect(result.eligibility).toBeNull();
    });

    it('handles multiple child records', () => {
      const tier2: RewardEntitlementTierRow = {
        ...entitlementTierRow,
        id: 'tier-uuid-2',
        tier: 'platinum',
        benefit: { match_play: 100 },
      };
      const limit2: RewardLimitsRow = {
        ...limitsRow,
        id: 'limit-uuid-2',
        scope: 'per_month',
        max_issues: 10,
      };

      const result = toRewardDetailDTO(
        catalogRow,
        pricePointsRow,
        [entitlementTierRow, tier2],
        [limitsRow, limit2],
        eligibilityRow,
      );

      expect(result.entitlementTiers).toHaveLength(2);
      expect(result.limits).toHaveLength(2);
    });
  });

  describe('toEligibleRewardDTO', () => {
    it('assembles eligible reward DTO', () => {
      const result = toEligibleRewardDTO(
        catalogRow,
        pricePointsRow,
        [entitlementTierRow],
        [limitsRow],
        eligibilityRow,
      );

      expect(result.id).toBe('reward-uuid-1');
      expect(result.code).toBe('COMP_MEAL_25');
      expect(result.family).toBe('points_comp');
      expect(result.kind).toBe('meal');
      expect(result.name).toBe('$25 Meal Comp');
      expect(result.fulfillment).toBe('restaurant');
      expect(result.uiTags).toEqual(['popular', 'dining']);
      expect(result.pricePoints).not.toBeNull();
      expect(result.entitlementTiers).toHaveLength(1);
      expect(result.limits).toHaveLength(1);
      expect(result.eligibility).not.toBeNull();
    });

    it('handles null child records', () => {
      const result = toEligibleRewardDTO(catalogRow, null, [], [], null);

      expect(result.pricePoints).toBeNull();
      expect(result.entitlementTiers).toEqual([]);
      expect(result.limits).toEqual([]);
      expect(result.eligibility).toBeNull();
    });

    it('does not include casinoId, isActive, metadata, timestamps', () => {
      const result = toEligibleRewardDTO(catalogRow, null, [], [], null);

      // EligibleRewardDTO omits these fields
      expect(result).not.toHaveProperty('casinoId');
      expect(result).not.toHaveProperty('isActive');
      expect(result).not.toHaveProperty('metadata');
      expect(result).not.toHaveProperty('createdAt');
      expect(result).not.toHaveProperty('updatedAt');
    });
  });

  // === Error Shape Helper ===

  describe('toErrorShape', () => {
    it('extracts code and message from error-like object', () => {
      const error = { code: '23505', message: 'duplicate key' };

      const result = toErrorShape(error);

      expect(result).toEqual({ code: '23505', message: 'duplicate key' });
    });

    it('handles missing code', () => {
      const error = { message: 'something failed' };

      const result = toErrorShape(error);

      expect(result).toEqual({ code: undefined, message: 'something failed' });
    });

    it('converts non-object to string message', () => {
      const result = toErrorShape('raw error string');

      expect(result).toEqual({ message: 'raw error string' });
    });

    it('handles null', () => {
      const result = toErrorShape(null);

      expect(result).toEqual({ message: 'null' });
    });

    it('handles non-string message in object', () => {
      const error = { message: 42 };

      const result = toErrorShape(error);

      expect(result.message).toBe('[object Object]');
    });
  });
});
