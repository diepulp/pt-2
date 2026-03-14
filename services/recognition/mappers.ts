/**
 * RecognitionService Mappers
 *
 * Maps RPC results to typed DTOs. 100% coverage target.
 *
 * @see PRD-051 / EXEC-051 WS2
 * @see ADR-044 D4 (lookup), D3 (activate), D6 (redeem), D7 (hybrid surface)
 */

import type { Database } from '@/types/database.types';

import type {
  ActivationResultDTO,
  EnrolledCasinoDTO,
  LoyaltyEntitlementDTO,
  PropertyLoyaltyDTO,
  RecognitionResultDTO,
  RedemptionResultDTO,
} from './dtos';

// === Json → Record coercion (avoids type assertions in crud.ts per SLAD §327-359) ===

export function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as never;
  }
  return {};
}

// === RPC Row Types ===

type LookupRow =
  Database['public']['Functions']['rpc_lookup_player_company']['Returns'][number];

// === Enrolled Casino Mapper ===

function mapEnrolledCasino(raw: Record<string, unknown>): EnrolledCasinoDTO {
  return {
    casinoId: String(raw.casino_id ?? ''),
    casinoName: String(raw.casino_name ?? ''),
    status: String(raw.status ?? ''),
    enrolledAt: String(raw.enrolled_at ?? ''),
  };
}

// === Property Loyalty Mapper ===

function mapPropertyLoyalty(raw: Record<string, unknown>): PropertyLoyaltyDTO {
  return {
    casinoId: String(raw.casino_id ?? ''),
    casinoName: String(raw.casino_name ?? ''),
    balance: Number(raw.balance ?? 0),
    tier: raw.tier != null ? String(raw.tier) : null,
  };
}

// === Loyalty Entitlement Mapper (D7) ===

export function mapLoyaltyEntitlement(
  raw: Record<string, unknown>,
): LoyaltyEntitlementDTO {
  const properties = Array.isArray(raw.properties)
    ? raw.properties.map((p: Record<string, unknown>) => mapPropertyLoyalty(p))
    : [];

  return {
    portfolioTotal: Number(raw.portfolio_total ?? 0),
    localBalance: Number(raw.local_balance ?? 0),
    localTier: raw.local_tier != null ? String(raw.local_tier) : null,
    redeemableHere: Number(raw.redeemable_here ?? 0),
    properties,
  };
}

// === Recognition Result Mapper ===

export function mapRecognitionResult(row: LookupRow): RecognitionResultDTO {
  const enrolledCasinos = Array.isArray(row.enrolled_casinos)
    ? (row.enrolled_casinos as Record<string, unknown>[]).map(mapEnrolledCasino)
    : [];

  const loyaltyEntitlement = mapLoyaltyEntitlement(
    (row.loyalty_entitlement ?? {}) as Record<string, unknown>,
  );

  return {
    playerId: row.player_id,
    fullName: row.full_name,
    birthDate: row.birth_date ?? null,
    enrolledCasinos,
    loyaltyEntitlement,
    activeLocally: row.active_locally,
    lastCompanyVisit: row.last_company_visit ?? null,
    hasSisterExclusions: row.has_sister_exclusions ?? null,
    maxExclusionSeverity: row.max_exclusion_severity ?? null,
  };
}

// === Activation Result Mapper ===

export function mapActivationResult(
  raw: Record<string, unknown>,
): ActivationResultDTO {
  return {
    activated: Boolean(raw.activated),
    alreadyEnrolled: Boolean(raw.already_enrolled),
  };
}

// === Redemption Result Mapper ===

export function mapRedemptionResult(
  raw: Record<string, unknown>,
): RedemptionResultDTO {
  return {
    redeemed: Boolean(raw.redeemed),
    amount: Number(raw.amount ?? 0),
    localBalance: Number(raw.local_balance ?? 0),
    portfolioTotal: Number(raw.portfolio_total ?? 0),
    redeemableHere: Number(raw.redeemable_here ?? 0),
    ledgerId: String(raw.ledger_id ?? ''),
  };
}
