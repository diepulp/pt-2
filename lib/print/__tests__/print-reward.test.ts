/** @jest-environment node */

import { iframePrint } from '../iframe-print';
import { printReward } from '../print-reward';
import { buildCompSlipHtml } from '../templates/comp-slip';
import { buildCouponHtml } from '../templates/coupon';
import type { CompFulfillmentPayload, PrintJob } from '../types';

const mockPrintJob: PrintJob = {
  promise: Promise.resolve({ success: true }),
  cleanup: jest.fn(),
};

jest.mock('../templates/comp-slip', () => ({
  buildCompSlipHtml: jest.fn(() => '<html>comp</html>'),
}));
jest.mock('../templates/coupon', () => ({
  buildCouponHtml: jest.fn(() => '<html>coupon</html>'),
}));
jest.mock('../iframe-print', () => ({
  iframePrint: jest.fn(() => mockPrintJob),
}));

const COMP_PAYLOAD: CompFulfillmentPayload = {
  family: 'points_comp',
  ledger_id: 'uuid-123',
  reward_id: 'r-001',
  reward_code: 'MEAL_25',
  reward_name: 'Meal Comp',
  face_value_cents: 2500,
  points_redeemed: 500,
  balance_after: 1500,
  player_name: 'John',
  player_id: 'p-001',
  casino_name: 'Casino',
  staff_name: 'Staff',
  issued_at: '2026-03-20T00:00:00Z',
};

describe('printReward', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes points_comp payload to buildCompSlipHtml', () => {
    printReward(COMP_PAYLOAD);
    expect(buildCompSlipHtml).toHaveBeenCalledWith(COMP_PAYLOAD);
    expect(buildCouponHtml).not.toHaveBeenCalled();
  });

  it('routes entitlement payload to buildCouponHtml', () => {
    const entPayload = {
      family: 'entitlement' as const,
      coupon_id: 'c-001',
      validation_number: 'VN-123',
      reward_id: 'r-002',
      reward_code: 'MATCH_50',
      reward_name: 'Match Play',
      face_value_cents: 5000,
      required_match_wager_cents: 5000,
      expires_at: null,
      player_name: 'Jane',
      player_id: 'p-002',
      player_tier: 'Gold',
      casino_name: 'Casino',
      staff_name: 'Staff',
      issued_at: '2026-03-20T00:00:00Z',
    };
    printReward(entPayload);
    expect(buildCouponHtml).toHaveBeenCalledWith(entPayload);
    expect(buildCompSlipHtml).not.toHaveBeenCalled();
  });

  it('passes built HTML to iframePrint', () => {
    printReward(COMP_PAYLOAD);
    expect(iframePrint).toHaveBeenCalledWith('<html>comp</html>');
  });

  it('returns PrintJob from iframePrint', () => {
    const result = printReward(COMP_PAYLOAD);
    expect(result).toBe(mockPrintJob);
    expect(result).toHaveProperty('promise');
    expect(result).toHaveProperty('cleanup');
  });
});
