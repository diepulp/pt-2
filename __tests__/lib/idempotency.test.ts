/**
 * Idempotency Key Generation Tests
 * Tests deterministic key generation for ledger operations
 */

import {
  hashIdempotencyKey,
  generateManualRewardKey,
  generateExternalRewardKey,
} from '@/lib/idempotency';

describe('Idempotency Key Generation', () => {
  describe('hashIdempotencyKey', () => {
    it('generates consistent hash for same inputs', () => {
      const components = {
        playerId: 'player-123',
        staffId: 'staff-456',
        date: '2025-10-13',
        sequence: '1',
      };

      const hash1 = hashIdempotencyKey(components);
      const hash2 = hashIdempotencyKey(components);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/i); // SHA-256 hex
    });

    it('generates different hash for different inputs', () => {
      const components1 = {
        playerId: 'player-123',
        staffId: 'staff-456',
        date: '2025-10-13',
      };

      const components2 = {
        playerId: 'player-123',
        staffId: 'staff-456',
        date: '2025-10-14', // Different date
      };

      const hash1 = hashIdempotencyKey(components1);
      const hash2 = hashIdempotencyKey(components2);

      expect(hash1).not.toBe(hash2);
    });

    it('handles key ordering consistently', () => {
      const components1 = { a: '1', b: '2', c: '3' };
      const components2 = { c: '3', a: '1', b: '2' }; // Different order

      const hash1 = hashIdempotencyKey(components1);
      const hash2 = hashIdempotencyKey(components2);

      expect(hash1).toBe(hash2); // Order-independent
    });

    it('handles null and undefined values', () => {
      const components = {
        playerId: 'player-123',
        staffId: null,
        date: undefined,
      };

      const hash = hashIdempotencyKey(components);
      expect(hash).toMatch(/^[0-9a-f]{64}$/i);
    });

    it('handles numeric values', () => {
      const components = {
        playerId: 'player-123',
        sequence: 1,
        amount: 100,
      };

      const hash = hashIdempotencyKey(components);
      expect(hash).toMatch(/^[0-9a-f]{64}$/i);
    });
  });

  describe('generateManualRewardKey', () => {
    it('generates consistent key for manual rewards', () => {
      const playerId = 'player-123';
      const staffId = 'staff-456';
      const date = '2025-10-13';
      const sequence = 1;

      const key1 = generateManualRewardKey(playerId, staffId, date, sequence);
      const key2 = generateManualRewardKey(playerId, staffId, date, sequence);

      expect(key1).toBe(key2);
    });

    it('generates different keys for different sequences', () => {
      const playerId = 'player-123';
      const staffId = 'staff-456';
      const date = '2025-10-13';

      const key1 = generateManualRewardKey(playerId, staffId, date, 1);
      const key2 = generateManualRewardKey(playerId, staffId, date, 2);

      expect(key1).not.toBe(key2);
    });

    it('uses default sequence of 1', () => {
      const playerId = 'player-123';
      const staffId = 'staff-456';
      const date = '2025-10-13';

      const key1 = generateManualRewardKey(playerId, staffId, date);
      const key2 = generateManualRewardKey(playerId, staffId, date, 1);

      expect(key1).toBe(key2);
    });

    it('generates different keys for different dates', () => {
      const playerId = 'player-123';
      const staffId = 'staff-456';

      const key1 = generateManualRewardKey(playerId, staffId, '2025-10-13', 1);
      const key2 = generateManualRewardKey(playerId, staffId, '2025-10-14', 1);

      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different staff', () => {
      const playerId = 'player-123';
      const date = '2025-10-13';

      const key1 = generateManualRewardKey(playerId, 'staff-456', date, 1);
      const key2 = generateManualRewardKey(playerId, 'staff-789', date, 1);

      expect(key1).not.toBe(key2);
    });
  });

  describe('generateExternalRewardKey', () => {
    it('generates consistent key for external rewards', () => {
      const playerId = 'player-123';
      const rewardId = 'promo-xyz-2025';

      const key1 = generateExternalRewardKey(playerId, rewardId);
      const key2 = generateExternalRewardKey(playerId, rewardId);

      expect(key1).toBe(key2);
    });

    it('generates different keys for different reward IDs', () => {
      const playerId = 'player-123';

      const key1 = generateExternalRewardKey(playerId, 'promo-xyz-2025');
      const key2 = generateExternalRewardKey(playerId, 'promo-abc-2025');

      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different players', () => {
      const rewardId = 'promo-xyz-2025';

      const key1 = generateExternalRewardKey('player-123', rewardId);
      const key2 = generateExternalRewardKey('player-456', rewardId);

      expect(key1).not.toBe(key2);
    });
  });
});
