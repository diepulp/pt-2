import {
  deriveThresholdBadge,
  toReadonlyMtlEntryView,
} from '@/services/mtl/view-model';

const thresholds = {
  watchlistFloor: 3000,
  ctrThreshold: 10000,
};

describe('MTL read model', () => {
  it('derives badges based on casino thresholds', () => {
    expect(deriveThresholdBadge(500, thresholds)).toBe('none');
    expect(deriveThresholdBadge(3500, thresholds)).toBe('watchlist_near');
    expect(deriveThresholdBadge(9500, thresholds)).toBe('ctr_near');
    expect(deriveThresholdBadge(12500, thresholds)).toBe('ctr_met');
  });

  it('sanitizes loyalty-specific fields and only exposes compliance metadata', () => {
    const entry = {
      id: 'entry-1',
      casino_id: 'casino-1',
      patron_uuid: 'player-1',
      staff_id: 'staff-1',
      rating_slip_id: 'slip-1',
      visit_id: 'visit-1',
      amount: 9200,
      direction: 'in' as const,
      area: 'high-limit',
      created_at: '2025-03-01T10:00:00Z',
      loyalty_points_earned: 150, // Should not leak to read model
    };

    const view = toReadonlyMtlEntryView(entry, thresholds, {
      lastRewardAt: '2025-03-01T09:55:00Z',
      reason: 'mid_session',
    });

    expect(view.threshold_badge).toBe('ctr_near');
    expect(view).not.toHaveProperty('loyalty_points_earned');
    expect(view.loyalty_context).toEqual({
      reason: 'mid_session',
      occurred_at: '2025-03-01T09:55:00Z',
    });
  });
});
