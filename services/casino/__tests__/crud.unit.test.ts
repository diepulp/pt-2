/**
 * CasinoService CRUD Unit Tests
 *
 * Tests the CRUD operations with mocked Supabase client.
 * These tests verify business logic, error handling, and data transformations.
 *
 * @see services/casino/crud.ts
 * @see SPEC-PRD-000-casino-foundation.md section 8.1
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import {
  listCasinos,
  getCasinoById,
  createCasino,
  updateCasino,
  deleteCasino,
  getCasinoSettings,
  updateCasinoSettings,
  listStaff,
  getStaffById,
  createStaff,
} from '../crud';

// === Mock Factory ===

type MockQueryBuilder = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  lt: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
};

function createMockQueryBuilder(
  resolvedData: unknown = null,
  error: unknown = null,
): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: resolvedData, error }),
    maybeSingle: jest.fn().mockResolvedValue({ data: resolvedData, error }),
  };

  // Chain returns for list queries (no single/maybeSingle)
  builder.limit.mockImplementation(() => ({
    ...builder,
    then: (resolve: (value: { data: unknown; error: unknown }) => void) =>
      resolve({ data: resolvedData, error }),
  }));

  return builder;
}

function createMockSupabase(
  queryBuilder: MockQueryBuilder,
): SupabaseClient<Database> {
  return {
    from: jest.fn().mockReturnValue(queryBuilder),
    rpc: jest.fn(),
  } as unknown as SupabaseClient<Database>;
}

// === Test Data ===

const mockCasino = {
  id: 'casino-uuid-1',
  name: 'Test Casino',
  location: 'Las Vegas',
  status: 'active',
  created_at: '2025-01-01T00:00:00Z',
};

const mockCasinoSettings = {
  id: 'settings-uuid-1',
  casino_id: 'casino-uuid-1',
  gaming_day_start_time: '06:00:00',
  timezone: 'America/Los_Angeles',
  watchlist_floor: 3000,
  ctr_threshold: 10000,
};

const mockStaff = {
  id: 'staff-uuid-1',
  first_name: 'John',
  last_name: 'Doe',
  role: 'dealer',
  status: 'active',
  employee_id: 'EMP001',
  casino_id: 'casino-uuid-1',
};

// === Casino CRUD Tests ===

describe('Casino CRUD Operations', () => {
  describe('listCasinos', () => {
    it('returns paginated list with default limit', async () => {
      const casinos = [mockCasino, { ...mockCasino, id: 'casino-uuid-2' }];
      const queryBuilder = createMockQueryBuilder(casinos);
      const supabase = createMockSupabase(queryBuilder);

      const result = await listCasinos(supabase);

      expect(supabase.from).toHaveBeenCalledWith('casino');
      expect(queryBuilder.select).toHaveBeenCalled();
      expect(queryBuilder.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
      expect(queryBuilder.limit).toHaveBeenCalledWith(21); // 20 + 1 for hasMore check
      expect(result.items).toHaveLength(2);
      expect(result.cursor).toBeNull();
    });

    it('applies status filter when provided', async () => {
      const queryBuilder = createMockQueryBuilder([mockCasino]);
      const supabase = createMockSupabase(queryBuilder);

      await listCasinos(supabase, { status: 'active' });

      expect(queryBuilder.eq).toHaveBeenCalledWith('status', 'active');
    });

    it('applies cursor for pagination', async () => {
      const queryBuilder = createMockQueryBuilder([mockCasino]);
      const supabase = createMockSupabase(queryBuilder);

      await listCasinos(supabase, { cursor: '2025-01-01T00:00:00Z' });

      expect(queryBuilder.lt).toHaveBeenCalledWith(
        'created_at',
        '2025-01-01T00:00:00Z',
      );
    });

    it('returns cursor when more items exist', async () => {
      // Return 21 items (more than limit of 20)
      const casinos = Array(21)
        .fill(null)
        .map((_, i) => ({
          ...mockCasino,
          id: `casino-${i}`,
          created_at: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        }));
      const queryBuilder = createMockQueryBuilder(casinos);
      const supabase = createMockSupabase(queryBuilder);

      const result = await listCasinos(supabase);

      expect(result.items).toHaveLength(20);
      expect(result.cursor).toBe('2025-01-20T00:00:00Z');
    });

    it('throws DomainError on database error', async () => {
      const queryBuilder = createMockQueryBuilder(null, {
        code: '42P01',
        message: 'Table not found',
      });
      const supabase = createMockSupabase(queryBuilder);

      await expect(listCasinos(supabase)).rejects.toThrow(DomainError);
      await expect(listCasinos(supabase)).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });
  });

  describe('getCasinoById', () => {
    it('returns casino when found', async () => {
      const queryBuilder = createMockQueryBuilder(mockCasino);
      const supabase = createMockSupabase(queryBuilder);

      const result = await getCasinoById(supabase, 'casino-uuid-1');

      expect(supabase.from).toHaveBeenCalledWith('casino');
      expect(queryBuilder.eq).toHaveBeenCalledWith('id', 'casino-uuid-1');
      expect(queryBuilder.maybeSingle).toHaveBeenCalled();
      expect(result).toEqual(mockCasino);
    });

    it('returns null when not found', async () => {
      const queryBuilder = createMockQueryBuilder(null);
      const supabase = createMockSupabase(queryBuilder);

      const result = await getCasinoById(supabase, 'nonexistent');

      expect(result).toBeNull();
    });

    it('throws DomainError on database error', async () => {
      const queryBuilder = createMockQueryBuilder(null, {
        code: 'PGRST000',
        message: 'Connection error',
      });
      const supabase = createMockSupabase(queryBuilder);

      await expect(getCasinoById(supabase, 'casino-uuid-1')).rejects.toThrow(
        DomainError,
      );
    });
  });

  describe('createCasino', () => {
    it('creates casino with required fields', async () => {
      const queryBuilder = createMockQueryBuilder(mockCasino);
      const supabase = createMockSupabase(queryBuilder);

      const result = await createCasino(supabase, { name: 'Test Casino' });

      expect(supabase.from).toHaveBeenCalledWith('casino');
      expect(queryBuilder.insert).toHaveBeenCalledWith({
        name: 'Test Casino',
        location: null,
        address: null,
        company_id: null,
      });
      expect(queryBuilder.single).toHaveBeenCalled();
      expect(result).toEqual(mockCasino);
    });

    it('creates casino with all optional fields', async () => {
      const queryBuilder = createMockQueryBuilder(mockCasino);
      const supabase = createMockSupabase(queryBuilder);

      await createCasino(supabase, {
        name: 'Test Casino',
        location: 'Las Vegas',
        address: { street: '123 Main' },
        company_id: 'company-uuid',
      });

      expect(queryBuilder.insert).toHaveBeenCalledWith({
        name: 'Test Casino',
        location: 'Las Vegas',
        address: { street: '123 Main' },
        company_id: 'company-uuid',
      });
    });

    it('throws UNIQUE_VIOLATION on duplicate', async () => {
      const queryBuilder = createMockQueryBuilder(null, {
        code: '23505',
        message: 'duplicate key',
      });
      const supabase = createMockSupabase(queryBuilder);

      await expect(
        createCasino(supabase, { name: 'Duplicate' }),
      ).rejects.toMatchObject({
        code: 'UNIQUE_VIOLATION',
      });
    });
  });

  describe('updateCasino', () => {
    it('updates casino with partial data', async () => {
      const queryBuilder = createMockQueryBuilder({
        ...mockCasino,
        name: 'Updated Casino',
      });
      const supabase = createMockSupabase(queryBuilder);

      const result = await updateCasino(supabase, 'casino-uuid-1', {
        name: 'Updated Casino',
      });

      expect(queryBuilder.update).toHaveBeenCalledWith({
        name: 'Updated Casino',
      });
      expect(queryBuilder.eq).toHaveBeenCalledWith('id', 'casino-uuid-1');
      expect(result.name).toBe('Updated Casino');
    });

    it('throws CASINO_NOT_FOUND when not found', async () => {
      const queryBuilder = createMockQueryBuilder(null, {
        code: 'PGRST116',
        message: 'No rows returned',
      });
      const supabase = createMockSupabase(queryBuilder);

      await expect(
        updateCasino(supabase, 'nonexistent', { name: 'X' }),
      ).rejects.toMatchObject({
        code: 'CASINO_NOT_FOUND',
      });
    });
  });

  describe('deleteCasino', () => {
    it('soft deletes casino by setting status to inactive', async () => {
      const queryBuilder = createMockQueryBuilder();
      // Override for delete (no single/maybeSingle)
      queryBuilder.eq.mockResolvedValue({ data: null, error: null });
      const supabase = createMockSupabase(queryBuilder);

      await deleteCasino(supabase, 'casino-uuid-1');

      expect(queryBuilder.update).toHaveBeenCalledWith({ status: 'inactive' });
      expect(queryBuilder.eq).toHaveBeenCalledWith('id', 'casino-uuid-1');
    });

    it('throws CASINO_NOT_FOUND when not found', async () => {
      const queryBuilder = createMockQueryBuilder();
      queryBuilder.eq.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows' },
      });
      const supabase = createMockSupabase(queryBuilder);

      await expect(deleteCasino(supabase, 'nonexistent')).rejects.toMatchObject(
        {
          code: 'CASINO_NOT_FOUND',
        },
      );
    });
  });
});

// === Casino Settings Tests ===

describe('Casino Settings CRUD', () => {
  describe('getCasinoSettings', () => {
    it('returns settings when found', async () => {
      const queryBuilder = createMockQueryBuilder(mockCasinoSettings);
      const supabase = createMockSupabase(queryBuilder);

      const result = await getCasinoSettings(supabase, 'casino-uuid-1');

      expect(supabase.from).toHaveBeenCalledWith('casino_settings');
      expect(queryBuilder.eq).toHaveBeenCalledWith(
        'casino_id',
        'casino-uuid-1',
      );
      expect(result).toEqual(mockCasinoSettings);
    });

    it('returns null when not found', async () => {
      const queryBuilder = createMockQueryBuilder(null);
      const supabase = createMockSupabase(queryBuilder);

      const result = await getCasinoSettings(supabase, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateCasinoSettings', () => {
    it('updates settings with partial data', async () => {
      const updatedSettings = { ...mockCasinoSettings, watchlist_floor: 5000 };
      const queryBuilder = createMockQueryBuilder(updatedSettings);
      const supabase = createMockSupabase(queryBuilder);

      const result = await updateCasinoSettings(supabase, 'casino-uuid-1', {
        watchlist_floor: 5000,
      });

      expect(queryBuilder.update).toHaveBeenCalledWith({
        watchlist_floor: 5000,
      });
      expect(result.watchlist_floor).toBe(5000);
    });

    it('throws CASINO_SETTINGS_NOT_FOUND when not found', async () => {
      const queryBuilder = createMockQueryBuilder(null, {
        code: 'PGRST116',
        message: 'No rows',
      });
      const supabase = createMockSupabase(queryBuilder);

      await expect(
        updateCasinoSettings(supabase, 'nonexistent', {
          watchlist_floor: 5000,
        }),
      ).rejects.toMatchObject({
        code: 'CASINO_SETTINGS_NOT_FOUND',
      });
    });
  });
});

// === Staff CRUD Tests ===

describe('Staff CRUD Operations', () => {
  describe('listStaff', () => {
    it('returns paginated staff list', async () => {
      const staff = [mockStaff];
      const queryBuilder = createMockQueryBuilder(staff);
      const supabase = createMockSupabase(queryBuilder);

      const result = await listStaff(supabase);

      expect(supabase.from).toHaveBeenCalledWith('staff');
      expect(result.items).toHaveLength(1);
    });

    it('applies role filter', async () => {
      const queryBuilder = createMockQueryBuilder([mockStaff]);
      const supabase = createMockSupabase(queryBuilder);

      await listStaff(supabase, { role: 'dealer' });

      expect(queryBuilder.eq).toHaveBeenCalledWith('role', 'dealer');
    });

    it('applies status filter', async () => {
      const queryBuilder = createMockQueryBuilder([mockStaff]);
      const supabase = createMockSupabase(queryBuilder);

      await listStaff(supabase, { status: 'active' });

      expect(queryBuilder.eq).toHaveBeenCalledWith('status', 'active');
    });
  });

  describe('getStaffById', () => {
    it('returns staff when found', async () => {
      const queryBuilder = createMockQueryBuilder(mockStaff);
      const supabase = createMockSupabase(queryBuilder);

      const result = await getStaffById(supabase, 'staff-uuid-1');

      expect(result).toEqual(mockStaff);
    });

    it('returns null when not found', async () => {
      const queryBuilder = createMockQueryBuilder(null);
      const supabase = createMockSupabase(queryBuilder);

      const result = await getStaffById(supabase, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('createStaff', () => {
    it('creates dealer without user_id', async () => {
      const queryBuilder = createMockQueryBuilder(mockStaff);
      const supabase = createMockSupabase(queryBuilder);

      const result = await createStaff(supabase, {
        first_name: 'John',
        last_name: 'Doe',
        role: 'dealer',
        casino_id: 'casino-uuid-1',
      });

      expect(queryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'John',
          last_name: 'Doe',
          role: 'dealer',
          user_id: null,
        }),
      );
      expect(result).toEqual(mockStaff);
    });

    it('throws STAFF_ROLE_CONSTRAINT_VIOLATION for dealer with user_id', async () => {
      const queryBuilder = createMockQueryBuilder(mockStaff);
      const supabase = createMockSupabase(queryBuilder);

      await expect(
        createStaff(supabase, {
          first_name: 'John',
          last_name: 'Doe',
          role: 'dealer',
          casino_id: 'casino-uuid-1',
          user_id: 'user-uuid', // Dealers cannot have user_id
        }),
      ).rejects.toMatchObject({
        code: 'STAFF_ROLE_CONSTRAINT_VIOLATION',
      });
    });

    it('throws STAFF_ROLE_CONSTRAINT_VIOLATION for pit_boss without user_id', async () => {
      const queryBuilder = createMockQueryBuilder(mockStaff);
      const supabase = createMockSupabase(queryBuilder);

      await expect(
        createStaff(supabase, {
          first_name: 'Jane',
          last_name: 'Smith',
          role: 'pit_boss',
          casino_id: 'casino-uuid-1',
          // Missing user_id - pit_boss must have user_id
        }),
      ).rejects.toMatchObject({
        code: 'STAFF_ROLE_CONSTRAINT_VIOLATION',
      });
    });

    it('throws STAFF_ROLE_CONSTRAINT_VIOLATION for admin without user_id', async () => {
      const queryBuilder = createMockQueryBuilder(mockStaff);
      const supabase = createMockSupabase(queryBuilder);

      await expect(
        createStaff(supabase, {
          first_name: 'Admin',
          last_name: 'User',
          role: 'admin',
          casino_id: 'casino-uuid-1',
          // Missing user_id - admin must have user_id
        }),
      ).rejects.toMatchObject({
        code: 'STAFF_ROLE_CONSTRAINT_VIOLATION',
      });
    });

    it('creates pit_boss with user_id', async () => {
      const pitBoss = { ...mockStaff, role: 'pit_boss', user_id: 'user-uuid' };
      const queryBuilder = createMockQueryBuilder(pitBoss);
      const supabase = createMockSupabase(queryBuilder);

      const result = await createStaff(supabase, {
        first_name: 'Jane',
        last_name: 'Smith',
        role: 'pit_boss',
        casino_id: 'casino-uuid-1',
        user_id: 'user-uuid',
      });

      expect(queryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'pit_boss',
          user_id: 'user-uuid',
        }),
      );
      expect(result.role).toBe('pit_boss');
    });

    it('throws STAFF_ALREADY_EXISTS on duplicate', async () => {
      const queryBuilder = createMockQueryBuilder(null, {
        code: '23505',
        message: 'duplicate key',
      });
      const supabase = createMockSupabase(queryBuilder);

      await expect(
        createStaff(supabase, {
          first_name: 'John',
          last_name: 'Doe',
          role: 'dealer',
          casino_id: 'casino-uuid-1',
        }),
      ).rejects.toMatchObject({
        code: 'STAFF_ALREADY_EXISTS',
      });
    });

    it('throws CASINO_NOT_FOUND on foreign key violation', async () => {
      const queryBuilder = createMockQueryBuilder(null, {
        code: '23503',
        message: 'foreign key violation',
      });
      const supabase = createMockSupabase(queryBuilder);

      await expect(
        createStaff(supabase, {
          first_name: 'John',
          last_name: 'Doe',
          role: 'dealer',
          casino_id: 'nonexistent-casino',
        }),
      ).rejects.toMatchObject({
        code: 'CASINO_NOT_FOUND',
      });
    });
  });
});
