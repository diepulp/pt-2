/**
 * Loyalty Actions Tests
 * Tests manual reward server action with guardrails
 */

import { manualReward, getRateLimitInfo } from '/home/diepulp/projects/pt-2/app/actions/loyalty-actions.ts';
import { resetRateLimit } from '/home/diepulp/projects/pt-2/lib/rate-limiter.ts';

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/services/loyalty/crud', () => ({
  createLoyaltyCrudService: jest.fn(),
}));

jest.mock('@/lib/server-actions/with-server-action-wrapper', () => ({
  withServerAction: jest.fn((action) => action()),
}));

describe('Loyalty Actions', () => {
  const mockSupabase = {
    auth: {
      getSession: jest.fn(),
    },
  };

  const mockLoyaltyService = {
    createLedgerEntry: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimit('test-staff-id');

    const { createClient } = require('@/lib/supabase/server');
    createClient.mockResolvedValue(mockSupabase);

    const { createLoyaltyCrudService } = require('@/services/loyalty/crud');
    createLoyaltyCrudService.mockReturnValue(mockLoyaltyService);
  });

  describe('manualReward', () => {
    const validInput = {
      playerId: 'player-123',
      pointsChange: 100,
      reason: 'Birthday bonus',
      sequence: 1,
    };

    it('rejects unauthenticated requests', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
      });

      const result = await manualReward(validInput);

      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error?.code).toBe('UNAUTHORIZED');
    });

    it('enforces rate limiting', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'test-staff-id' },
          },
        },
      });

      mockLoyaltyService.createLedgerEntry.mockResolvedValue({
        success: true,
        data: {
          id: 'ledger-123',
          player_id: 'player-123',
          points_change: 100,
          balance_before: 500,
          balance_after: 600,
          tier_before: 'BRONZE',
          tier_after: 'SILVER',
        },
      });

      // Exhaust rate limit (10 requests/min)
      for (let i = 0; i < 10; i++) {
        await manualReward(validInput);
      }

      // 11th request should be rate limited
      const result = await manualReward(validInput);

      expect(result.success).toBe(false);
      expect(result.status).toBe(429);
      expect(result.error?.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('generates deterministic idempotency keys', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'test-staff-id' },
          },
        },
      });

      let capturedSessionId1: string | undefined;
      let capturedSessionId2: string | undefined;

      mockLoyaltyService.createLedgerEntry
        .mockImplementationOnce((entry) => {
          capturedSessionId1 = entry.session_id;
          return Promise.resolve({
            success: true,
            data: {
              id: 'ledger-123',
              player_id: entry.player_id,
              points_change: entry.points_change,
              balance_before: 500,
              balance_after: 600,
              tier_before: 'BRONZE',
              tier_after: 'SILVER',
            },
          });
        })
        .mockImplementationOnce((entry) => {
          capturedSessionId2 = entry.session_id;
          return Promise.resolve({
            success: true,
            data: {
              id: 'ledger-124',
              player_id: entry.player_id,
              points_change: entry.points_change,
              balance_before: 600,
              balance_after: 700,
              tier_before: 'SILVER',
              tier_after: 'SILVER',
            },
          });
        });

      // Reset rate limit to allow multiple calls
      resetRateLimit('test-staff-id');

      await manualReward(validInput);
      await manualReward(validInput);

      // Same inputs should produce same idempotency key
      expect(capturedSessionId1).toBe(capturedSessionId2);
      expect(capturedSessionId1).toBeTruthy();
    });

    it('includes audit trail in result', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'test-staff-id' },
          },
        },
      });

      mockLoyaltyService.createLedgerEntry.mockResolvedValue({
        success: true,
        data: {
          id: 'ledger-123',
          player_id: 'player-123',
          points_change: 100,
          balance_before: 500,
          balance_after: 600,
          tier_before: 'BRONZE',
          tier_after: 'SILVER',
        },
      });

      const result = await manualReward(validInput);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        ledgerId: 'ledger-123',
        playerId: 'player-123',
        pointsChange: 100,
        balanceBefore: 500,
        balanceAfter: 600,
        tierBefore: 'BRONZE',
        tierAfter: 'SILVER',
      });
      expect(result.data?.idempotencyKey).toBeTruthy();
      expect(result.data?.correlationId).toBeTruthy();
    });

    it('passes staff_id and correlation_id to service', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'test-staff-id' },
          },
        },
      });

      let capturedEntry: any;
      mockLoyaltyService.createLedgerEntry.mockImplementation((entry) => {
        capturedEntry = entry;
        return Promise.resolve({
          success: true,
          data: {
            id: 'ledger-123',
            player_id: entry.player_id,
            points_change: entry.points_change,
            balance_before: 500,
            balance_after: 600,
            tier_before: 'BRONZE',
            tier_after: 'SILVER',
          },
        });
      });

      await manualReward(validInput);

      expect(capturedEntry.staff_id).toBe('test-staff-id');
      expect(capturedEntry.correlation_id).toBeTruthy();
    });
  });

  describe('getRateLimitInfo', () => {
    it('returns rate limit status for authenticated user', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'test-staff-id' },
          },
        },
      });

      const result = await getRateLimitInfo();

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        remaining: expect.any(Number),
        isLimited: expect.any(Boolean),
      });
    });

    it('rejects unauthenticated requests', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
      });

      const result = await getRateLimitInfo();

      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error?.code).toBe('UNAUTHORIZED');
    });
  });
});
