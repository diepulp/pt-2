/**
 * @jest-environment node
 *
 * RecognitionService Mapper Tests
 *
 * 100% coverage target for all mappers.
 *
 * @see EXEC-051 WS5
 */

import {
  mapActivationResult,
  mapLoyaltyEntitlement,
  mapRecognitionResult,
  mapRedemptionResult,
} from '../mappers';

describe('mapLoyaltyEntitlement', () => {
  it('maps complete entitlement JSON', () => {
    const raw = {
      portfolio_total: 12500,
      local_balance: 4500,
      local_tier: 'silver',
      redeemable_here: 4500,
      properties: [
        {
          casino_id: 'c1',
          casino_name: 'Casino A',
          balance: 8000,
          tier: 'gold',
        },
        {
          casino_id: 'c2',
          casino_name: 'Casino B',
          balance: 4500,
          tier: 'silver',
        },
      ],
    };

    const result = mapLoyaltyEntitlement(raw);

    expect(result.portfolioTotal).toBe(12500);
    expect(result.localBalance).toBe(4500);
    expect(result.localTier).toBe('silver');
    expect(result.redeemableHere).toBe(4500);
    expect(result.properties).toHaveLength(2);
    expect(result.properties[0]).toEqual({
      casinoId: 'c1',
      casinoName: 'Casino A',
      balance: 8000,
      tier: 'gold',
    });
  });

  it('handles null local_tier', () => {
    const raw = {
      portfolio_total: 0,
      local_balance: 0,
      local_tier: null,
      redeemable_here: 0,
      properties: [],
    };

    const result = mapLoyaltyEntitlement(raw);
    expect(result.localTier).toBeNull();
  });

  it('handles missing properties array', () => {
    const raw = {
      portfolio_total: 100,
      local_balance: 100,
      redeemable_here: 100,
    };
    const result = mapLoyaltyEntitlement(raw);
    expect(result.properties).toEqual([]);
  });

  it('defaults numeric fields to 0 when missing', () => {
    const raw = {};
    const result = mapLoyaltyEntitlement(raw);
    expect(result.portfolioTotal).toBe(0);
    expect(result.localBalance).toBe(0);
    expect(result.redeemableHere).toBe(0);
  });
});

describe('mapRecognitionResult', () => {
  const baseLookupRow = {
    player_id: 'p1',
    full_name: 'John Doe',
    birth_date: '1985-03-15',
    enrolled_casinos: [
      {
        casino_id: 'c1',
        casino_name: 'Casino A',
        status: 'active',
        enrolled_at: '2025-01-01T00:00:00Z',
      },
    ],
    loyalty_entitlement: {
      portfolio_total: 8000,
      local_balance: 8000,
      local_tier: 'gold',
      redeemable_here: 8000,
      properties: [
        {
          casino_id: 'c1',
          casino_name: 'Casino A',
          balance: 8000,
          tier: 'gold',
        },
      ],
    },
    active_locally: true,
    last_company_visit: '2026-03-10T14:00:00Z',
    has_sister_exclusions: null,
    max_exclusion_severity: null,
  };

  it('maps full recognition result', () => {
    const result = mapRecognitionResult(baseLookupRow as never);

    expect(result.playerId).toBe('p1');
    expect(result.fullName).toBe('John Doe');
    expect(result.birthDate).toBe('1985-03-15');
    expect(result.activeLocally).toBe(true);
    expect(result.enrolledCasinos).toHaveLength(1);
    expect(result.enrolledCasinos[0].casinoName).toBe('Casino A');
    expect(result.loyaltyEntitlement.portfolioTotal).toBe(8000);
    expect(result.lastCompanyVisit).toBe('2026-03-10T14:00:00Z');
  });

  it('maps null exclusion fields (Slice 1 stub)', () => {
    const result = mapRecognitionResult(baseLookupRow as never);
    expect(result.hasSisterExclusions).toBeNull();
    expect(result.maxExclusionSeverity).toBeNull();
  });

  it('handles null birth_date', () => {
    const row = { ...baseLookupRow, birth_date: null };
    const result = mapRecognitionResult(row as never);
    expect(result.birthDate).toBeNull();
  });

  it('handles null last_company_visit', () => {
    const row = { ...baseLookupRow, last_company_visit: null };
    const result = mapRecognitionResult(row as never);
    expect(result.lastCompanyVisit).toBeNull();
  });

  it('handles empty enrolled_casinos', () => {
    const row = { ...baseLookupRow, enrolled_casinos: [] };
    const result = mapRecognitionResult(row as never);
    expect(result.enrolledCasinos).toEqual([]);
  });
});

describe('mapActivationResult', () => {
  it('maps activated=true, already_enrolled=false', () => {
    const result = mapActivationResult({
      activated: true,
      already_enrolled: false,
    });
    expect(result.activated).toBe(true);
    expect(result.alreadyEnrolled).toBe(false);
  });

  it('maps activated=false, already_enrolled=true (idempotent)', () => {
    const result = mapActivationResult({
      activated: false,
      already_enrolled: true,
    });
    expect(result.activated).toBe(false);
    expect(result.alreadyEnrolled).toBe(true);
  });
});

describe('mapRedemptionResult', () => {
  it('maps successful redemption', () => {
    const raw = {
      redeemed: true,
      amount: 2000,
      local_balance: 2500,
      portfolio_total: 10500,
      redeemable_here: 2500,
      ledger_id: 'ledger-123',
    };

    const result = mapRedemptionResult(raw);

    expect(result.redeemed).toBe(true);
    expect(result.amount).toBe(2000);
    expect(result.localBalance).toBe(2500);
    expect(result.portfolioTotal).toBe(10500);
    expect(result.redeemableHere).toBe(2500);
    expect(result.ledgerId).toBe('ledger-123');
  });

  it('defaults numeric fields to 0 when missing', () => {
    const result = mapRedemptionResult({ redeemed: false });
    expect(result.amount).toBe(0);
    expect(result.localBalance).toBe(0);
    expect(result.portfolioTotal).toBe(0);
  });
});
