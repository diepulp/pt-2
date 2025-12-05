/**
 * CasinoService Query Key Factory Tests
 *
 * Tests the React Query key factories for proper serialization,
 * stability, and .scope pattern implementation.
 *
 * @see services/casino/keys.ts
 * @see ADR-003-state-management-strategy.md
 */

import { casinoKeys } from '../keys';

describe('Casino Query Key Factories', () => {
  describe('root key', () => {
    it('returns stable root array', () => {
      expect(casinoKeys.root).toEqual(['casino']);
    });

    it('returns same reference on multiple accesses', () => {
      expect(casinoKeys.root).toBe(casinoKeys.root);
    });
  });

  describe('list keys', () => {
    it('returns key with serialized empty filters', () => {
      const key = casinoKeys.list();
      expect(key[0]).toBe('casino');
      expect(key[1]).toBe('list');
      expect(key[2]).toBe('[]'); // Empty filters serialize to []
    });

    it('serializes status filter', () => {
      const key = casinoKeys.list({ status: 'active' });
      expect(key[2]).toBe('[["status","active"]]');
    });

    it('serializes multiple filters in sorted order', () => {
      const key1 = casinoKeys.list({ status: 'active', cursor: 'abc', limit: 10 });
      const key2 = casinoKeys.list({ limit: 10, cursor: 'abc', status: 'active' });

      // Should produce same key regardless of object property order
      expect(key1[2]).toBe(key2[2]);
      // Keys should be alphabetically sorted
      expect(key1[2]).toBe('[["cursor","abc"],["limit",10],["status","active"]]');
    });

    it('omits undefined values from serialization', () => {
      const key = casinoKeys.list({ status: 'active', cursor: undefined });
      expect(key[2]).toBe('[["status","active"]]');
    });

    it('has .scope for surgical invalidation', () => {
      expect(casinoKeys.list.scope).toEqual(['casino', 'list']);
    });

    it('list keys start with scope prefix', () => {
      const listKey = casinoKeys.list({ status: 'active' });
      const scope = casinoKeys.list.scope;

      expect(listKey[0]).toBe(scope[0]);
      expect(listKey[1]).toBe(scope[1]);
    });
  });

  describe('detail keys', () => {
    it('returns key with casino ID', () => {
      const key = casinoKeys.detail('casino-uuid-123');
      expect(key).toEqual(['casino', 'detail', 'casino-uuid-123']);
    });

    it('produces different keys for different IDs', () => {
      const key1 = casinoKeys.detail('casino-1');
      const key2 = casinoKeys.detail('casino-2');

      expect(key1).not.toEqual(key2);
      expect(key1[2]).toBe('casino-1');
      expect(key2[2]).toBe('casino-2');
    });
  });

  describe('settings keys', () => {
    it('returns key without casinoId (RLS-scoped)', () => {
      const key = casinoKeys.settings();
      expect(key).toEqual(['casino', 'settings']);
    });

    it('returns same value on multiple calls', () => {
      const key1 = casinoKeys.settings();
      const key2 = casinoKeys.settings();

      // Note: Readonly arrays may not be reference-equal but should be value-equal
      expect(key1).toEqual(key2);
    });
  });

  describe('staff keys', () => {
    it('returns key with serialized empty filters', () => {
      const key = casinoKeys.staff();
      expect(key[0]).toBe('casino');
      expect(key[1]).toBe('staff');
      expect(key[2]).toBe('[]');
    });

    it('serializes role filter', () => {
      const key = casinoKeys.staff({ role: 'dealer' });
      expect(key[2]).toBe('[["role","dealer"]]');
    });

    it('serializes status filter', () => {
      const key = casinoKeys.staff({ status: 'active' });
      expect(key[2]).toBe('[["status","active"]]');
    });

    it('serializes multiple filters in sorted order', () => {
      const key = casinoKeys.staff({
        role: 'pit_boss',
        status: 'active',
        limit: 50,
      });
      expect(key[2]).toBe('[["limit",50],["role","pit_boss"],["status","active"]]');
    });

    it('has .scope for surgical invalidation', () => {
      expect(casinoKeys.staff.scope).toEqual(['casino', 'staff']);
    });

    it('staff keys start with scope prefix', () => {
      const staffKey = casinoKeys.staff({ role: 'dealer' });
      const scope = casinoKeys.staff.scope;

      expect(staffKey[0]).toBe(scope[0]);
      expect(staffKey[1]).toBe(scope[1]);
    });
  });

  describe('gamingDay keys', () => {
    it('returns key with "now" when no timestamp provided', () => {
      const key = casinoKeys.gamingDay();
      expect(key).toEqual(['casino', 'gaming-day', 'now']);
    });

    it('returns key with timestamp when provided', () => {
      const timestamp = '2025-01-15T14:30:00Z';
      const key = casinoKeys.gamingDay(timestamp);
      expect(key).toEqual(['casino', 'gaming-day', timestamp]);
    });

    it('produces different keys for different timestamps', () => {
      const key1 = casinoKeys.gamingDay('2025-01-15T00:00:00Z');
      const key2 = casinoKeys.gamingDay('2025-01-16T00:00:00Z');

      expect(key1).not.toEqual(key2);
    });
  });

  describe('key stability (cache hits)', () => {
    it('produces identical keys for identical filter objects', () => {
      const filters = { status: 'active' as const, limit: 20 };
      const key1 = casinoKeys.list(filters);
      const key2 = casinoKeys.list(filters);

      expect(key1[2]).toBe(key2[2]);
    });

    it('produces identical keys for equivalent filter objects', () => {
      const key1 = casinoKeys.list({ status: 'active', limit: 20 });
      const key2 = casinoKeys.list({ limit: 20, status: 'active' });

      expect(key1[2]).toBe(key2[2]);
    });

    it('handles null values in filters', () => {
      // Null values should be included, undefined should be omitted
      const keyWithNull = casinoKeys.list({
        status: 'active',
        cursor: null as unknown as string,
      });
      expect(keyWithNull[2]).toContain('cursor');
    });
  });

  describe('type safety', () => {
    it('returns readonly arrays', () => {
      const root = casinoKeys.root;
      const list = casinoKeys.list();
      const detail = casinoKeys.detail('id');
      const settings = casinoKeys.settings();
      const staff = casinoKeys.staff();
      const gamingDay = casinoKeys.gamingDay();

      // These should be readonly - TypeScript enforces this at compile time
      // Runtime check that arrays are defined
      expect(Array.isArray(root)).toBe(true);
      expect(Array.isArray(list)).toBe(true);
      expect(Array.isArray(detail)).toBe(true);
      expect(Array.isArray(settings)).toBe(true);
      expect(Array.isArray(staff)).toBe(true);
      expect(Array.isArray(gamingDay)).toBe(true);
    });
  });
});

describe('Key Prefix Relationships', () => {
  it('all keys share casino root prefix', () => {
    const keys = [
      casinoKeys.root,
      casinoKeys.list(),
      casinoKeys.detail('id'),
      casinoKeys.settings(),
      casinoKeys.staff(),
      casinoKeys.gamingDay(),
    ];

    keys.forEach((key) => {
      expect(key[0]).toBe('casino');
    });
  });

  it('invalidating root would affect all keys', () => {
    // This tests the hierarchical invalidation pattern
    const root = casinoKeys.root;
    const allKeys = [
      casinoKeys.list(),
      casinoKeys.detail('id'),
      casinoKeys.settings(),
      casinoKeys.staff(),
      casinoKeys.gamingDay(),
    ];

    allKeys.forEach((key) => {
      expect(key.slice(0, root.length)).toEqual(root);
    });
  });

  it('list.scope matches list key prefix', () => {
    const listKey = casinoKeys.list({ status: 'active' });
    const scope = casinoKeys.list.scope;

    // List key should start with scope
    expect(listKey.slice(0, scope.length)).toEqual(scope);
  });

  it('staff.scope matches staff key prefix', () => {
    const staffKey = casinoKeys.staff({ role: 'dealer' });
    const scope = casinoKeys.staff.scope;

    // Staff key should start with scope
    expect(staffKey.slice(0, scope.length)).toEqual(scope);
  });
});
