/**
 * CasinoService Interface Tests
 *
 * Tests the service factory and interface contract.
 * Verifies delegation to crud functions and gaming day computation logic.
 *
 * @see services/casino/index.ts
 * @see SPEC-PRD-000-casino-foundation.md section 8.1
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import { createCasinoService, type CasinoServiceInterface } from '../index';

// Mock the crud module
jest.mock('../crud', () => ({
  listCasinos: jest.fn(),
  getCasinoById: jest.fn(),
  createCasino: jest.fn(),
  updateCasino: jest.fn(),
  deleteCasino: jest.fn(),
  getCasinoSettings: jest.fn(),
  updateCasinoSettings: jest.fn(),
  listStaff: jest.fn(),
  getStaffById: jest.fn(),
  createStaff: jest.fn(),
}));

import * as crud from '../crud';

// === Test Data ===

const mockCasino = {
  id: 'casino-uuid-1',
  name: 'Test Casino',
  location: 'Las Vegas',
  status: 'active',
  created_at: '2025-01-01T00:00:00Z',
};

const mockSettings = {
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

// === Mock Factory ===

function createMockSupabase(): SupabaseClient<Database> {
  return {
    from: jest.fn(),
    rpc: jest.fn(),
  } as unknown as SupabaseClient<Database>;
}

// === Tests ===

describe('CasinoService Factory', () => {
  let supabase: SupabaseClient<Database>;
  let service: CasinoServiceInterface;

  beforeEach(() => {
    jest.clearAllMocks();
    supabase = createMockSupabase();
    service = createCasinoService(supabase);
  });

  describe('factory creation', () => {
    it('creates service with all interface methods', () => {
      expect(service).toHaveProperty('list');
      expect(service).toHaveProperty('getById');
      expect(service).toHaveProperty('create');
      expect(service).toHaveProperty('update');
      expect(service).toHaveProperty('delete');
      expect(service).toHaveProperty('getSettings');
      expect(service).toHaveProperty('updateSettings');
      expect(service).toHaveProperty('listStaff');
      expect(service).toHaveProperty('getStaffById');
      expect(service).toHaveProperty('createStaff');
      expect(service).toHaveProperty('computeGamingDay');
    });

    it('returns object, not class instance', () => {
      expect(service.constructor).toBe(Object);
    });
  });

  describe('Casino CRUD delegation', () => {
    it('list() delegates to crud.listCasinos', async () => {
      const mockResult = { items: [mockCasino], cursor: null };
      (crud.listCasinos as jest.Mock).mockResolvedValue(mockResult);

      const filters = { status: 'active' as const };
      const result = await service.list(filters);

      expect(crud.listCasinos).toHaveBeenCalledWith(supabase, filters);
      expect(result).toEqual(mockResult);
    });

    it('getById() delegates to crud.getCasinoById', async () => {
      (crud.getCasinoById as jest.Mock).mockResolvedValue(mockCasino);

      const result = await service.getById('casino-uuid-1');

      expect(crud.getCasinoById).toHaveBeenCalledWith(
        supabase,
        'casino-uuid-1',
      );
      expect(result).toEqual(mockCasino);
    });

    it('create() delegates to crud.createCasino', async () => {
      (crud.createCasino as jest.Mock).mockResolvedValue(mockCasino);

      const input = { name: 'New Casino' };
      const result = await service.create(input);

      expect(crud.createCasino).toHaveBeenCalledWith(supabase, input);
      expect(result).toEqual(mockCasino);
    });

    it('update() delegates to crud.updateCasino', async () => {
      const updatedCasino = { ...mockCasino, name: 'Updated Casino' };
      (crud.updateCasino as jest.Mock).mockResolvedValue(updatedCasino);

      const input = { name: 'Updated Casino' };
      const result = await service.update('casino-uuid-1', input);

      expect(crud.updateCasino).toHaveBeenCalledWith(
        supabase,
        'casino-uuid-1',
        input,
      );
      expect(result).toEqual(updatedCasino);
    });

    it('delete() delegates to crud.deleteCasino', async () => {
      (crud.deleteCasino as jest.Mock).mockResolvedValue(undefined);

      await service.delete('casino-uuid-1');

      expect(crud.deleteCasino).toHaveBeenCalledWith(supabase, 'casino-uuid-1');
    });
  });

  describe('Casino Settings delegation', () => {
    it('getSettings() delegates to crud.getCasinoSettings', async () => {
      (crud.getCasinoSettings as jest.Mock).mockResolvedValue(mockSettings);

      const result = await service.getSettings('casino-uuid-1');

      expect(crud.getCasinoSettings).toHaveBeenCalledWith(
        supabase,
        'casino-uuid-1',
      );
      expect(result).toEqual(mockSettings);
    });

    it('updateSettings() delegates to crud.updateCasinoSettings', async () => {
      const updatedSettings = { ...mockSettings, watchlist_floor: 5000 };
      (crud.updateCasinoSettings as jest.Mock).mockResolvedValue(
        updatedSettings,
      );

      const input = { watchlist_floor: 5000 };
      const result = await service.updateSettings('casino-uuid-1', input);

      expect(crud.updateCasinoSettings).toHaveBeenCalledWith(
        supabase,
        'casino-uuid-1',
        input,
      );
      expect(result).toEqual(updatedSettings);
    });
  });

  describe('Staff management delegation', () => {
    it('listStaff() delegates to crud.listStaff', async () => {
      const mockResult = { items: [mockStaff], cursor: null };
      (crud.listStaff as jest.Mock).mockResolvedValue(mockResult);

      const filters = { role: 'dealer' as const };
      const result = await service.listStaff(filters);

      expect(crud.listStaff).toHaveBeenCalledWith(supabase, filters);
      expect(result).toEqual(mockResult);
    });

    it('getStaffById() delegates to crud.getStaffById', async () => {
      (crud.getStaffById as jest.Mock).mockResolvedValue(mockStaff);

      const result = await service.getStaffById('staff-uuid-1');

      expect(crud.getStaffById).toHaveBeenCalledWith(supabase, 'staff-uuid-1');
      expect(result).toEqual(mockStaff);
    });

    it('createStaff() delegates to crud.createStaff', async () => {
      (crud.createStaff as jest.Mock).mockResolvedValue(mockStaff);

      const input = {
        first_name: 'John',
        last_name: 'Doe',
        role: 'dealer' as const,
        casino_id: 'casino-uuid-1',
      };
      const result = await service.createStaff(input);

      expect(crud.createStaff).toHaveBeenCalledWith(supabase, input);
      expect(result).toEqual(mockStaff);
    });
  });

  describe('computeGamingDay', () => {
    beforeEach(() => {
      (crud.getCasinoSettings as jest.Mock).mockResolvedValue(mockSettings);
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: '2025-01-15',
        error: null,
      });
    });

    it('computes gaming day with timestamp', async () => {
      const result = await service.computeGamingDay(
        'casino-uuid-1',
        '2025-01-15T14:30:00Z',
      );

      expect(crud.getCasinoSettings).toHaveBeenCalledWith(
        supabase,
        'casino-uuid-1',
      );
      expect(supabase.rpc).toHaveBeenCalledWith('compute_gaming_day', {
        p_casino_id: 'casino-uuid-1',
        p_timestamp: '2025-01-15T14:30:00Z',
      });
      expect(result.gaming_day).toBe('2025-01-15');
      expect(result.casino_id).toBe('casino-uuid-1');
      expect(result.timezone).toBe('America/Los_Angeles');
      expect(result.computed_at).toBeDefined();
    });

    it('computes gaming day without timestamp (defaults to now)', async () => {
      await service.computeGamingDay('casino-uuid-1');

      expect(supabase.rpc).toHaveBeenCalledWith('compute_gaming_day', {
        p_casino_id: 'casino-uuid-1',
      });
    });

    it('throws CASINO_SETTINGS_NOT_FOUND when settings not found', async () => {
      (crud.getCasinoSettings as jest.Mock).mockResolvedValue(null);

      await expect(
        service.computeGamingDay('nonexistent'),
      ).rejects.toMatchObject({
        code: 'CASINO_SETTINGS_NOT_FOUND',
      });

      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('throws INTERNAL_ERROR on RPC failure', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { code: 'P0001', message: 'RPC failed' },
      });

      await expect(
        service.computeGamingDay('casino-uuid-1'),
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });

    it('includes computed_at timestamp in response', async () => {
      const before = new Date().toISOString();
      const result = await service.computeGamingDay('casino-uuid-1');
      const after = new Date().toISOString();

      expect(result.computed_at).toBeDefined();
      expect(result.computed_at >= before).toBe(true);
      expect(result.computed_at <= after).toBe(true);
    });
  });

  describe('error propagation', () => {
    it('propagates DomainError from crud functions', async () => {
      const error = new DomainError('CASINO_NOT_FOUND');
      (crud.getCasinoById as jest.Mock).mockRejectedValue(error);

      await expect(service.getById('nonexistent')).rejects.toThrow(DomainError);
      await expect(service.getById('nonexistent')).rejects.toMatchObject({
        code: 'CASINO_NOT_FOUND',
      });
    });

    it('propagates DomainError from update operations', async () => {
      const error = new DomainError('UNIQUE_VIOLATION');
      (crud.updateCasino as jest.Mock).mockRejectedValue(error);

      await expect(
        service.update('id', { name: 'Duplicate' }),
      ).rejects.toMatchObject({
        code: 'UNIQUE_VIOLATION',
      });
    });

    it('propagates DomainError from staff operations', async () => {
      const error = new DomainError('STAFF_ROLE_CONSTRAINT_VIOLATION');
      (crud.createStaff as jest.Mock).mockRejectedValue(error);

      await expect(
        service.createStaff({
          first_name: 'Test',
          last_name: 'User',
          role: 'dealer',
          casino_id: 'casino-uuid-1',
          user_id: 'should-not-have-this',
        }),
      ).rejects.toMatchObject({
        code: 'STAFF_ROLE_CONSTRAINT_VIOLATION',
      });
    });
  });
});

describe('Service Interface Contract', () => {
  let service: CasinoServiceInterface;

  beforeEach(() => {
    jest.clearAllMocks();
    const supabase = createMockSupabase();
    service = createCasinoService(supabase);

    // Setup default mocks for all crud functions
    (crud.listCasinos as jest.Mock).mockResolvedValue({
      items: [],
      cursor: null,
    });
    (crud.getCasinoById as jest.Mock).mockResolvedValue(null);
    (crud.createCasino as jest.Mock).mockResolvedValue(mockCasino);
    (crud.updateCasino as jest.Mock).mockResolvedValue(mockCasino);
    (crud.deleteCasino as jest.Mock).mockResolvedValue(undefined);
    (crud.getCasinoSettings as jest.Mock).mockResolvedValue(null);
    (crud.updateCasinoSettings as jest.Mock).mockResolvedValue(mockSettings);
    (crud.listStaff as jest.Mock).mockResolvedValue({
      items: [],
      cursor: null,
    });
    (crud.getStaffById as jest.Mock).mockResolvedValue(null);
    (crud.createStaff as jest.Mock).mockResolvedValue(mockStaff);
  });

  it('list returns Promise<{ items: CasinoDTO[], cursor: string | null }>', async () => {
    const result = await service.list();

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('cursor');
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('getById returns Promise<CasinoDTO | null>', async () => {
    const result = await service.getById('id');

    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('create returns Promise<CasinoDTO>', async () => {
    const result = await service.create({ name: 'Test' });

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('update returns Promise<CasinoDTO>', async () => {
    const result = await service.update('id', { name: 'Updated' });

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('delete returns Promise<void>', async () => {
    const result = await service.delete('id');

    expect(result).toBeUndefined();
  });

  it('listStaff returns Promise<{ items: StaffDTO[], cursor: string | null }>', async () => {
    const result = await service.listStaff();

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('cursor');
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('createStaff returns Promise<StaffDTO>', async () => {
    const result = await service.createStaff({
      first_name: 'John',
      last_name: 'Doe',
      role: 'dealer',
      casino_id: 'casino-uuid-1',
    });

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});
