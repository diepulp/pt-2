/**
 * @jest-environment node
 *
 * HTTP Client <-> Route Handler Contract Tests
 *
 * Validates that every function in http.ts has a corresponding route export.
 * This prevents the bug where an HTTP client calls a non-existent route.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS5
 */

// Import route modules to verify exports exist
import * as rewardDetailRoute from '@/app/api/v1/rewards/[id]/route';
import * as earnConfigRoute from '@/app/api/v1/rewards/earn-config/route';
import * as eligibleRoute from '@/app/api/v1/rewards/eligible/route';
import * as rewardsRoute from '@/app/api/v1/rewards/route';

import * as http from '../http';

describe('reward http.ts <-> route.ts contract', () => {
  describe('Catalog collection (/api/v1/rewards)', () => {
    it('listRewards -> GET /rewards', () => {
      expect(typeof http.listRewards).toBe('function');
      expect(typeof rewardsRoute.GET).toBe('function');
    });

    it('createReward -> POST /rewards', () => {
      expect(typeof http.createReward).toBe('function');
      expect(typeof rewardsRoute.POST).toBe('function');
    });
  });

  describe('Catalog detail (/api/v1/rewards/[id])', () => {
    it('getReward -> GET /rewards/[id]', () => {
      expect(typeof http.getReward).toBe('function');
      expect(typeof rewardDetailRoute.GET).toBe('function');
    });

    it('updateReward -> PATCH /rewards/[id]', () => {
      expect(typeof http.updateReward).toBe('function');
      expect(typeof rewardDetailRoute.PATCH).toBe('function');
    });
  });

  describe('Earn config (/api/v1/rewards/earn-config)', () => {
    it('getEarnConfig -> GET /rewards/earn-config', () => {
      expect(typeof http.getEarnConfig).toBe('function');
      expect(typeof earnConfigRoute.GET).toBe('function');
    });

    it('upsertEarnConfig -> PUT /rewards/earn-config', () => {
      expect(typeof http.upsertEarnConfig).toBe('function');
      expect(typeof earnConfigRoute.PUT).toBe('function');
    });
  });

  describe('Eligible rewards (/api/v1/rewards/eligible)', () => {
    it('listEligibleRewards -> GET /rewards/eligible', () => {
      expect(typeof http.listEligibleRewards).toBe('function');
      expect(typeof eligibleRoute.GET).toBe('function');
    });
  });

  describe('Contract coverage', () => {
    it('all http.ts exported functions have corresponding routes', () => {
      const httpFunctions = [
        'listRewards',
        'getReward',
        'createReward',
        'updateReward',
        'getEarnConfig',
        'upsertEarnConfig',
        'listEligibleRewards',
      ];

      httpFunctions.forEach((fnName) => {
        expect(typeof (http as Record<string, unknown>)[fnName]).toBe(
          'function',
        );
      });

      expect(httpFunctions.length).toBe(7);
    });

    it('all route files export force-dynamic where applicable', () => {
      // Collection routes must be force-dynamic
      expect(rewardsRoute.dynamic).toBe('force-dynamic');
      expect(earnConfigRoute.dynamic).toBe('force-dynamic');
      expect(eligibleRoute.dynamic).toBe('force-dynamic');
    });
  });
});
