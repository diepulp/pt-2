/**
 * Player360DashboardService Mappers Unit Tests
 *
 * Tests engagement status, rewards eligibility cooldown,
 * recent events mapping, and metadata type guards.
 *
 * @see services/player360-dashboard/mappers.ts
 * @see GAP-PLAYER-360-PANELS-BACKEND-DATA.md (Gaps 1, 5)
 */

import type { VisitDTO } from '../../visit/dtos';
import {
  mapToEngagement,
  mapToRewardsEligibility,
  mapToRecentEvents,
  toMetadataRecord,
  parseLoyaltyData,
} from '../mappers';

// === Helpers ===

/** Create an ISO timestamp N minutes ago from a fixed reference */
function minutesAgo(n: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - n);
  return d.toISOString();
}

/** Minimal visit factory */
function makeVisit(overrides: Partial<VisitDTO> = {}): VisitDTO {
  return {
    id: 'visit-1',
    player_id: 'player-1',
    casino_id: 'casino-1',
    started_at: minutesAgo(120),
    ended_at: null,
    visit_kind: 'gaming_identified_rated',
    visit_group_id: 'visit-1',
    gaming_day: '2026-01-28',
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────
// mapToEngagement
// ──────────────────────────────────────────────────────────

describe('mapToEngagement', () => {
  it('returns "active" when last event is within 15 minutes', () => {
    const result = mapToEngagement(makeVisit(), minutesAgo(5));
    expect(result.status).toBe('active');
    expect(result.isActive).toBe(true);
  });

  it('returns "active" when last event is exactly 15 minutes ago', () => {
    const result = mapToEngagement(makeVisit(), minutesAgo(15));
    expect(result.status).toBe('active');
    expect(result.isActive).toBe(true);
  });

  it('returns "cooling" when last event is between 16-60 minutes ago', () => {
    const result = mapToEngagement(makeVisit(), minutesAgo(30));
    expect(result.status).toBe('cooling');
    expect(result.isActive).toBe(false);
  });

  it('returns "cooling" when last event is exactly 60 minutes ago', () => {
    const result = mapToEngagement(makeVisit(), minutesAgo(60));
    expect(result.status).toBe('cooling');
    expect(result.isActive).toBe(false);
  });

  it('returns "dormant" when last event is over 60 minutes ago', () => {
    const result = mapToEngagement(makeVisit(), minutesAgo(90));
    expect(result.status).toBe('dormant');
    expect(result.isActive).toBe(false);
  });

  it('falls back to visit.started_at when lastEventAt is null', () => {
    // Visit started 10 min ago → should show "active"
    const visit = makeVisit({ started_at: minutesAgo(10) });
    const result = mapToEngagement(visit, null);
    expect(result.status).toBe('active');
    expect(result.isActive).toBe(true);
  });

  it('falls back to now when both visit and lastEventAt are null', () => {
    const result = mapToEngagement(null, null);
    // When visit is null and lastEventAt is null, defaults to now → active
    expect(result.status).toBe('active');
    expect(result.isActive).toBe(true);
    expect(result.durationMinutes).toBe(0);
  });

  it('calculates durationMinutes from visit.started_at', () => {
    const visit = makeVisit({ started_at: minutesAgo(45) });
    const result = mapToEngagement(visit, minutesAgo(5));
    // Duration is ~45 min from visit start (not from lastEventAt)
    expect(result.durationMinutes).toBeGreaterThanOrEqual(44);
    expect(result.durationMinutes).toBeLessThanOrEqual(46);
  });

  it('returns durationMinutes 0 when no visit', () => {
    const result = mapToEngagement(null, minutesAgo(5));
    expect(result.durationMinutes).toBe(0);
  });

  it('populates lastSeenAt from lastEventAt', () => {
    const eventTime = minutesAgo(10);
    const result = mapToEngagement(makeVisit(), eventTime);
    expect(result.lastSeenAt).toBe(eventTime);
  });
});

// ──────────────────────────────────────────────────────────
// mapToRewardsEligibility
// ──────────────────────────────────────────────────────────

describe('mapToRewardsEligibility', () => {
  const balance = { balance: 500, tier: 'gold' };

  it('returns "available" when no recent reward', () => {
    const result = mapToRewardsEligibility(balance, null);
    expect(result.status).toBe('available');
    expect(result.nextEligibleAt).toBeNull();
    expect(result.reasonCodes).toEqual(['AVAILABLE']);
  });

  it('returns "not_available" with cooldown when reward is recent (<30 min)', () => {
    const result = mapToRewardsEligibility(balance, minutesAgo(10));
    expect(result.status).toBe('not_available');
    expect(result.nextEligibleAt).not.toBeNull();
    expect(result.reasonCodes).toEqual(['COOLDOWN_ACTIVE']);
  });

  it('returns "available" when reward is past cooldown (>30 min)', () => {
    const result = mapToRewardsEligibility(balance, minutesAgo(45));
    expect(result.status).toBe('available');
    expect(result.nextEligibleAt).toBeNull();
    expect(result.reasonCodes).toEqual(['AVAILABLE']);
  });

  it('returns "not_available" when reward is exactly at cooldown boundary', () => {
    // 29 minutes ago → cooldown should still be active (expires at ~+1min)
    const result = mapToRewardsEligibility(balance, minutesAgo(29));
    expect(result.status).toBe('not_available');
    expect(result.reasonCodes).toEqual(['COOLDOWN_ACTIVE']);
  });

  it('returns "unknown" when no loyalty balance', () => {
    const result = mapToRewardsEligibility(null, null);
    expect(result.status).toBe('unknown');
    expect(result.reasonCodes).toEqual(['RULES_NOT_CONFIGURED']);
    expect(result.guidance).toContain('not configured');
  });

  it('returns "unknown" when no loyalty balance even with recent reward', () => {
    const result = mapToRewardsEligibility(null, minutesAgo(5));
    expect(result.status).toBe('unknown');
  });

  it('respects custom cooldown minutes', () => {
    // Reward 20 min ago, 15-min cooldown → should be available
    const result = mapToRewardsEligibility(balance, minutesAgo(20), 15);
    expect(result.status).toBe('available');
  });

  it('respects longer custom cooldown', () => {
    // Reward 20 min ago, 60-min cooldown → should NOT be available
    const result = mapToRewardsEligibility(balance, minutesAgo(20), 60);
    expect(result.status).toBe('not_available');
  });

  it('calculates correct nextEligibleAt timestamp', () => {
    const rewardTime = minutesAgo(10);
    const result = mapToRewardsEligibility(balance, rewardTime, 30);

    expect(result.nextEligibleAt).not.toBeNull();
    // Should be ~20 minutes from now
    const eligibleAt = new Date(result.nextEligibleAt!).getTime();
    const nowPlusAbout20Min = Date.now() + 19 * 60000;
    const nowPlusAbout21Min = Date.now() + 21 * 60000;
    expect(eligibleAt).toBeGreaterThanOrEqual(nowPlusAbout20Min);
    expect(eligibleAt).toBeLessThanOrEqual(nowPlusAbout21Min);
  });
});

// ──────────────────────────────────────────────────────────
// mapToRecentEvents
// ──────────────────────────────────────────────────────────

describe('mapToRecentEvents', () => {
  it('extracts all three event types from timeline', () => {
    const events = [
      {
        event_type: 'cash_in',
        occurred_at: '2026-01-28T10:00:00Z',
        amount: 500,
        metadata: {},
        summary: 'Buy-in $500',
      },
      {
        event_type: 'points_redeemed',
        occurred_at: '2026-01-28T09:00:00Z',
        amount: null,
        metadata: {},
        summary: 'Redeemed 100 points',
      },
      {
        event_type: 'note_added',
        occurred_at: '2026-01-28T08:00:00Z',
        amount: null,
        metadata: {},
        summary: 'VIP guest, prefers table 7 for blackjack',
      },
    ];

    const result = mapToRecentEvents(events);
    expect(result.lastBuyIn).toEqual({
      at: '2026-01-28T10:00:00Z',
      amount: 500,
    });
    expect(result.lastReward).toEqual({
      at: '2026-01-28T09:00:00Z',
      type: 'comp',
    });
    expect(result.lastNote).toEqual({
      at: '2026-01-28T08:00:00Z',
      preview: 'VIP guest, prefers table 7 for blackjack',
    });
  });

  it('returns nulls when no matching events', () => {
    const result = mapToRecentEvents([]);
    expect(result.lastBuyIn).toBeNull();
    expect(result.lastReward).toBeNull();
    expect(result.lastNote).toBeNull();
  });

  it('handles promo_issued as reward type "promo"', () => {
    const events = [
      {
        event_type: 'promo_issued',
        occurred_at: '2026-01-28T10:00:00Z',
        amount: null,
        metadata: {},
        summary: 'Promo issued',
      },
    ];
    const result = mapToRecentEvents(events);
    expect(result.lastReward).toEqual({
      at: '2026-01-28T10:00:00Z',
      type: 'promo',
    });
  });

  it('picks first matching event for each category', () => {
    const events = [
      {
        event_type: 'cash_in',
        occurred_at: '2026-01-28T11:00:00Z',
        amount: 1000,
        metadata: {},
        summary: 'Second buy-in',
      },
      {
        event_type: 'cash_in',
        occurred_at: '2026-01-28T10:00:00Z',
        amount: 500,
        metadata: {},
        summary: 'First buy-in',
      },
    ];
    const result = mapToRecentEvents(events);
    // Should pick the first one encountered (11:00)
    expect(result.lastBuyIn?.amount).toBe(1000);
  });

  it('truncates note preview to 50 characters', () => {
    const longNote = 'A'.repeat(100);
    const events = [
      {
        event_type: 'note_added',
        occurred_at: '2026-01-28T10:00:00Z',
        amount: null,
        metadata: {},
        summary: longNote,
      },
    ];
    const result = mapToRecentEvents(events);
    expect(result.lastNote?.preview).toHaveLength(50);
  });

  it('defaults amount to 0 when null on cash_in', () => {
    const events = [
      {
        event_type: 'cash_in',
        occurred_at: '2026-01-28T10:00:00Z',
        amount: null,
        metadata: {},
        summary: 'Buy-in',
      },
    ];
    const result = mapToRecentEvents(events);
    expect(result.lastBuyIn?.amount).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────
// toMetadataRecord
// ──────────────────────────────────────────────────────────

describe('toMetadataRecord', () => {
  it('returns object as-is for valid object', () => {
    const input = { key: 'value' };
    expect(toMetadataRecord(input)).toEqual({ key: 'value' });
  });

  it('returns empty object for null', () => {
    expect(toMetadataRecord(null)).toEqual({});
  });

  it('returns empty object for array', () => {
    expect(toMetadataRecord([1, 2, 3])).toEqual({});
  });

  it('returns empty object for primitive string', () => {
    expect(toMetadataRecord('hello' as unknown as null)).toEqual({});
  });
});

// ──────────────────────────────────────────────────────────
// parseLoyaltyData
// ──────────────────────────────────────────────────────────

describe('parseLoyaltyData', () => {
  it('extracts balance from current_balance field', () => {
    const result = parseLoyaltyData({ current_balance: 500, tier: 'gold' });
    expect(result).toEqual({ balance: 500, tier: 'gold' });
  });

  it('falls back to balance field when current_balance is missing', () => {
    const result = parseLoyaltyData({ balance: 300, tier: null });
    expect(result).toEqual({ balance: 300, tier: null });
  });

  it('returns null for null input', () => {
    expect(parseLoyaltyData(null)).toBeNull();
  });

  it('defaults balance to 0 when both fields are missing', () => {
    const result = parseLoyaltyData({ tier: 'silver' });
    expect(result).toEqual({ balance: 0, tier: 'silver' });
  });
});
