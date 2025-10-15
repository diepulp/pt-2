"use server";

/**
 * Loyalty Server Actions
 * Wave 2 Track 0: Schema Hardening + Loyalty Service Integration
 *
 * Provides manual reward operations with:
 * - Permission checks (loyalty:award)
 * - Rate limiting (10 requests/min per staff member)
 * - Deterministic idempotency keys
 * - Correlation ID tracking
 * - Integration with enhanced LoyaltyService
 *
 * Quality Gates:
 * - Permission checks enforce loyalty:award
 * - Rate limiter blocks >10 requests/min
 * - Idempotency keys deterministic
 * - Handles 23505 conflicts gracefully (soft success)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  generateCorrelationId,
  setCorrelationId,
  getCorrelationId,
} from "@/lib/correlation";
import { generateManualRewardKey } from "@/lib/idempotency";
import { checkRateLimit, getRateLimitStatus } from "@/lib/rate-limiter";
import { withServerAction } from "@/lib/server-actions/with-server-action-wrapper";
import { createClient } from "@/lib/supabase/server";
import { createLoyaltyCrudService } from "@/services/loyalty/crud";
import type { ServiceResult } from "@/services/shared/types";
import type { Database } from "@/types/database.types";

/**
 * Manual Reward Input DTO
 */
export interface ManualRewardInput {
  playerId: string;
  pointsChange: number;
  reason: string;
  sequence?: number; // Optional sequence for multiple rewards same day
}

/**
 * Manual Reward Result DTO
 */
export interface ManualRewardResult {
  ledgerId: string;
  playerId: string;
  pointsChange: number;
  balanceBefore: number;
  balanceAfter: number;
  tierBefore: string;
  tierAfter: string;
  idempotencyKey: string;
  correlationId: string;
  isIdempotent: boolean; // true if this was a duplicate request
}

/**
 * Permission check for loyalty operations
 * Phase 6 Wave 3 Track 1: Direct staff_permissions query
 *
 * @param supabase - Supabase client
 * @param staffId - Staff user ID
 * @param capability - Capability to check (e.g., 'loyalty:award')
 * @returns ServiceResult indicating if permission granted
 */
async function checkPermission(
  supabase: SupabaseClient<Database>,
  staffId: string,
  capability: string,
): Promise<ServiceResult<boolean>> {
  const { data, error } = await supabase
    .from("staff_permissions")
    .select("capabilities")
    .eq("staff_id", staffId)
    .single();

  if (error) {
    // No permissions record found - deny by default
    if (error.code === "PGRST116") {
      return {
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: `Staff member has no permissions configured`,
        },
        status: 403,
        timestamp: new Date().toISOString(),
        requestId: generateCorrelationId(),
      };
    }

    // Database error
    return {
      success: false,
      data: null,
      error: {
        code: "PERMISSION_CHECK_FAILED",
        message: error.message,
        details: error,
      },
      status: 500,
      timestamp: new Date().toISOString(),
      requestId: generateCorrelationId(),
    };
  }

  const hasPermission = data.capabilities.includes(capability);
  if (!hasPermission) {
    return {
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: `Missing required capability: ${capability}`,
      },
      status: 403,
      timestamp: new Date().toISOString(),
      requestId: generateCorrelationId(),
    };
  }

  return {
    success: true,
    data: true,
    error: null,
    status: 200,
    timestamp: new Date().toISOString(),
    requestId: generateCorrelationId(),
  };
}

/**
 * Manual Reward Server Action
 *
 * Awards loyalty points to a player manually (staff-initiated).
 * Includes comprehensive guardrails:
 * - Authentication check
 * - Permission verification (loyalty:award)
 * - Rate limiting (10 req/min per staff)
 * - Idempotency protection
 * - Correlation ID tracking
 * - Before/after audit trail
 *
 * @param input - Manual reward data
 * @returns ServiceResult with reward details and audit trail
 *
 * Error handling:
 * - UNAUTHORIZED (401): No active session
 * - FORBIDDEN (403): Missing loyalty:award permission
 * - RATE_LIMIT_EXCEEDED (429): >10 requests/min
 * - PLAYER_NOT_FOUND (404): Player does not exist
 * - IDEMPOTENT_DUPLICATE (200): Soft success, returns existing entry
 * - INTERNAL_ERROR (500): Unexpected errors
 *
 * @example
 * ```typescript
 * const result = await manualReward({
 *   playerId: 'player-uuid',
 *   pointsChange: 100,
 *   reason: 'Birthday bonus',
 *   sequence: 1
 * });
 *
 * if (result.success) {
 *   console.log('Reward issued:', result.data);
 * }
 * ```
 */
export async function manualReward(
  input: ManualRewardInput,
): Promise<ServiceResult<ManualRewardResult>> {
  const supabase = await createClient();

  // Get session for auth and audit
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return {
      data: null,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required for manual rewards",
      },
      success: false,
      status: 401,
      timestamp: new Date().toISOString(),
      requestId: generateCorrelationId(),
    };
  }

  const staffId = session.user.id;

  // Generate correlation ID for tracing
  const correlationId = generateCorrelationId();
  setCorrelationId(correlationId);

  return withServerAction(
    async () => {
      // 1. Permission check
      const permissionResult = await checkPermission(
        supabase,
        staffId,
        "loyalty:award",
      );
      if (!permissionResult.success) {
        return {
          data: null,
          error: permissionResult.error,
          success: false,
          status: permissionResult.status,
          timestamp: permissionResult.timestamp,
          requestId: permissionResult.requestId,
        };
      }

      // 2. Rate limiting check (10 requests/min per staff)
      const isRateLimited = checkRateLimit(staffId, {
        max: 10,
        window: 60000, // 60 seconds
      });

      if (isRateLimited) {
        const rateLimitStatus = getRateLimitStatus(staffId, {
          max: 10,
          window: 60000,
        });

        return {
          data: null,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: `Rate limit exceeded. Try again after ${rateLimitStatus.resetAt?.toISOString()}`,
            details: {
              resetAt: rateLimitStatus.resetAt,
              remaining: rateLimitStatus.remaining,
            },
          },
          success: false,
          status: 429,
          timestamp: new Date().toISOString(),
          requestId: correlationId,
        };
      }

      // 3. Generate deterministic idempotency key
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const sequence = input.sequence ?? 1;
      const idempotencyKey = generateManualRewardKey(
        input.playerId,
        staffId,
        today,
        sequence,
      );

      // 4. Call loyalty service to create ledger entry
      const loyaltyService = createLoyaltyCrudService(supabase);
      const ledgerResult = await loyaltyService.createLedgerEntry({
        player_id: input.playerId,
        points_change: input.pointsChange,
        transaction_type: "MANUAL_BONUS",
        reason: input.reason,
        source: "manual",
        event_type: "POINTS_UPDATE_REQUESTED",
        session_id: idempotencyKey, // Use idempotency key as session_id
        staff_id: staffId, // Track who issued the reward
        correlation_id: correlationId, // Track request chain
      });

      // 5. Check if this was an idempotent request
      // The service handles 23505 conflicts and returns existing entry
      const isIdempotent = false; // TODO: Service should indicate this

      if (!ledgerResult.success || !ledgerResult.data) {
        return {
          data: null,
          error: ledgerResult.error,
          success: false,
          status: ledgerResult.status,
          timestamp: ledgerResult.timestamp,
          requestId: ledgerResult.requestId,
        };
      }

      // 6. Return success with complete audit trail
      const ledgerData = ledgerResult.data;
      return {
        data: {
          ledgerId: ledgerData.id,
          playerId: ledgerData.player_id,
          pointsChange: ledgerData.points_change,
          balanceBefore: ledgerData.balance_before ?? 0,
          balanceAfter: ledgerData.balance_after ?? 0,
          tierBefore: ledgerData.tier_before ?? "UNKNOWN",
          tierAfter: ledgerData.tier_after ?? "UNKNOWN",
          idempotencyKey,
          correlationId: getCorrelationId() ?? correlationId,
          isIdempotent,
        },
        error: null,
        success: true,
        status: 200,
        timestamp: new Date().toISOString(),
        requestId: correlationId,
      };
    },
    supabase,
    {
      action: "loyalty.manual_reward",
      userId: staffId,
      entity: "loyalty_ledger",
      metadata: {
        playerId: input.playerId,
        pointsChange: input.pointsChange,
        correlationId,
      },
    },
  );
}

/**
 * Get Rate Limit Status Server Action
 *
 * Returns current rate limit status for authenticated staff member.
 * Useful for UI to display remaining quota.
 *
 * @returns ServiceResult with rate limit details
 */
export async function getRateLimitInfo(): Promise<
  ServiceResult<{
    remaining: number;
    resetAt: Date | null;
    isLimited: boolean;
  }>
> {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return {
      data: null,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
      success: false,
      status: 401,
      timestamp: new Date().toISOString(),
      requestId: generateCorrelationId(),
    };
  }

  const staffId = session.user.id;
  const status = getRateLimitStatus(staffId, {
    max: 10,
    window: 60000,
  });

  return {
    data: status,
    error: null,
    success: true,
    status: 200,
    timestamp: new Date().toISOString(),
    requestId: generateCorrelationId(),
  };
}

/**
 * Player Loyalty DTO (Read-Only)
 */
export interface PlayerLoyaltyDTO {
  id: string;
  playerId: string;
  tier: string;
  currentBalance: number;
  lifetimePoints: number;
  tierProgress: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get Player Loyalty Server Action (READ-ONLY)
 *
 * Fetches player loyalty data for display purposes only.
 * This is a READ-ONLY operation - MTL domain cannot mutate loyalty data.
 *
 * @param playerId - Player UUID
 * @returns ServiceResult with loyalty data
 *
 * @example
 * ```typescript
 * const result = await getPlayerLoyalty('player-uuid');
 * if (result.success) {
 *   console.log('Tier:', result.data.tier);
 *   console.log('Balance:', result.data.currentBalance);
 * }
 * ```
 */
export async function getPlayerLoyalty(
  playerId: string,
): Promise<ServiceResult<PlayerLoyaltyDTO>> {
  const supabase = await createClient();

  // Get session for auth
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return {
      data: null,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
      success: false,
      status: 401,
      timestamp: new Date().toISOString(),
      requestId: generateCorrelationId(),
    };
  }

  return withServerAction(
    async () => {
      // Fetch player loyalty data
      const { data: loyalty, error } = await supabase
        .from("player_loyalty")
        .select("*")
        .eq("player_id", playerId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows returned
          return {
            data: null,
            error: {
              code: "NOT_FOUND",
              message: `Player loyalty not found for player: ${playerId}`,
            },
            success: false,
            status: 404,
            timestamp: new Date().toISOString(),
            requestId: generateCorrelationId(),
          };
        }

        return {
          data: null,
          error: {
            code: "DATABASE_ERROR",
            message: error.message,
            details: error,
          },
          success: false,
          status: 500,
          timestamp: new Date().toISOString(),
          requestId: generateCorrelationId(),
        };
      }

      return {
        data: {
          id: loyalty.id,
          playerId: loyalty.player_id,
          tier: loyalty.tier,
          currentBalance: loyalty.current_balance ?? 0,
          lifetimePoints: loyalty.lifetime_points ?? 0,
          tierProgress: loyalty.tier_progress ?? 0,
          createdAt: loyalty.created_at ?? new Date().toISOString(),
          updatedAt: loyalty.updated_at ?? new Date().toISOString(),
        },
        error: null,
        success: true,
        status: 200,
        timestamp: new Date().toISOString(),
        requestId: generateCorrelationId(),
      };
    },
    supabase,
    {
      action: "loyalty.get_player_loyalty",
      userId: session.user.id,
      entity: "player_loyalty",
      metadata: { playerId },
    },
  );
}
