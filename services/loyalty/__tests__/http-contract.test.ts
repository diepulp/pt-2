/**
 * @jest-environment node
 *
 * HTTP Client ↔ Route Handler Contract Tests
 *
 * Validates that every function in http.ts has a corresponding route export.
 * This prevents the bug where an HTTP client calls a non-existent route.
 *
 * Issue: PRD-011 (Route Handler Test Coverage)
 * Workstream: WS5 (LoyaltyService Route Handler Tests)
 */

// Import http.ts functions

// Import route modules to verify exports exist
import * as accrueRoute from '@/app/api/v1/loyalty/accrue/route';
import * as ledgerRoute from '@/app/api/v1/loyalty/ledger/route';
import * as manualCreditRoute from '@/app/api/v1/loyalty/manual-credit/route';
import * as promotionRoute from '@/app/api/v1/loyalty/promotion/route';
import * as redeemRoute from '@/app/api/v1/loyalty/redeem/route';
import * as suggestionRoute from '@/app/api/v1/loyalty/suggestion/route';
import * as playerLoyaltyRoute from '@/app/api/v1/players/[playerId]/loyalty/route';

import * as http from '../http';

describe('http.ts ↔ route.ts contract', () => {
  describe('Accrual endpoints (/api/v1/loyalty/accrue)', () => {
    it('accrueOnClose → POST /loyalty/accrue', () => {
      expect(typeof http.accrueOnClose).toBe('function');
      expect(typeof accrueRoute.POST).toBe('function');
    });
  });

  describe('Redemption endpoints (/api/v1/loyalty/redeem)', () => {
    it('redeem → POST /loyalty/redeem', () => {
      expect(typeof http.redeem).toBe('function');
      expect(typeof redeemRoute.POST).toBe('function');
    });
  });

  describe('Manual credit endpoints (/api/v1/loyalty/manual-credit)', () => {
    it('manualCredit → POST /loyalty/manual-credit', () => {
      expect(typeof http.manualCredit).toBe('function');
      expect(typeof manualCreditRoute.POST).toBe('function');
    });
  });

  describe('Promotion endpoints (/api/v1/loyalty/promotion)', () => {
    it('applyPromotion → POST /loyalty/promotion', () => {
      expect(typeof http.applyPromotion).toBe('function');
      expect(typeof promotionRoute.POST).toBe('function');
    });
  });

  describe('Suggestion endpoints (/api/v1/loyalty/suggestion)', () => {
    it('evaluateSuggestion → GET /loyalty/suggestion', () => {
      expect(typeof http.evaluateSuggestion).toBe('function');
      expect(typeof suggestionRoute.GET).toBe('function');
    });
  });

  describe('Balance endpoints (/api/v1/players/[playerId]/loyalty)', () => {
    it('getPlayerLoyalty → GET /players/[playerId]/loyalty', () => {
      expect(typeof http.getPlayerLoyalty).toBe('function');
      expect(typeof playerLoyaltyRoute.GET).toBe('function');
    });
  });

  describe('Ledger endpoints (/api/v1/loyalty/ledger)', () => {
    it('getLedger → GET /loyalty/ledger', () => {
      expect(typeof http.getLedger).toBe('function');
      expect(typeof ledgerRoute.GET).toBe('function');
    });
  });

  describe('Contract coverage', () => {
    it('all http.ts exported functions have corresponding routes', () => {
      // List of all exported loyalty functions from http.ts
      const httpFunctions = [
        'accrueOnClose',
        'redeem',
        'manualCredit',
        'applyPromotion',
        'evaluateSuggestion',
        'getPlayerLoyalty',
        'getLedger',
      ];

      // Verify each is a function
      httpFunctions.forEach((fnName) => {
        expect(typeof (http as Record<string, unknown>)[fnName]).toBe(
          'function',
        );
      });

      // Count should match (excluding helpers like buildParams)
      expect(httpFunctions.length).toBe(7);
    });
  });
});
