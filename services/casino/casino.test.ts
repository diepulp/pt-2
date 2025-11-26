/**
 * Casino Service Unit Tests
 *
 * Tests the casino server actions by mocking the Supabase client.
 * These are unit tests that verify the action logic without hitting the database.
 */

// Mock Next.js cache functions
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  getCasinos,
  getCasinoById,
  createCasino,
  updateCasino,
  deleteCasino,
  getStaffByCasino,
  getCasinoSettings,
  computeGamingDay,
} from '@/app/actions/casino';

// Helper to create a chainable mock query builder
// The key insight: ALL methods must return `builder` for chaining
// Only `limit` (when awaited) returns the final result via a special property
function createMockQueryBuilder(finalResult: { data: unknown; error: unknown }) {
  const builder: Record<string, jest.Mock> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'lt', 'order', 'limit', 'single'];

  // Make builder thenable so it can be awaited after limit()
  const thenable = {
    then: (resolve: (val: unknown) => void) => {
      resolve(finalResult);
      return thenable;
    },
  };

  methods.forEach(method => {
    builder[method] = jest.fn().mockImplementation(() => {
      // single() is always terminal and returns promise
      if (method === 'single') {
        return Promise.resolve(finalResult);
      }
      // limit() returns a thenable builder for both chaining and awaiting
      if (method === 'limit') {
        return { ...builder, ...thenable };
      }
      // All other methods return builder for chaining
      return builder;
    });
  });

  return builder;
}

describe('Casino Server Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCasinos', () => {
    it('fetches casinos with default options', async () => {
      const mockCasinos = [
        { id: '1', name: 'Casino A', location: 'Vegas', status: 'active', created_at: '2025-01-01' },
        { id: '2', name: 'Casino B', location: 'Reno', status: 'active', created_at: '2025-01-02' },
      ];

      const mockBuilder = createMockQueryBuilder({ data: mockCasinos, error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await getCasinos();

      expect(mockSupabase.from).toHaveBeenCalledWith('casino');
      expect(mockBuilder.select).toHaveBeenCalledWith('id, name, location, address, status, company_id, created_at');
      expect(mockBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockBuilder.limit).toHaveBeenCalledWith(51); // 50 + 1 for pagination check
      expect(result.casinos).toHaveLength(2);
    });

    it('filters by status when provided', async () => {
      const mockBuilder = createMockQueryBuilder({ data: [], error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      await getCasinos({ status: 'active' });

      expect(mockBuilder.eq).toHaveBeenCalledWith('status', 'active');
    });

    it('uses cursor for pagination', async () => {
      const mockBuilder = createMockQueryBuilder({ data: [], error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      await getCasinos({ cursor: '2025-01-15T00:00:00Z' });

      expect(mockBuilder.lt).toHaveBeenCalledWith('created_at', '2025-01-15T00:00:00Z');
    });

    it('returns nextCursor when more results exist', async () => {
      const mockCasinos = Array(51).fill(null).map((_, i) => ({
        id: `${i}`,
        name: `Casino ${i}`,
        created_at: `2025-01-${String(i + 1).padStart(2, '0')}`,
      }));

      const mockBuilder = createMockQueryBuilder({ data: mockCasinos, error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await getCasinos({ limit: 50 });

      expect(result.casinos).toHaveLength(50);
      expect(result.nextCursor).toBeDefined();
    });

    it('throws error when Supabase returns error', async () => {
      const mockBuilder = createMockQueryBuilder({ data: null, error: { message: 'Database error' } });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      await expect(getCasinos()).rejects.toThrow('Failed to fetch casinos: Database error');
    });
  });

  describe('getCasinoById', () => {
    it('fetches a single casino by ID', async () => {
      const mockCasino = { id: '1', name: 'Test Casino', location: 'Vegas' };
      const mockBuilder = createMockQueryBuilder({ data: mockCasino, error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await getCasinoById('1');

      expect(mockSupabase.from).toHaveBeenCalledWith('casino');
      expect(mockBuilder.eq).toHaveBeenCalledWith('id', '1');
      expect(mockBuilder.single).toHaveBeenCalled();
      expect(result).toEqual(mockCasino);
    });

    it('returns null when casino not found (PGRST116)', async () => {
      const mockBuilder = createMockQueryBuilder({ data: null, error: { code: 'PGRST116', message: 'Not found' } });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await getCasinoById('nonexistent');

      expect(result).toBeNull();
    });

    it('throws error for other database errors', async () => {
      const mockBuilder = createMockQueryBuilder({ data: null, error: { code: 'OTHER', message: 'DB error' } });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      await expect(getCasinoById('1')).rejects.toThrow('Failed to fetch casino: DB error');
    });
  });

  describe('createCasino', () => {
    it('creates a new casino and revalidates path', async () => {
      const newCasino = { id: 'new-1', name: 'New Casino', location: 'Atlantic City', status: 'active' };
      const mockBuilder = createMockQueryBuilder({ data: newCasino, error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await createCasino({
        name: 'New Casino',
        location: 'Atlantic City',
        company_id: 'company-1',
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('casino');
      expect(mockBuilder.insert).toHaveBeenCalledWith({
        name: 'New Casino',
        location: 'Atlantic City',
        address: undefined,
        company_id: 'company-1',
        status: 'active',
      });
      expect(mockBuilder.select).toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith('/casinos');
      expect(result).toEqual(newCasino);
    });

    it('uses provided status when specified', async () => {
      const mockBuilder = createMockQueryBuilder({ data: { id: '1' }, error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      await createCasino({
        name: 'Test',
        location: 'Test',
        company_id: 'c1',
        status: 'inactive',
      });

      expect(mockBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'inactive' })
      );
    });

    it('throws error when insert fails', async () => {
      const mockBuilder = createMockQueryBuilder({ data: null, error: { message: 'Insert failed' } });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      await expect(createCasino({ name: 'Test', location: 'Test', company_id: 'c1' }))
        .rejects.toThrow('Failed to create casino: Insert failed');
    });
  });

  describe('updateCasino', () => {
    it('updates casino and revalidates paths', async () => {
      const updatedCasino = { id: '1', name: 'Updated Casino', location: 'Vegas' };
      const mockBuilder = createMockQueryBuilder({ data: updatedCasino, error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await updateCasino('1', { name: 'Updated Casino' });

      expect(mockSupabase.from).toHaveBeenCalledWith('casino');
      expect(mockBuilder.update).toHaveBeenCalledWith({ name: 'Updated Casino' });
      expect(mockBuilder.eq).toHaveBeenCalledWith('id', '1');
      expect(revalidatePath).toHaveBeenCalledWith('/casinos');
      expect(revalidatePath).toHaveBeenCalledWith('/casinos/1');
      expect(result).toEqual(updatedCasino);
    });

    it('throws error when update fails', async () => {
      const mockBuilder = createMockQueryBuilder({ data: null, error: { message: 'Update failed' } });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      await expect(updateCasino('1', { name: 'Test' }))
        .rejects.toThrow('Failed to update casino: Update failed');
    });
  });

  describe('deleteCasino', () => {
    it('deletes casino and revalidates path', async () => {
      const mockBuilder = createMockQueryBuilder({ data: null, error: null });
      // Override eq to return the result directly for delete
      mockBuilder.eq = jest.fn().mockResolvedValue({ error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      await deleteCasino('1');

      expect(mockSupabase.from).toHaveBeenCalledWith('casino');
      expect(mockBuilder.delete).toHaveBeenCalled();
      expect(mockBuilder.eq).toHaveBeenCalledWith('id', '1');
      expect(revalidatePath).toHaveBeenCalledWith('/casinos');
    });

    it('throws error when delete fails', async () => {
      const mockBuilder = createMockQueryBuilder({ data: null, error: null });
      mockBuilder.eq = jest.fn().mockResolvedValue({ error: { message: 'Delete failed' } });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      await expect(deleteCasino('1')).rejects.toThrow('Failed to delete casino: Delete failed');
    });
  });

  describe('getStaffByCasino', () => {
    it('fetches active staff for a casino', async () => {
      const mockStaff = [
        { id: 's1', first_name: 'John', last_name: 'Doe', role: 'dealer', status: 'active' },
        { id: 's2', first_name: 'Jane', last_name: 'Smith', role: 'manager', status: 'active' },
      ];
      const mockBuilder = createMockQueryBuilder({ data: mockStaff, error: null });
      // Override eq to return builder for chaining, final eq returns result
      let eqCallCount = 0;
      mockBuilder.eq = jest.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount === 2) {
          return Promise.resolve({ data: mockStaff, error: null });
        }
        return mockBuilder;
      });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await getStaffByCasino('casino-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('staff');
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no staff found', async () => {
      const mockBuilder = createMockQueryBuilder({ data: null, error: null });
      let eqCallCount = 0;
      mockBuilder.eq = jest.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount === 2) {
          return Promise.resolve({ data: null, error: null });
        }
        return mockBuilder;
      });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await getStaffByCasino('casino-1');

      expect(result).toEqual([]);
    });
  });

  describe('getCasinoSettings', () => {
    it('fetches casino settings', async () => {
      const mockSettings = {
        id: 'settings-1',
        casino_id: 'casino-1',
        gaming_day_start_time: '06:00',
        timezone: 'America/Los_Angeles',
      };
      const mockBuilder = createMockQueryBuilder({ data: mockSettings, error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await getCasinoSettings('casino-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('casino_settings');
      expect(mockBuilder.eq).toHaveBeenCalledWith('casino_id', 'casino-1');
      expect(result).toEqual(mockSettings);
    });

    it('returns null when settings not found', async () => {
      const mockBuilder = createMockQueryBuilder({ data: null, error: { code: 'PGRST116' } });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await getCasinoSettings('casino-1');

      expect(result).toBeNull();
    });
  });

  describe('computeGamingDay', () => {
    it('computes gaming day based on casino settings', async () => {
      const mockSettings = {
        gaming_day_start_time: '06:00',
        timezone: 'America/Los_Angeles',
      };
      const mockBuilder = createMockQueryBuilder({ data: mockSettings, error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      // Test at 10:00 AM Pacific on Jan 15 - should return Jan 15
      const testDate = new Date('2025-01-15T18:00:00Z'); // 10 AM Pacific
      const result = await computeGamingDay('casino-1', testDate);

      expect(result).toBe('2025-01-15');
    });

    it('returns previous day when before gaming day start', async () => {
      const mockSettings = {
        gaming_day_start_time: '06:00',
        timezone: 'America/Los_Angeles',
      };
      const mockBuilder = createMockQueryBuilder({ data: mockSettings, error: null });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      // Test at 2:00 AM Pacific on Jan 15 - should return Jan 14
      const testDate = new Date('2025-01-15T10:00:00Z'); // 2 AM Pacific
      const result = await computeGamingDay('casino-1', testDate);

      expect(result).toBe('2025-01-14');
    });

    it('throws error when settings not found', async () => {
      const mockBuilder = createMockQueryBuilder({ data: null, error: { code: 'PGRST116' } });
      const mockSupabase = { from: jest.fn().mockReturnValue(mockBuilder) };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);

      await expect(computeGamingDay('casino-1'))
        .rejects.toThrow('Casino settings not found for casino casino-1');
    });
  });
});
