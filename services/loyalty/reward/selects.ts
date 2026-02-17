/**
 * LoyaltyService Reward Select Projections
 *
 * Named column sets for Supabase queries.
 * Prevents over-fetching and maintains consistent field exposure.
 * Pattern A: Manual column lists matching DTO contracts.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS3
 */

// === Reward Catalog Selects ===

export const REWARD_CATALOG_SELECT =
  'id, casino_id, code, family, kind, name, is_active, fulfillment, metadata, ui_tags, created_at, updated_at' as const;

// === Reward Price Points Selects ===

export const REWARD_PRICE_POINTS_SELECT =
  'reward_id, casino_id, points_cost, allow_overdraw' as const;

// === Reward Entitlement Tier Selects ===

export const REWARD_ENTITLEMENT_TIER_SELECT =
  'id, reward_id, casino_id, tier, benefit' as const;

// === Reward Limits Selects ===

export const REWARD_LIMITS_SELECT =
  'id, reward_id, casino_id, max_issues, scope, cooldown_minutes, requires_note' as const;

// === Reward Eligibility Selects ===

export const REWARD_ELIGIBILITY_SELECT =
  'id, reward_id, casino_id, min_points_balance, min_tier, max_tier, visit_kinds' as const;

// === Loyalty Earn Config Selects ===

export const LOYALTY_EARN_CONFIG_SELECT =
  'casino_id, points_per_theo, default_point_multiplier, rounding_policy, is_active, effective_from, created_at, updated_at' as const;
