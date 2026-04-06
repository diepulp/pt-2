/**
 * Cadence Enforcement Module (PRD-061)
 *
 * Pre-flight cadence checks for reward issuance.
 * Evaluates reward_limits rules against issuance history.
 *
 * Advisory-grade enforcement — service-layer only, not race-proof.
 * RPC-layer hard enforcement is a Phase 3 follow-on.
 *
 * @see PRD-061 §5.3 Canonical Enforcement Model
 * @see PRD-061 §5.4 Rule Semantics & Precedence
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type { RewardFamily, RewardLimitDTO } from './reward/dtos';

// === Types ===

export interface CadenceCheckResult {
  allowed: boolean;
  /** Error code if blocked */
  code?:
    | 'REWARD_LIMIT_REACHED'
    | 'REWARD_COOLDOWN_ACTIVE'
    | 'REWARD_VISIT_REQUIRED';
  /** Human-readable guidance */
  guidance?: string;
  /** Seconds until next eligible issuance (for Retry-After header) */
  retryAfterSeconds?: number;
  /** ISO timestamp of next eligible issuance (for dashboard) */
  nextEligibleAt?: string;
}

// === Window Resolution ===

/**
 * Resolves the window start timestamp for a given scope.
 *
 * - per_visit: visit.started_at for player's active visit
 * - per_gaming_day: gaming day boundary from casino_settings.gaming_day_start_time (TEMP-002)
 * - per_week: 7 days ago
 * - per_month: 30 days ago
 *
 * @throws REWARD_VISIT_REQUIRED if scope is per_visit and no active visit
 * @see PRD-061 §5.5
 */
export async function resolveWindowStart(
  supabase: SupabaseClient<Database>,
  scope: string,
  casinoId: string,
  playerId: string,
): Promise<string> {
  switch (scope) {
    case 'per_visit': {
      const { data: visit } = await supabase
        .from('visit')
        .select('started_at')
        .eq('player_id', playerId)
        .eq('casino_id', casinoId)
        .eq('status', 'open')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!visit) {
        throw new DomainError(
          'REWARD_VISIT_REQUIRED',
          'Player must have an active visit for per-visit scoped rewards',
          { httpStatus: 422 },
        );
      }

      return visit.started_at;
    }

    case 'per_gaming_day': {
      // Use casino_settings.gaming_day_start_time for boundary (TEMP-002)
      const { data: settings } = await supabase
        .from('casino_settings')
        .select('gaming_day_start_time')
        .eq('casino_id', casinoId)
        .maybeSingle();

      const startTime = settings?.gaming_day_start_time ?? '06:00:00';

      // Compute today's gaming day boundary
      const now = new Date();
      const [h, m, s] = startTime.split(':').map(Number);
      const boundary = new Date(now);
      boundary.setHours(h, m, s ?? 0, 0);

      // If we're before the boundary, the gaming day started yesterday
      if (now < boundary) {
        boundary.setDate(boundary.getDate() - 1);
      }

      return boundary.toISOString();
    }

    case 'per_week': {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return weekAgo.toISOString();
    }

    case 'per_month': {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      return monthAgo.toISOString();
    }

    default:
      throw new DomainError(
        'VALIDATION_ERROR',
        `Unknown cadence scope: ${scope}`,
      );
  }
}

// === Counting Helpers ===

/**
 * Counts qualifying issuances for a player+reward within a window.
 *
 * Points comp: loyalty_ledger WHERE reason='redeem' AND source_kind='reward' AND source_id=rewardId
 * Entitlement: promo_coupon WHERE reward_catalog_id=rewardId AND status != 'voided'
 *
 * @see PRD-061 §5.3 Canonical Enforcement Model
 */
export async function countIssuances(
  supabase: SupabaseClient<Database>,
  playerId: string,
  rewardId: string,
  windowStart: string,
  family: RewardFamily,
): Promise<{ count: number; lastIssuedAt: string | null }> {
  if (family === 'points_comp') {
    const { data, error } = await supabase
      .from('loyalty_ledger')
      .select('created_at')
      .eq('player_id', playerId)
      .eq('source_kind', 'reward')
      .eq('source_id', rewardId)
      .eq('reason', 'redeem')
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false });

    if (error) {
      throw new DomainError(
        'INTERNAL_ERROR',
        `Cadence count query failed: ${error.message}`,
      );
    }

    const rows = data ?? [];
    return {
      count: rows.length,
      lastIssuedAt: rows.length > 0 ? rows[0].created_at : null,
    };
  }

  // Entitlement: count from promo_coupon
  const { data, error } = await supabase
    .from('promo_coupon')
    .select('issued_at')
    .eq('player_id', playerId)
    .eq('reward_catalog_id', rewardId)
    .neq('status', 'voided')
    .gte('issued_at', windowStart)
    .order('issued_at', { ascending: false });

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Cadence count query failed: ${error.message}`,
    );
  }

  const rows = data ?? [];
  return {
    count: rows.length,
    lastIssuedAt: rows.length > 0 ? rows[0].issued_at : null,
  };
}

/**
 * Gets last issuance time for cooldown check (family-agnostic).
 * Returns null if no prior issuance exists.
 */
export async function getLastIssuanceTime(
  supabase: SupabaseClient<Database>,
  playerId: string,
  rewardId: string,
  family: RewardFamily,
): Promise<string | null> {
  if (family === 'points_comp') {
    const { data } = await supabase
      .from('loyalty_ledger')
      .select('created_at')
      .eq('player_id', playerId)
      .eq('source_kind', 'reward')
      .eq('source_id', rewardId)
      .eq('reason', 'redeem')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.created_at ?? null;
  }

  const { data } = await supabase
    .from('promo_coupon')
    .select('issued_at')
    .eq('player_id', playerId)
    .eq('reward_catalog_id', rewardId)
    .neq('status', 'voided')
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.issued_at ?? null;
}

// === Window Expiry ===

/**
 * Computes when the current scope window expires (for Retry-After).
 */
function computeWindowExpiry(scope: string, windowStart: string): Date {
  const start = new Date(windowStart);
  switch (scope) {
    case 'per_visit':
      // Visit-scoped: no temporal expiry (visit must end)
      // Return far future — caller uses cooldown instead
      return new Date(Date.now() + 86400000);
    case 'per_gaming_day': {
      const expiry = new Date(start);
      expiry.setDate(expiry.getDate() + 1);
      return expiry;
    }
    case 'per_week': {
      const expiry = new Date(start);
      expiry.setDate(expiry.getDate() + 7);
      return expiry;
    }
    case 'per_month': {
      const expiry = new Date(start);
      expiry.setDate(expiry.getDate() + 30);
      return expiry;
    }
    default:
      return new Date(Date.now() + 86400000);
  }
}

// === Main Cadence Check ===

/**
 * Evaluates all cadence rules for a reward and returns whether issuance is allowed.
 *
 * Multi-rule evaluation is conjunctive (AND): blocked if ANY rule blocks.
 * Priority: COOLDOWN_ACTIVE > LIMIT_REACHED (§5.4).
 * Retry-After: max of all blocking rules' retry times (§5.4).
 *
 * @see PRD-061 §5.4 Rule Semantics & Precedence
 */
export async function checkCadence(
  supabase: SupabaseClient<Database>,
  playerId: string,
  rewardId: string,
  casinoId: string,
  family: RewardFamily,
  limits: RewardLimitDTO[],
): Promise<CadenceCheckResult> {
  if (limits.length === 0) {
    return { allowed: true };
  }

  // Check requires_note first (§5.6) — handled by caller, not here

  let cooldownBlock: CadenceCheckResult | null = null;
  let limitBlock: CadenceCheckResult | null = null;
  let maxRetryAt = 0;

  // Get last issuance time once (used for cooldown checks across all rules)
  const lastIssuedAt = await getLastIssuanceTime(
    supabase,
    playerId,
    rewardId,
    family,
  );

  for (const limit of limits) {
    // 1. Cooldown check (independent of scope window)
    if (limit.cooldownMinutes && lastIssuedAt) {
      const lastTime = new Date(lastIssuedAt).getTime();
      const cooldownMs = limit.cooldownMinutes * 60 * 1000;
      const cooldownExpiry = lastTime + cooldownMs;
      const now = Date.now();

      if (cooldownExpiry > now) {
        const retryAfterSeconds = Math.ceil((cooldownExpiry - now) / 1000);
        const nextEligibleAt = new Date(cooldownExpiry).toISOString();

        if (cooldownExpiry > maxRetryAt) {
          maxRetryAt = cooldownExpiry;
        }

        cooldownBlock = {
          allowed: false,
          code: 'REWARD_COOLDOWN_ACTIVE',
          guidance: `Cooldown active: ${limit.cooldownMinutes}min since last issuance`,
          retryAfterSeconds,
          nextEligibleAt,
        };
      }
    }

    // 2. Scope limit check
    const windowStart = await resolveWindowStart(
      supabase,
      limit.scope,
      casinoId,
      playerId,
    );
    const { count } = await countIssuances(
      supabase,
      playerId,
      rewardId,
      windowStart,
      family,
    );

    if (count >= limit.maxIssues) {
      const windowExpiry = computeWindowExpiry(limit.scope, windowStart);
      const retryAfterSeconds = Math.max(
        0,
        Math.ceil((windowExpiry.getTime() - Date.now()) / 1000),
      );

      if (windowExpiry.getTime() > maxRetryAt) {
        maxRetryAt = windowExpiry.getTime();
      }

      const scopeLabel = limit.scope.replace('per_', 'per ').replace('_', ' ');
      limitBlock = {
        allowed: false,
        code: 'REWARD_LIMIT_REACHED',
        guidance: `Limit reached: ${limit.maxIssues} ${scopeLabel}`,
        retryAfterSeconds,
        nextEligibleAt: windowExpiry.toISOString(),
      };
    }
  }

  // Priority: cooldown > limit (§5.4)
  if (cooldownBlock) {
    // When both block, Retry-After = max of both
    if (limitBlock && maxRetryAt > 0) {
      cooldownBlock.retryAfterSeconds = Math.ceil(
        (maxRetryAt - Date.now()) / 1000,
      );
      cooldownBlock.nextEligibleAt = new Date(maxRetryAt).toISOString();
    }
    return cooldownBlock;
  }

  if (limitBlock) {
    return limitBlock;
  }

  return { allowed: true };
}

/**
 * Checks if any active limit requires a note (§5.6).
 * Returns true if any limit has requires_note=true.
 */
export function requiresNote(limits: RewardLimitDTO[]): boolean {
  return limits.some((l) => l.requiresNote);
}
