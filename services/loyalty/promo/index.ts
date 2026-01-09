/**
 * LoyaltyService Promo Instruments Sub-module
 *
 * Promotional coupon and program management for LoyaltyService.
 * Pattern A: Contract-First with manual DTOs.
 *
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS2
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import * as crud from "./crud";
import type {
  CouponInventoryOutput,
  CouponInventoryQuery,
  CreatePromoProgramInput,
  IssueCouponInput,
  IssueCouponOutput,
  PromoCouponDTO,
  PromoCouponListQuery,
  PromoProgramDTO,
  PromoProgramListQuery,
  ReplaceCouponInput,
  ReplaceCouponOutput,
  UpdatePromoProgramInput,
  VoidCouponInput,
  VoidCouponOutput,
} from "./dtos";

// Re-export all DTOs for consumers
export * from "./dtos";

// === Promo Service Interface ===

/**
 * PromoService interface - explicit, no ReturnType inference.
 *
 * All write operations require RLS context (casino_id, staff_role).
 * ADR-024: RPCs use set_rls_context_from_staff() for authoritative context.
 */
export interface PromoService {
  // === Promo Program Operations ===

  /**
   * Lists promo programs for the current casino.
   *
   * @param query - Query filters (status, activeOnly, limit, offset)
   * @returns Array of PromoProgramDTO
   */
  listPrograms(query?: PromoProgramListQuery): Promise<PromoProgramDTO[]>;

  /**
   * Gets a single promo program by ID.
   *
   * @param programId - Program UUID
   * @returns PromoProgramDTO or null if not found
   */
  getProgram(programId: string): Promise<PromoProgramDTO | null>;

  /**
   * Creates a new promo program.
   *
   * @param input - Program creation input
   * @returns Created PromoProgramDTO
   * @throws FORBIDDEN if caller lacks pit_boss/admin role
   */
  createProgram(input: CreatePromoProgramInput): Promise<PromoProgramDTO>;

  /**
   * Updates a promo program.
   *
   * @param input - Program update input
   * @returns Updated PromoProgramDTO
   * @throws PROMO_PROGRAM_NOT_FOUND if program doesn't exist
   * @throws FORBIDDEN if caller lacks pit_boss/admin role
   */
  updateProgram(input: UpdatePromoProgramInput): Promise<PromoProgramDTO>;

  // === Promo Coupon Operations ===

  /**
   * Issues a promotional coupon.
   * Idempotent: duplicate calls return existing coupon.
   *
   * @param input - Coupon issuance input with validation number and idempotency key
   * @returns IssueCouponOutput with coupon details and isExisting flag
   * @throws PROMO_PROGRAM_NOT_FOUND if program doesn't exist
   * @throws PROMO_PROGRAM_INACTIVE if program is not active
   * @throws ANONYMOUS_ISSUANCE_DISABLED if casino requires player
   * @throws PLAYER_NOT_ENROLLED if player not at this casino
   */
  issueCoupon(input: IssueCouponInput): Promise<IssueCouponOutput>;

  /**
   * Voids a promotional coupon.
   * Idempotent: duplicate calls return same result.
   *
   * @param input - Coupon void input with coupon ID and idempotency key
   * @returns VoidCouponOutput with voided coupon details
   * @throws COUPON_NOT_FOUND if coupon doesn't exist
   * @throws INVALID_COUPON_STATUS if coupon cannot be voided
   */
  voidCoupon(input: VoidCouponInput): Promise<VoidCouponOutput>;

  /**
   * Replaces a promotional coupon with a new one.
   * Idempotent: duplicate calls return same result.
   *
   * @param input - Coupon replacement input with new validation number
   * @returns ReplaceCouponOutput with old and new coupon details
   * @throws COUPON_NOT_FOUND if coupon doesn't exist
   * @throws INVALID_COUPON_STATUS if coupon cannot be replaced
   */
  replaceCoupon(input: ReplaceCouponInput): Promise<ReplaceCouponOutput>;

  /**
   * Gets coupon inventory summary by status.
   *
   * @param query - Inventory query filters
   * @returns CouponInventoryOutput with status breakdown
   */
  getCouponInventory(
    query?: CouponInventoryQuery,
  ): Promise<CouponInventoryOutput>;

  /**
   * Lists promo coupons with filters.
   *
   * @param query - Query filters (program, status, player, visit, expiring)
   * @returns Array of PromoCouponDTO
   */
  listCoupons(query?: PromoCouponListQuery): Promise<PromoCouponDTO[]>;

  /**
   * Gets a single coupon by ID.
   *
   * @param couponId - Coupon UUID
   * @returns PromoCouponDTO or null if not found
   */
  getCoupon(couponId: string): Promise<PromoCouponDTO | null>;

  /**
   * Gets a coupon by validation number.
   *
   * @param validationNumber - Coupon validation number
   * @returns PromoCouponDTO or null if not found
   */
  getCouponByValidationNumber(
    validationNumber: string,
  ): Promise<PromoCouponDTO | null>;
}

// === Service Factory ===

/**
 * Creates a PromoService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createPromoService(
  supabase: SupabaseClient<Database>,
): PromoService {
  return {
    // Programs
    listPrograms: (query) => crud.listPrograms(supabase, query),
    getProgram: (programId) => crud.getProgram(supabase, programId),
    createProgram: (input) => crud.createProgram(supabase, input),
    updateProgram: (input) => crud.updateProgram(supabase, input),

    // Coupons
    issueCoupon: (input) => crud.issueCoupon(supabase, input),
    voidCoupon: (input) => crud.voidCoupon(supabase, input),
    replaceCoupon: (input) => crud.replaceCoupon(supabase, input),
    getCouponInventory: (query) => crud.getCouponInventory(supabase, query),
    listCoupons: (query) => crud.listCoupons(supabase, query),
    getCoupon: (couponId) => crud.getCoupon(supabase, couponId),
    getCouponByValidationNumber: (validationNumber) =>
      crud.getCouponByValidationNumber(supabase, validationNumber),
  };
}
