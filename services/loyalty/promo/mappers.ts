/**
 * LoyaltyService Promo Instrument Mappers
 *
 * Type-safe transformations from RPC responses to DTOs.
 * Uses explicit types for RPC returns since they don't depend on table Row types.
 * Eliminates `as` type assertions per SLAD v2.2.0 section 327-365.
 *
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS2
 */

import type {
  CouponInventoryOutput,
  CouponInventoryRow,
  IssueCouponOutput,
  PromoCouponDTO,
  PromoCouponStatus,
  PromoProgramDTO,
  PromoType,
  ReplaceCouponOutput,
  VoidCouponOutput,
} from './dtos';

// === RPC Response Types ===

/**
 * Response from rpc_issue_promo_coupon.
 */
export interface IssueCouponRpcResponse {
  success: boolean;
  is_existing: boolean;
  coupon: {
    id: string;
    validation_number: string;
    status: PromoCouponStatus;
    face_value_amount: number;
    required_match_wager_amount?: number;
    issued_at: string;
    expires_at: string | null;
    player_id?: string | null;
    visit_id?: string | null;
  };
}

/**
 * Response from rpc_void_promo_coupon.
 */
export interface VoidCouponRpcResponse {
  success: boolean;
  is_existing: boolean;
  coupon: {
    id: string;
    validation_number: string;
    status: PromoCouponStatus;
    voided_at: string;
    voided_by_staff_id?: string;
  };
}

/**
 * Response from rpc_replace_promo_coupon.
 */
export interface ReplaceCouponRpcResponse {
  success: boolean;
  is_existing: boolean;
  old_coupon: {
    id: string;
    validation_number?: string;
    status: PromoCouponStatus;
    replaced_at?: string;
  };
  new_coupon: {
    id: string;
    validation_number: string;
    status: PromoCouponStatus;
    face_value_amount?: number;
    issued_at?: string;
    expires_at?: string | null;
  };
}

/**
 * Row from rpc_promo_coupon_inventory.
 */
export interface InventoryRpcRow {
  status: PromoCouponStatus;
  coupon_count: number;
  total_face_value: number | null;
  total_match_wager: number | null;
}

/**
 * Row from promo_program table (direct query).
 */
export interface PromoProgramRow {
  id: string;
  casino_id: string;
  name: string;
  promo_type: PromoType;
  face_value_amount: number;
  required_match_wager_amount: number;
  status: string;
  start_at: string | null;
  end_at: string | null;
  created_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Row from promo_coupon table (direct query).
 */
export interface PromoCouponRow {
  id: string;
  casino_id: string;
  promo_program_id: string;
  validation_number: string;
  status: PromoCouponStatus;
  face_value_amount: number;
  required_match_wager_amount: number;
  issued_at: string;
  expires_at: string | null;
  voided_at: string | null;
  replaced_at: string | null;
  cleared_at: string | null;
  player_id: string | null;
  visit_id: string | null;
  issued_by_staff_id: string;
  voided_by_staff_id: string | null;
  replaced_by_staff_id: string | null;
  replacement_coupon_id: string | null;
}

// === Type Guards ===

// Type guards require assertions to access nested properties after 'in' checks
/* eslint-disable custom-rules/no-dto-type-assertions */
function isIssueCouponRpcResponse(v: unknown): v is IssueCouponRpcResponse {
  return (
    typeof v === 'object' &&
    v !== null &&
    'success' in v &&
    'is_existing' in v &&
    'coupon' in v &&
    typeof (v as IssueCouponRpcResponse).coupon === 'object' &&
    (v as IssueCouponRpcResponse).coupon !== null &&
    'id' in (v as IssueCouponRpcResponse).coupon &&
    'validation_number' in (v as IssueCouponRpcResponse).coupon &&
    'status' in (v as IssueCouponRpcResponse).coupon
  );
}

function isVoidCouponRpcResponse(v: unknown): v is VoidCouponRpcResponse {
  return (
    typeof v === 'object' &&
    v !== null &&
    'success' in v &&
    'is_existing' in v &&
    'coupon' in v &&
    typeof (v as VoidCouponRpcResponse).coupon === 'object' &&
    (v as VoidCouponRpcResponse).coupon !== null &&
    'id' in (v as VoidCouponRpcResponse).coupon &&
    'status' in (v as VoidCouponRpcResponse).coupon
  );
}

function isReplaceCouponRpcResponse(v: unknown): v is ReplaceCouponRpcResponse {
  return (
    typeof v === 'object' &&
    v !== null &&
    'success' in v &&
    'is_existing' in v &&
    'old_coupon' in v &&
    'new_coupon' in v &&
    typeof (v as ReplaceCouponRpcResponse).old_coupon === 'object' &&
    typeof (v as ReplaceCouponRpcResponse).new_coupon === 'object'
  );
}

function isInventoryRpcRow(v: unknown): v is InventoryRpcRow {
  return (
    typeof v === 'object' && v !== null && 'status' in v && 'coupon_count' in v
  );
}

export function isPromoProgramRow(v: unknown): v is PromoProgramRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    'casino_id' in v &&
    'name' in v &&
    'promo_type' in v &&
    'face_value_amount' in v
  );
}

export function isPromoCouponRow(v: unknown): v is PromoCouponRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    'casino_id' in v &&
    'promo_program_id' in v &&
    'validation_number' in v &&
    'status' in v
  );
}
/* eslint-enable custom-rules/no-dto-type-assertions */

// === Issue Coupon Mappers ===

/**
 * Maps rpc_issue_promo_coupon response to IssueCouponOutput DTO.
 */
export function toIssueCouponOutput(
  response: IssueCouponRpcResponse,
): IssueCouponOutput {
  return {
    coupon: {
      id: response.coupon.id,
      validationNumber: response.coupon.validation_number,
      status: response.coupon.status,
      faceValueAmount: response.coupon.face_value_amount,
      requiredMatchWagerAmount:
        response.coupon.required_match_wager_amount ?? 0,
      issuedAt: response.coupon.issued_at,
      expiresAt: response.coupon.expires_at ?? null,
      playerId: response.coupon.player_id ?? null,
      visitId: response.coupon.visit_id ?? null,
    },
    isExisting: response.is_existing,
  };
}

/**
 * Parses unknown RPC response to IssueCouponOutput.
 * @throws Error if response shape is invalid
 */
export function parseIssueCouponResponse(row: unknown): IssueCouponOutput {
  if (!isIssueCouponRpcResponse(row)) {
    throw new Error('Invalid IssueCoupon RPC response structure');
  }
  return toIssueCouponOutput(row);
}

// === Void Coupon Mappers ===

/**
 * Maps rpc_void_promo_coupon response to VoidCouponOutput DTO.
 */
export function toVoidCouponOutput(
  response: VoidCouponRpcResponse,
): VoidCouponOutput {
  return {
    coupon: {
      id: response.coupon.id,
      validationNumber: response.coupon.validation_number,
      status: response.coupon.status,
      voidedAt: response.coupon.voided_at,
      voidedByStaffId: response.coupon.voided_by_staff_id ?? '',
    },
    isExisting: response.is_existing,
  };
}

/**
 * Parses unknown RPC response to VoidCouponOutput.
 * @throws Error if response shape is invalid
 */
export function parseVoidCouponResponse(row: unknown): VoidCouponOutput {
  if (!isVoidCouponRpcResponse(row)) {
    throw new Error('Invalid VoidCoupon RPC response structure');
  }
  return toVoidCouponOutput(row);
}

// === Replace Coupon Mappers ===

/**
 * Maps rpc_replace_promo_coupon response to ReplaceCouponOutput DTO.
 */
export function toReplaceCouponOutput(
  response: ReplaceCouponRpcResponse,
): ReplaceCouponOutput {
  return {
    oldCoupon: {
      id: response.old_coupon.id,
      validationNumber: response.old_coupon.validation_number ?? '',
      status: response.old_coupon.status,
      replacedAt: response.old_coupon.replaced_at ?? '',
    },
    newCoupon: {
      id: response.new_coupon.id,
      validationNumber: response.new_coupon.validation_number,
      status: response.new_coupon.status,
      faceValueAmount: response.new_coupon.face_value_amount ?? 0,
      issuedAt: response.new_coupon.issued_at ?? '',
      expiresAt: response.new_coupon.expires_at ?? null,
    },
    isExisting: response.is_existing,
  };
}

/**
 * Parses unknown RPC response to ReplaceCouponOutput.
 * @throws Error if response shape is invalid
 */
export function parseReplaceCouponResponse(row: unknown): ReplaceCouponOutput {
  if (!isReplaceCouponRpcResponse(row)) {
    throw new Error('Invalid ReplaceCoupon RPC response structure');
  }
  return toReplaceCouponOutput(row);
}

// === Inventory Mappers ===

/**
 * Maps inventory RPC row to CouponInventoryRow DTO.
 */
export function toInventoryRow(row: InventoryRpcRow): CouponInventoryRow {
  return {
    status: row.status,
    couponCount: Number(row.coupon_count),
    totalFaceValue: Number(row.total_face_value ?? 0),
    totalMatchWager: Number(row.total_match_wager ?? 0),
  };
}

/**
 * Parses unknown[] RPC response to CouponInventoryOutput.
 * @throws Error if any row shape is invalid
 */
export function parseInventoryResponse(data: unknown): CouponInventoryOutput {
  if (!Array.isArray(data)) {
    throw new Error('Invalid Inventory RPC response: expected array');
  }
  const inventory: CouponInventoryRow[] = [];
  for (const row of data) {
    if (!isInventoryRpcRow(row)) {
      throw new Error('Invalid InventoryRpcRow structure');
    }
    inventory.push(toInventoryRow(row));
  }
  return { inventory };
}

// === Promo Program Mappers ===

/**
 * Maps promo_program row to PromoProgramDTO.
 */
export function toPromoProgramDTO(row: PromoProgramRow): PromoProgramDTO {
  return {
    id: row.id,
    casinoId: row.casino_id,
    name: row.name,
    promoType: row.promo_type,
    faceValueAmount: Number(row.face_value_amount),
    requiredMatchWagerAmount: Number(row.required_match_wager_amount),
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    createdByStaffId: row.created_by_staff_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Parses unknown data to PromoProgramDTO.
 * @throws Error if data shape is invalid
 */
export function parsePromoProgramRow(data: unknown): PromoProgramDTO {
  if (!isPromoProgramRow(data)) {
    throw new Error('Invalid PromoProgramRow structure');
  }
  return toPromoProgramDTO(data);
}

/**
 * Maps nullable promo_program row to PromoProgramDTO | null.
 */
export function toPromoProgramDTOOrNull(
  row: PromoProgramRow | null,
): PromoProgramDTO | null {
  return row ? toPromoProgramDTO(row) : null;
}

// === Promo Coupon Mappers ===

/**
 * Maps promo_coupon row to PromoCouponDTO.
 */
export function toPromoCouponDTO(row: PromoCouponRow): PromoCouponDTO {
  return {
    id: row.id,
    casinoId: row.casino_id,
    promoProgramId: row.promo_program_id,
    validationNumber: row.validation_number,
    status: row.status,
    faceValueAmount: Number(row.face_value_amount),
    requiredMatchWagerAmount: Number(row.required_match_wager_amount),
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    voidedAt: row.voided_at,
    replacedAt: row.replaced_at,
    clearedAt: row.cleared_at,
    playerId: row.player_id,
    visitId: row.visit_id,
    issuedByStaffId: row.issued_by_staff_id,
    voidedByStaffId: row.voided_by_staff_id,
    replacedByStaffId: row.replaced_by_staff_id,
    replacementCouponId: row.replacement_coupon_id,
  };
}

/**
 * Parses unknown data to PromoCouponDTO.
 * @throws Error if data shape is invalid
 */
export function parsePromoCouponRow(data: unknown): PromoCouponDTO {
  if (!isPromoCouponRow(data)) {
    throw new Error('Invalid PromoCouponRow structure');
  }
  return toPromoCouponDTO(data);
}

/**
 * Maps nullable promo_coupon row to PromoCouponDTO | null.
 */
export function toPromoCouponDTOOrNull(
  row: PromoCouponRow | null,
): PromoCouponDTO | null {
  return row ? toPromoCouponDTO(row) : null;
}

// === Error Shape Mapper ===

/**
 * Extracts error shape from unknown error for error mapping functions.
 * Uses runtime checks to safely narrow unknown error types.
 */

export function toErrorShape(error: unknown): {
  code?: string;
  message: string;
} {
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    const message =
      typeof errObj.message === 'string' ? errObj.message : String(error);
    const code = typeof errObj.code === 'string' ? errObj.code : undefined;
    return { code, message };
  }
  return { message: String(error) };
}
