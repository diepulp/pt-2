/**
 * LoyaltyService Promo Instruments HTTP Fetchers
 *
 * Client-side fetch functions for promo program and coupon API endpoints.
 * Uses fetchJSON/mutateJSON from @/lib/http/fetch-json for typed responses.
 * All mutations include idempotency-key header.
 *
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS4
 */

import { fetchJSON, mutateJSON } from '@/lib/http/fetch-json';

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
  ReplaceCouponOutput,
  UpdatePromoProgramInput,
  VoidCouponOutput,
} from './dtos';

const BASE_PROMO_PROGRAMS = '/api/v1/promo-programs';
const BASE_PROMO_COUPONS = '/api/v1/promo-coupons';

// === Helper Functions ===

/**
 * Builds URLSearchParams from filter object, excluding undefined/null values.
 */
function buildParams(
  filters: Record<string, string | number | boolean | undefined | null>,
): URLSearchParams {
  const entries = Object.entries(filters).filter(
    ([, value]) => value != null,
  ) as [string, string | number | boolean][];

  return new URLSearchParams(
    entries.map(([key, value]) => [key, String(value)]),
  );
}

// === Promo Program Operations ===

/**
 * Fetches list of promo programs.
 *
 * GET /api/v1/promo-programs?status=...&activeOnly=...&limit=...&offset=...
 */
export async function listPromoPrograms(
  query: PromoProgramListQuery = {},
): Promise<PromoProgramDTO[]> {
  const params = buildParams({
    status: query.status,
    activeOnly: query.activeOnly,
    limit: query.limit,
    offset: query.offset,
  });

  const url = params.toString()
    ? `${BASE_PROMO_PROGRAMS}?${params}`
    : BASE_PROMO_PROGRAMS;

  return fetchJSON<PromoProgramDTO[]>(url);
}

/**
 * Fetches a single promo program by ID.
 *
 * GET /api/v1/promo-programs/{id}
 */
export async function getPromoProgram(
  programId: string,
): Promise<PromoProgramDTO | null> {
  const url = `${BASE_PROMO_PROGRAMS}/${programId}`;
  return fetchJSON<PromoProgramDTO | null>(url);
}

/**
 * Creates a new promo program.
 * Requires idempotency key.
 *
 * POST /api/v1/promo-programs
 */
export async function createPromoProgram(
  input: CreatePromoProgramInput,
  idempotencyKey: string,
): Promise<PromoProgramDTO> {
  return mutateJSON<PromoProgramDTO, CreatePromoProgramInput>(
    BASE_PROMO_PROGRAMS,
    input,
    idempotencyKey,
  );
}

/**
 * Updates an existing promo program.
 * Requires idempotency key.
 *
 * PATCH /api/v1/promo-programs/{id}
 */
export async function updatePromoProgram(
  input: UpdatePromoProgramInput,
  idempotencyKey: string,
): Promise<PromoProgramDTO> {
  const url = `${BASE_PROMO_PROGRAMS}/${input.id}`;
  return fetchJSON<PromoProgramDTO>(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

// === Promo Coupon Operations ===

/**
 * Fetches list of promo coupons.
 *
 * GET /api/v1/promo-coupons?promoProgramId=...&status=...&playerId=...&visitId=...&expiringBefore=...
 */
export async function listPromoCoupons(
  query: PromoCouponListQuery = {},
): Promise<PromoCouponDTO[]> {
  const params = buildParams({
    promoProgramId: query.promoProgramId,
    status: query.status,
    playerId: query.playerId,
    visitId: query.visitId,
    expiringBefore: query.expiringBefore,
    limit: query.limit,
    offset: query.offset,
  });

  const url = params.toString()
    ? `${BASE_PROMO_COUPONS}?${params}`
    : BASE_PROMO_COUPONS;

  return fetchJSON<PromoCouponDTO[]>(url);
}

/**
 * Fetches a single promo coupon by ID.
 *
 * GET /api/v1/promo-coupons/{id}
 */
export async function getPromoCoupon(
  couponId: string,
): Promise<PromoCouponDTO | null> {
  const url = `${BASE_PROMO_COUPONS}/${couponId}`;
  return fetchJSON<PromoCouponDTO | null>(url);
}

/**
 * Fetches a promo coupon by validation number.
 *
 * GET /api/v1/promo-coupons?validationNumber=...
 */
export async function getPromoCouponByValidation(
  validationNumber: string,
): Promise<PromoCouponDTO | null> {
  const params = buildParams({ validationNumber });
  const url = `${BASE_PROMO_COUPONS}?${params}`;

  // API returns array, get first match
  const coupons = await fetchJSON<PromoCouponDTO[]>(url);
  return coupons[0] ?? null;
}

/**
 * Fetches coupon inventory summary.
 *
 * GET /api/v1/promo-coupons/inventory?promoProgramId=...&status=...
 */
export async function getCouponInventory(
  query: CouponInventoryQuery = {},
): Promise<CouponInventoryOutput> {
  const params = buildParams({
    promoProgramId: query.promoProgramId,
    status: query.status,
  });

  const url = params.toString()
    ? `${BASE_PROMO_COUPONS}/inventory?${params}`
    : `${BASE_PROMO_COUPONS}/inventory`;

  return fetchJSON<CouponInventoryOutput>(url);
}

/**
 * Issues a new promo coupon.
 * Requires idempotency key (typically "issue:{validationNumber}").
 *
 * POST /api/v1/promo-coupons
 */
export async function issueCoupon(
  input: Omit<IssueCouponInput, 'idempotencyKey'>,
  idempotencyKey: string,
): Promise<IssueCouponOutput> {
  return mutateJSON<
    IssueCouponOutput,
    Omit<IssueCouponInput, 'idempotencyKey'>
  >(BASE_PROMO_COUPONS, input, idempotencyKey);
}

/**
 * Voids a promo coupon.
 * Requires idempotency key (typically "void:{couponId}").
 *
 * POST /api/v1/promo-coupons/{id}/void
 */
export async function voidCoupon(
  couponId: string,
  idempotencyKey: string,
  correlationId?: string,
): Promise<VoidCouponOutput> {
  const url = `${BASE_PROMO_COUPONS}/${couponId}/void`;
  return mutateJSON<VoidCouponOutput, { correlationId?: string }>(
    url,
    { correlationId },
    idempotencyKey,
  );
}

/**
 * Replaces a promo coupon with a new one.
 * Requires idempotency key (typically "replace:{couponId}:{newValidationNumber}").
 *
 * POST /api/v1/promo-coupons/{id}/replace
 */
export async function replaceCoupon(
  couponId: string,
  newValidationNumber: string,
  idempotencyKey: string,
  options?: { newExpiresAt?: string; correlationId?: string },
): Promise<ReplaceCouponOutput> {
  const url = `${BASE_PROMO_COUPONS}/${couponId}/replace`;
  return mutateJSON<
    ReplaceCouponOutput,
    {
      newValidationNumber: string;
      newExpiresAt?: string;
      correlationId?: string;
    }
  >(
    url,
    {
      newValidationNumber,
      newExpiresAt: options?.newExpiresAt,
      correlationId: options?.correlationId,
    },
    idempotencyKey,
  );
}
