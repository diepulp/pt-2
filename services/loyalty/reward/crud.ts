/**
 * LoyaltyService Reward Catalog CRUD Operations
 *
 * Database operations for reward catalog management.
 * Uses direct table queries via PostgREST (no RPCs needed for catalog CRUD).
 * All writes are role-gated by RLS policies.
 * Pattern A (Contract-First): Manual DTOs for cross-context consumption.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS3
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  CreateRewardInput,
  EligibleRewardDTO,
  LoyaltyEarnConfigDTO,
  RewardCatalogDTO,
  RewardDetailDTO,
  RewardListQuery,
  UpdateRewardInput,
  UpsertEarnConfigInput,
} from './dtos';
import {
  isLoyaltyEarnConfigRow,
  isRewardCatalogRow,
  isRewardEligibilityRow,
  isRewardEntitlementTierRow,
  isRewardLimitsRow,
  isRewardPricePointsRow,
  parseRewardCatalogRow,
  toEarnConfigDTO,
  toEligibleRewardDTO,
  toErrorShape,
  toJson,
  toRewardCatalogDTO,
  toRewardDetailDTO,
} from './mappers';
import type {
  RewardCatalogRow,
  RewardEligibilityRow,
  RewardEntitlementTierRow,
  RewardLimitsRow,
  RewardPricePointsRow,
} from './mappers';
import {
  LOYALTY_EARN_CONFIG_SELECT,
  REWARD_CATALOG_SELECT,
  REWARD_ELIGIBILITY_SELECT,
  REWARD_ENTITLEMENT_TIER_SELECT,
  REWARD_LIMITS_SELECT,
  REWARD_PRICE_POINTS_SELECT,
} from './selects';

// === Error Mapping ===

function mapRewardError(error: {
  code?: string;
  message: string;
}): DomainError {
  const message = error.message || '';

  if (message.includes('UNAUTHORIZED')) {
    return new DomainError(
      'UNAUTHORIZED',
      'RLS context not set (authentication required)',
    );
  }

  if (message.includes('FORBIDDEN')) {
    return new DomainError(
      'FORBIDDEN',
      'Insufficient permissions for reward operation',
    );
  }

  if (error.code === '23505') {
    if (message.includes('reward_catalog_casino_id_code_key')) {
      return new DomainError(
        'UNIQUE_VIOLATION',
        'A reward with this code already exists for this casino',
      );
    }
    if (message.includes('reward_entitlement_tier')) {
      return new DomainError(
        'UNIQUE_VIOLATION',
        'An entitlement tier already exists for this reward and tier level',
      );
    }
    return new DomainError('UNIQUE_VIOLATION', 'Duplicate entry detected');
  }

  if (error.code === '23503') {
    if (message.includes('reward_id')) {
      return new DomainError('NOT_FOUND', 'Reward not found');
    }
    if (message.includes('casino_id')) {
      return new DomainError('NOT_FOUND', 'Casino not found');
    }
    return new DomainError(
      'FOREIGN_KEY_VIOLATION',
      'Referenced record not found',
    );
  }

  if (error.code === 'PGRST116' || message.includes('No rows found')) {
    return new DomainError('NOT_FOUND', 'Requested reward not found');
  }

  // RLS policy violation surfaces as 42501
  if (error.code === '42501') {
    return new DomainError(
      'FORBIDDEN',
      'Insufficient permissions for reward operation',
    );
  }

  return new DomainError('INTERNAL_ERROR', message, { details: error });
}

// === Reward Catalog Operations ===

/**
 * Lists reward catalog entries for the current casino.
 */
export async function listRewards(
  supabase: SupabaseClient<Database>,
  query: RewardListQuery = {},
): Promise<RewardCatalogDTO[]> {
  try {
    let builder = supabase
      .from('reward_catalog')
      .select(REWARD_CATALOG_SELECT)
      .order('created_at', { ascending: false });

    if (query.family) {
      builder = builder.eq('family', query.family);
    }

    if (query.kind) {
      builder = builder.eq('kind', query.kind);
    }

    if (query.isActive !== undefined) {
      builder = builder.eq('is_active', query.isActive);
    }

    if (query.search) {
      builder = builder.ilike('name', `%${query.search}%`);
    }

    const limit = Math.min(query.limit ?? 50, 100);
    builder = builder.limit(limit);

    if (query.offset) {
      builder = builder.range(query.offset, query.offset + limit - 1);
    }

    const { data, error } = await builder;

    if (error) {
      throw mapRewardError(error);
    }

    return (data ?? []).map((row: unknown) => parseRewardCatalogRow(row));
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapRewardError(toErrorShape(error));
  }
}

/**
 * Gets a single reward with all child records (detail view).
 */
export async function getReward(
  supabase: SupabaseClient<Database>,
  rewardId: string,
): Promise<RewardDetailDTO | null> {
  try {
    // Fetch catalog entry
    const { data: catalog, error: catalogError } = await supabase
      .from('reward_catalog')
      .select(REWARD_CATALOG_SELECT)
      .eq('id', rewardId)
      .maybeSingle();

    if (catalogError) {
      throw mapRewardError(catalogError);
    }

    if (!catalog || !isRewardCatalogRow(catalog)) {
      return null;
    }

    // Fetch child records in parallel
    const [pricePointsResult, tiersResult, limitsResult, eligibilityResult] =
      await Promise.all([
        supabase
          .from('reward_price_points')
          .select(REWARD_PRICE_POINTS_SELECT)
          .eq('reward_id', rewardId)
          .maybeSingle(),
        supabase
          .from('reward_entitlement_tier')
          .select(REWARD_ENTITLEMENT_TIER_SELECT)
          .eq('reward_id', rewardId)
          .order('tier'),
        supabase
          .from('reward_limits')
          .select(REWARD_LIMITS_SELECT)
          .eq('reward_id', rewardId),
        supabase
          .from('reward_eligibility')
          .select(REWARD_ELIGIBILITY_SELECT)
          .eq('reward_id', rewardId)
          .maybeSingle(),
      ]);

    if (pricePointsResult.error) throw mapRewardError(pricePointsResult.error);
    if (tiersResult.error) throw mapRewardError(tiersResult.error);
    if (limitsResult.error) throw mapRewardError(limitsResult.error);
    if (eligibilityResult.error) throw mapRewardError(eligibilityResult.error);

    const ppData = pricePointsResult.data;
    const pricePoints: RewardPricePointsRow | null =
      ppData && isRewardPricePointsRow(ppData) ? ppData : null;

    const tiers = (tiersResult.data ?? []).filter(
      (row: unknown): row is RewardEntitlementTierRow =>
        isRewardEntitlementTierRow(row),
    );

    const limits = (limitsResult.data ?? []).filter(
      (row: unknown): row is RewardLimitsRow => isRewardLimitsRow(row),
    );

    const eligData = eligibilityResult.data;
    const eligibility: RewardEligibilityRow | null =
      eligData && isRewardEligibilityRow(eligData) ? eligData : null;

    return toRewardDetailDTO(catalog, pricePoints, tiers, limits, eligibility);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapRewardError(toErrorShape(error));
  }
}

/**
 * Creates a new reward catalog entry with optional child records.
 *
 * @throws UNIQUE_VIOLATION if code already exists for casino
 * @throws FORBIDDEN if caller lacks pit_boss/admin role
 */
export async function createReward(
  supabase: SupabaseClient<Database>,
  input: CreateRewardInput,
): Promise<RewardCatalogDTO> {
  try {
    // Insert catalog entry — casino_id from caller (derived from RLS context, ADR-024)
    const { data: catalog, error: catalogError } = await supabase
      .from('reward_catalog')
      .insert({
        casino_id: input.casinoId,
        code: input.code,
        family: input.family,
        kind: input.kind,
        name: input.name,
        fulfillment: input.fulfillment ?? null,
        metadata: toJson(input.metadata),
        ui_tags: input.uiTags ?? null,
      })
      .select(REWARD_CATALOG_SELECT)
      .single();

    if (catalogError) {
      throw mapRewardError(catalogError);
    }

    if (!isRewardCatalogRow(catalog)) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'Invalid reward catalog row returned',
      );
    }

    const rewardId = catalog.id;
    const casinoId = catalog.casino_id;

    // Insert child records in parallel
    // Async wrappers avoid PromiseLike incompatibility with Promise.all
    const childInserts: Array<Promise<void>> = [];

    if (input.pricePoints) {
      childInserts.push(
        (async () => {
          const { error } = await supabase.from('reward_price_points').insert({
            reward_id: rewardId,
            casino_id: casinoId,
            points_cost: input.pricePoints!.pointsCost,
            allow_overdraw: input.pricePoints!.allowOverdraw ?? false,
          });
          if (error) throw mapRewardError(error);
        })(),
      );
    }

    if (input.entitlementTiers && input.entitlementTiers.length > 0) {
      childInserts.push(
        (async () => {
          const { error } = await supabase
            .from('reward_entitlement_tier')
            .insert(
              input.entitlementTiers!.map((t) => ({
                reward_id: rewardId,
                casino_id: casinoId,
                tier: t.tier,
                benefit: toJson(t.benefit),
              })),
            );
          if (error) throw mapRewardError(error);
        })(),
      );
    }

    if (input.limits && input.limits.length > 0) {
      childInserts.push(
        (async () => {
          const { error } = await supabase.from('reward_limits').insert(
            input.limits!.map((l) => ({
              reward_id: rewardId,
              casino_id: casinoId,
              max_issues: l.maxIssues,
              scope: l.scope,
              cooldown_minutes: l.cooldownMinutes ?? null,
              requires_note: l.requiresNote ?? false,
            })),
          );
          if (error) throw mapRewardError(error);
        })(),
      );
    }

    if (input.eligibility) {
      childInserts.push(
        (async () => {
          const { error } = await supabase.from('reward_eligibility').insert({
            reward_id: rewardId,
            casino_id: casinoId,
            min_points_balance: input.eligibility!.minPointsBalance ?? null,
            min_tier: input.eligibility!.minTier ?? null,
            max_tier: input.eligibility!.maxTier ?? null,
            visit_kinds: input.eligibility!.visitKinds ?? null,
          });
          if (error) throw mapRewardError(error);
        })(),
      );
    }

    await Promise.all(childInserts);

    return toRewardCatalogDTO(catalog);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapRewardError(toErrorShape(error));
  }
}

/**
 * Updates a reward catalog entry.
 *
 * @throws NOT_FOUND if reward doesn't exist
 * @throws FORBIDDEN if caller lacks pit_boss/admin role
 */
export async function updateReward(
  supabase: SupabaseClient<Database>,
  input: UpdateRewardInput,
): Promise<RewardCatalogDTO> {
  try {
    const updates: Record<string, unknown> = {};

    if (input.name !== undefined) updates.name = input.name;
    if (input.kind !== undefined) updates.kind = input.kind;
    if (input.isActive !== undefined) updates.is_active = input.isActive;
    if (input.fulfillment !== undefined)
      updates.fulfillment = input.fulfillment;
    if (input.metadata !== undefined) updates.metadata = input.metadata;
    if (input.uiTags !== undefined) updates.ui_tags = input.uiTags;

    const { data, error } = await supabase
      .from('reward_catalog')
      .update(updates)
      .eq('id', input.id)
      .select(REWARD_CATALOG_SELECT)
      .single();

    if (error) {
      throw mapRewardError(error);
    }

    if (!isRewardCatalogRow(data)) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'Invalid reward catalog row returned',
      );
    }

    return toRewardCatalogDTO(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapRewardError(toErrorShape(error));
  }
}

/**
 * Toggles a reward's is_active flag.
 */
export async function toggleRewardActive(
  supabase: SupabaseClient<Database>,
  rewardId: string,
  isActive: boolean,
): Promise<RewardCatalogDTO> {
  try {
    const { data, error } = await supabase
      .from('reward_catalog')
      .update({ is_active: isActive })
      .eq('id', rewardId)
      .select(REWARD_CATALOG_SELECT)
      .single();

    if (error) {
      throw mapRewardError(error);
    }

    if (!isRewardCatalogRow(data)) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'Invalid reward catalog row returned',
      );
    }

    return toRewardCatalogDTO(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapRewardError(toErrorShape(error));
  }
}

// === Earn Config Operations ===

/**
 * Gets the casino's earn configuration.
 */
export async function getEarnConfig(
  supabase: SupabaseClient<Database>,
): Promise<LoyaltyEarnConfigDTO | null> {
  try {
    const { data, error } = await supabase
      .from('loyalty_earn_config')
      .select(LOYALTY_EARN_CONFIG_SELECT)
      .maybeSingle();

    if (error) {
      throw mapRewardError(error);
    }

    if (!data || !isLoyaltyEarnConfigRow(data)) {
      return null;
    }

    return toEarnConfigDTO(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapRewardError(toErrorShape(error));
  }
}

/**
 * Upserts the casino's earn configuration.
 * Casino ID is derived from RLS context (no explicit parameter).
 *
 * @throws FORBIDDEN if caller is not admin
 */
export async function upsertEarnConfig(
  supabase: SupabaseClient<Database>,
  input: UpsertEarnConfigInput,
): Promise<LoyaltyEarnConfigDTO> {
  try {
    // First try to get existing config to determine insert vs update
    const { data: existing } = await supabase
      .from('loyalty_earn_config')
      .select(LOYALTY_EARN_CONFIG_SELECT)
      .maybeSingle();

    if (existing && isLoyaltyEarnConfigRow(existing)) {
      // Update existing
      const updates: Record<string, unknown> = {};
      if (input.pointsPerTheo !== undefined)
        updates.points_per_theo = input.pointsPerTheo;
      if (input.defaultPointMultiplier !== undefined)
        updates.default_point_multiplier = input.defaultPointMultiplier;
      if (input.roundingPolicy !== undefined)
        updates.rounding_policy = input.roundingPolicy;
      if (input.isActive !== undefined) updates.is_active = input.isActive;
      if (input.effectiveFrom !== undefined)
        updates.effective_from = input.effectiveFrom;

      const { data, error } = await supabase
        .from('loyalty_earn_config')
        .update(updates)
        .eq('casino_id', existing.casino_id)
        .select(LOYALTY_EARN_CONFIG_SELECT)
        .single();

      if (error) {
        throw mapRewardError(error);
      }

      if (!isLoyaltyEarnConfigRow(data)) {
        throw new DomainError(
          'INTERNAL_ERROR',
          'Invalid earn config row returned',
        );
      }

      return toEarnConfigDTO(data);
    }

    // Insert new config — casino_id from caller (derived from RLS context, ADR-024)
    const { data, error } = await supabase
      .from('loyalty_earn_config')
      .insert({
        casino_id: input.casinoId,
        points_per_theo: input.pointsPerTheo ?? 10,
        default_point_multiplier: input.defaultPointMultiplier ?? 1.0,
        rounding_policy: input.roundingPolicy ?? 'floor',
        is_active: input.isActive ?? true,
        effective_from: input.effectiveFrom ?? null,
      })
      .select(LOYALTY_EARN_CONFIG_SELECT)
      .single();

    if (error) {
      throw mapRewardError(error);
    }

    if (!isLoyaltyEarnConfigRow(data)) {
      throw new DomainError(
        'INTERNAL_ERROR',
        'Invalid earn config row returned',
      );
    }

    return toEarnConfigDTO(data);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapRewardError(toErrorShape(error));
  }
}

// === Eligible Rewards ===

/**
 * Lists rewards eligible for a given player.
 * Reads: reward_catalog, reward_eligibility, reward_price_points,
 *        reward_entitlement_tier, player_loyalty — all Loyalty-owned per SRM §401-435.
 */
export async function listEligibleRewards(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<EligibleRewardDTO[]> {
  try {
    // Get player loyalty info for eligibility matching
    const { data: playerLoyalty } = await supabase
      .from('player_loyalty')
      .select('current_balance, tier')
      .eq('player_id', playerId)
      .maybeSingle();

    const playerBalance = playerLoyalty
      ? Number(playerLoyalty.current_balance ?? 0)
      : 0;
    const playerTier: string | null = playerLoyalty?.tier ?? null;

    // Get all active rewards
    const { data: rewards, error: rewardsError } = await supabase
      .from('reward_catalog')
      .select(REWARD_CATALOG_SELECT)
      .eq('is_active', true)
      .order('name');

    if (rewardsError) {
      throw mapRewardError(rewardsError);
    }

    if (!rewards || rewards.length === 0) {
      return [];
    }

    const validRewards: RewardCatalogRow[] = [];
    for (const row of rewards) {
      if (isRewardCatalogRow(row)) {
        validRewards.push(row);
      }
    }

    const rewardIds = validRewards.map((r) => r.id);

    // Fetch all child records for active rewards in parallel
    const [pricePointsResult, tiersResult, limitsResult, eligibilityResult] =
      await Promise.all([
        supabase
          .from('reward_price_points')
          .select(REWARD_PRICE_POINTS_SELECT)
          .in('reward_id', rewardIds),
        supabase
          .from('reward_entitlement_tier')
          .select(REWARD_ENTITLEMENT_TIER_SELECT)
          .in('reward_id', rewardIds)
          .order('tier'),
        supabase
          .from('reward_limits')
          .select(REWARD_LIMITS_SELECT)
          .in('reward_id', rewardIds),
        supabase
          .from('reward_eligibility')
          .select(REWARD_ELIGIBILITY_SELECT)
          .in('reward_id', rewardIds),
      ]);

    if (pricePointsResult.error) throw mapRewardError(pricePointsResult.error);
    if (tiersResult.error) throw mapRewardError(tiersResult.error);
    if (limitsResult.error) throw mapRewardError(limitsResult.error);
    if (eligibilityResult.error) throw mapRewardError(eligibilityResult.error);

    // Index child records by reward_id
    // Type guards narrow within if-blocks — no explicit type assertions needed
    const pricePointsByReward = new Map<string, RewardPricePointsRow>();
    for (const row of pricePointsResult.data ?? []) {
      if (isRewardPricePointsRow(row)) {
        pricePointsByReward.set(row.reward_id, row);
      }
    }

    const tiersByReward = new Map<string, RewardEntitlementTierRow[]>();
    for (const row of tiersResult.data ?? []) {
      if (isRewardEntitlementTierRow(row)) {
        const existing = tiersByReward.get(row.reward_id) ?? [];
        existing.push(row);
        tiersByReward.set(row.reward_id, existing);
      }
    }

    const limitsByReward = new Map<string, RewardLimitsRow[]>();
    for (const row of limitsResult.data ?? []) {
      if (isRewardLimitsRow(row)) {
        const existing = limitsByReward.get(row.reward_id) ?? [];
        existing.push(row);
        limitsByReward.set(row.reward_id, existing);
      }
    }

    const eligibilityByReward = new Map<string, RewardEligibilityRow>();
    for (const row of eligibilityResult.data ?? []) {
      if (isRewardEligibilityRow(row)) {
        eligibilityByReward.set(row.reward_id, row);
      }
    }

    // Filter by eligibility and assemble DTOs
    const eligible: EligibleRewardDTO[] = [];

    for (const reward of validRewards) {
      const elig = eligibilityByReward.get(reward.id);

      // Check eligibility criteria
      if (elig) {
        if (
          elig.min_points_balance !== null &&
          playerBalance < elig.min_points_balance
        ) {
          continue;
        }
        if (
          elig.min_tier !== null &&
          playerTier !== null &&
          playerTier < elig.min_tier
        ) {
          continue;
        }
        if (
          elig.max_tier !== null &&
          playerTier !== null &&
          playerTier > elig.max_tier
        ) {
          continue;
        }
      }

      eligible.push(
        toEligibleRewardDTO(
          reward,
          pricePointsByReward.get(reward.id) ?? null,
          tiersByReward.get(reward.id) ?? [],
          limitsByReward.get(reward.id) ?? [],
          elig ?? null,
        ),
      );
    }

    return eligible;
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw mapRewardError(toErrorShape(error));
  }
}
