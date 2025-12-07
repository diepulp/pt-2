export interface CasinoThresholds {
  watchlistFloor: number;
  ctrThreshold: number;
}

export type ThresholdBadge = 'none' | 'watchlist_near' | 'ctr_near' | 'ctr_met';

export interface LoyaltyContextSummary {
  lastRewardAt: string;
  reason?: string;
}

export interface MtlEntryRecord {
  id: string;
  casino_id: string;
  patron_uuid: string;
  staff_id?: string | null;
  rating_slip_id?: string | null;
  visit_id?: string | null;
  amount: number;
  direction: 'in' | 'out';
  area?: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface ReadonlyMtlEntryView {
  id: string;
  casino_id: string;
  patron_uuid: string;
  staff_id: string | null;
  rating_slip_id: string | null;
  visit_id: string | null;
  amount: number;
  direction: 'in' | 'out';
  area: string | null;
  created_at: string;
  threshold_badge: ThresholdBadge;
  loyalty_context?: {
    reason?: string;
    occurred_at: string;
  };
}

export function deriveThresholdBadge(
  amount: number,
  thresholds: CasinoThresholds,
): ThresholdBadge {
  if (amount >= thresholds.ctrThreshold) {
    return 'ctr_met';
  }

  if (amount >= thresholds.ctrThreshold * 0.9) {
    return 'ctr_near';
  }

  if (amount >= thresholds.watchlistFloor) {
    return 'watchlist_near';
  }

  return 'none';
}

export function toReadonlyMtlEntryView(
  entry: MtlEntryRecord,
  thresholds: CasinoThresholds,
  loyaltyContext?: LoyaltyContextSummary | null,
): ReadonlyMtlEntryView {
  return {
    id: entry.id,
    casino_id: entry.casino_id,
    patron_uuid: entry.patron_uuid,
    staff_id: entry.staff_id ?? null,
    rating_slip_id: entry.rating_slip_id ?? null,
    visit_id: entry.visit_id ?? null,
    amount: entry.amount,
    direction: entry.direction,
    area: entry.area ?? null,
    created_at: entry.created_at,
    threshold_badge: deriveThresholdBadge(entry.amount, thresholds),
    ...(loyaltyContext
      ? {
          loyalty_context: {
            reason: loyaltyContext.reason,
            occurred_at: loyaltyContext.lastRewardAt,
          },
        }
      : {}),
  };
}
