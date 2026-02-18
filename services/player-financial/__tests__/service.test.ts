/**
 * PlayerFinancialService Interface Tests
 *
 * Tests the service factory and interface contract.
 * Verifies delegation to crud functions.
 *
 * @see services/player-financial/index.ts
 * @see PRD-009 Player Financial Service
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

// Mock the crud module - must be before imports that use it
jest.mock('../crud', () => ({
  createTransaction: jest.fn(),
  getById: jest.fn(),
  getByIdempotencyKey: jest.fn(),
  list: jest.fn(),
  getVisitSummary: jest.fn(),
}));

import * as crud from '../crud';
import type { PlayerFinancialService } from '../index';
import { createPlayerFinancialService } from '../index';

// === Test Data ===

const mockTransaction = {
  id: 'txn-uuid-1',
  casino_id: 'casino-uuid-1',
  player_id: 'player-uuid-1',
  visit_id: 'visit-uuid-1',
  rating_slip_id: null,
  amount: 500,
  direction: 'in' as const,
  source: 'pit' as const,
  tender_type: 'cash',
  created_by_staff_id: 'staff-uuid-1',
  related_transaction_id: null,
  created_at: '2025-01-15T10:00:00Z',
  gaming_day: '2025-01-15',
  idempotency_key: 'idem-123',
};

const mockTransactionOut = {
  ...mockTransaction,
  id: 'txn-uuid-2',
  direction: 'out' as const,
  source: 'cage' as const,
  tender_type: 'chips',
  amount: 250,
};

const mockVisitSummary = {
  visit_id: 'visit-uuid-1',
  casino_id: 'casino-uuid-1',
  total_in: 1000,
  total_out: 250,
  net_amount: 750,
  event_count: 5,
  first_transaction_at: '2025-01-15T10:00:00Z',
  last_transaction_at: '2025-01-15T14:00:00Z',
};

// === Mock Factory ===

function createMockSupabase(): SupabaseClient<Database> {
  return {
    from: jest.fn(),
    rpc: jest.fn(),
  } as unknown as SupabaseClient<Database>;
}

// === Tests ===

describe('PlayerFinancialService Factory', () => {
  let supabase: SupabaseClient<Database>;
  let service: PlayerFinancialService;

  beforeEach(() => {
    jest.clearAllMocks();
    supabase = createMockSupabase();
    service = createPlayerFinancialService(supabase);
  });

  describe('factory creation', () => {
    it('creates service with all interface methods', () => {
      expect(service).toHaveProperty('create');
      expect(service).toHaveProperty('getById');
      expect(service).toHaveProperty('getByIdempotencyKey');
      expect(service).toHaveProperty('list');
      expect(service).toHaveProperty('getVisitSummary');
    });

    it('returns object, not class instance', () => {
      expect(service.constructor).toBe(Object);
    });

    it('all methods are functions', () => {
      expect(typeof service.create).toBe('function');
      expect(typeof service.getById).toBe('function');
      expect(typeof service.getByIdempotencyKey).toBe('function');
      expect(typeof service.list).toBe('function');
      expect(typeof service.getVisitSummary).toBe('function');
    });
  });

  describe('create() delegation', () => {
    it('delegates to crud.createTransaction', async () => {
      (crud.createTransaction as jest.Mock).mockResolvedValue(mockTransaction);

      const input = {
        casino_id: 'casino-uuid-1',
        player_id: 'player-uuid-1',
        visit_id: 'visit-uuid-1',
        amount: 500,
        direction: 'in' as const,
        source: 'pit' as const,
        tender_type: 'cash',
        created_by_staff_id: 'staff-uuid-1',
      };

      const result = await service.create(input);

      expect(crud.createTransaction).toHaveBeenCalledWith(supabase, input);
      expect(result).toEqual(mockTransaction);
    });

    it('passes through all input fields', async () => {
      (crud.createTransaction as jest.Mock).mockResolvedValue(mockTransaction);

      const input = {
        casino_id: 'casino-uuid-1',
        player_id: 'player-uuid-1',
        visit_id: 'visit-uuid-1',
        amount: 500,
        direction: 'in' as const,
        source: 'pit' as const,
        tender_type: 'cash',
        created_by_staff_id: 'staff-uuid-1',
        rating_slip_id: 'slip-uuid-1',
        related_transaction_id: 'related-uuid-1',
        idempotency_key: 'idem-456',
        created_at: '2025-01-15T11:00:00Z',
      };

      await service.create(input);

      expect(crud.createTransaction).toHaveBeenCalledWith(supabase, input);
    });
  });

  describe('getById() delegation', () => {
    it('delegates to crud.getById', async () => {
      (crud.getById as jest.Mock).mockResolvedValue(mockTransaction);

      const result = await service.getById('txn-uuid-1');

      expect(crud.getById).toHaveBeenCalledWith(supabase, 'txn-uuid-1');
      expect(result).toEqual(mockTransaction);
    });

    it('returns null when not found', async () => {
      (crud.getById as jest.Mock).mockResolvedValue(null);

      const result = await service.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getByIdempotencyKey() delegation', () => {
    it('delegates to crud.getByIdempotencyKey', async () => {
      (crud.getByIdempotencyKey as jest.Mock).mockResolvedValue(
        mockTransaction,
      );

      const result = await service.getByIdempotencyKey(
        'casino-uuid-1',
        'idem-123',
      );

      expect(crud.getByIdempotencyKey).toHaveBeenCalledWith(
        supabase,
        'casino-uuid-1',
        'idem-123',
      );
      expect(result).toEqual(mockTransaction);
    });

    it('returns null when idempotency key not found', async () => {
      (crud.getByIdempotencyKey as jest.Mock).mockResolvedValue(null);

      const result = await service.getByIdempotencyKey(
        'casino-uuid-1',
        'nonexistent-key',
      );

      expect(result).toBeNull();
    });
  });

  describe('list() delegation', () => {
    it('delegates to crud.list with empty query', async () => {
      const mockResult = {
        items: [mockTransaction, mockTransactionOut],
        cursor: null,
      };
      (crud.list as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.list({});

      expect(crud.list).toHaveBeenCalledWith(supabase, {});
      expect(result).toEqual(mockResult);
    });

    it('delegates to crud.list with filters', async () => {
      const mockResult = { items: [mockTransaction], cursor: 'next-cursor' };
      (crud.list as jest.Mock).mockResolvedValue(mockResult);

      const query = {
        player_id: 'player-uuid-1',
        visit_id: 'visit-uuid-1',
        direction: 'in' as const,
        source: 'pit' as const,
        limit: 10,
      };

      const result = await service.list(query);

      expect(crud.list).toHaveBeenCalledWith(supabase, query);
      expect(result).toEqual(mockResult);
    });

    it('supports cursor pagination', async () => {
      const mockResult = { items: [mockTransactionOut], cursor: null };
      (crud.list as jest.Mock).mockResolvedValue(mockResult);

      const query = {
        cursor: 'txn-uuid-1',
        limit: 20,
      };

      await service.list(query);

      expect(crud.list).toHaveBeenCalledWith(supabase, query);
    });

    it('supports gaming_day filter', async () => {
      const mockResult = { items: [mockTransaction], cursor: null };
      (crud.list as jest.Mock).mockResolvedValue(mockResult);

      const query = {
        gaming_day: '2025-01-15',
      };

      await service.list(query);

      expect(crud.list).toHaveBeenCalledWith(supabase, query);
    });

    it('supports tender_type filter', async () => {
      const mockResult = { items: [mockTransaction], cursor: null };
      (crud.list as jest.Mock).mockResolvedValue(mockResult);

      const query = {
        tender_type: 'cash',
      };

      await service.list(query);

      expect(crud.list).toHaveBeenCalledWith(supabase, query);
    });

    it('supports table_id filter', async () => {
      const mockResult = { items: [mockTransaction], cursor: null };
      (crud.list as jest.Mock).mockResolvedValue(mockResult);

      const query = {
        table_id: 'table-uuid-1',
      };

      await service.list(query);

      expect(crud.list).toHaveBeenCalledWith(supabase, query);
    });
  });

  describe('getVisitSummary() delegation', () => {
    it('delegates to crud.getVisitSummary', async () => {
      (crud.getVisitSummary as jest.Mock).mockResolvedValue(mockVisitSummary);

      const result = await service.getVisitSummary('visit-uuid-1');

      expect(crud.getVisitSummary).toHaveBeenCalledWith(
        supabase,
        'visit-uuid-1',
      );
      expect(result).toEqual(mockVisitSummary);
    });
  });

  describe('error propagation', () => {
    it('propagates TRANSACTION_AMOUNT_INVALID error', async () => {
      const error = new DomainError(
        'TRANSACTION_AMOUNT_INVALID',
        'Transaction amount must be positive',
      );
      (crud.createTransaction as jest.Mock).mockRejectedValue(error);

      await expect(
        service.create({
          casino_id: 'casino-uuid-1',
          player_id: 'player-uuid-1',
          visit_id: 'visit-uuid-1',
          amount: -100,
          direction: 'in',
          source: 'pit',
          tender_type: 'cash',
          created_by_staff_id: 'staff-uuid-1',
        }),
      ).rejects.toMatchObject({
        code: 'TRANSACTION_AMOUNT_INVALID',
      });
    });

    it('propagates VISIT_NOT_FOUND error', async () => {
      const error = new DomainError('VISIT_NOT_FOUND', 'Visit not found');
      (crud.createTransaction as jest.Mock).mockRejectedValue(error);

      await expect(
        service.create({
          casino_id: 'casino-uuid-1',
          player_id: 'player-uuid-1',
          visit_id: 'nonexistent-visit',
          amount: 500,
          direction: 'in',
          source: 'pit',
          tender_type: 'cash',
          created_by_staff_id: 'staff-uuid-1',
        }),
      ).rejects.toMatchObject({
        code: 'VISIT_NOT_FOUND',
      });
    });

    it('propagates VISIT_NOT_OPEN error', async () => {
      const error = new DomainError(
        'VISIT_NOT_OPEN',
        'Visit is not active. Cannot create transaction.',
      );
      (crud.createTransaction as jest.Mock).mockRejectedValue(error);

      await expect(
        service.create({
          casino_id: 'casino-uuid-1',
          player_id: 'player-uuid-1',
          visit_id: 'closed-visit',
          amount: 500,
          direction: 'in',
          source: 'pit',
          tender_type: 'cash',
          created_by_staff_id: 'staff-uuid-1',
        }),
      ).rejects.toMatchObject({
        code: 'VISIT_NOT_OPEN',
      });
    });

    it('propagates IDEMPOTENCY_CONFLICT error', async () => {
      const error = new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'A transaction with this idempotency key already exists',
      );
      (crud.createTransaction as jest.Mock).mockRejectedValue(error);

      await expect(
        service.create({
          casino_id: 'casino-uuid-1',
          player_id: 'player-uuid-1',
          visit_id: 'visit-uuid-1',
          amount: 500,
          direction: 'in',
          source: 'pit',
          tender_type: 'cash',
          created_by_staff_id: 'staff-uuid-1',
          idempotency_key: 'existing-key',
        }),
      ).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
    });

    it('propagates PLAYER_NOT_FOUND error', async () => {
      const error = new DomainError('PLAYER_NOT_FOUND', 'Player not found');
      (crud.createTransaction as jest.Mock).mockRejectedValue(error);

      await expect(
        service.create({
          casino_id: 'casino-uuid-1',
          player_id: 'nonexistent-player',
          visit_id: 'visit-uuid-1',
          amount: 500,
          direction: 'in',
          source: 'pit',
          tender_type: 'cash',
          created_by_staff_id: 'staff-uuid-1',
        }),
      ).rejects.toMatchObject({
        code: 'PLAYER_NOT_FOUND',
      });
    });

    it('propagates DomainError from list operation', async () => {
      const error = new DomainError('INTERNAL_ERROR', 'Database error');
      (crud.list as jest.Mock).mockRejectedValue(error);

      await expect(service.list({})).rejects.toThrow(DomainError);
    });

    it('propagates DomainError from getVisitSummary', async () => {
      const error = new DomainError(
        'VISIT_NOT_FOUND',
        'Visit financial summary not found',
      );
      (crud.getVisitSummary as jest.Mock).mockRejectedValue(error);

      await expect(
        service.getVisitSummary('nonexistent-visit'),
      ).rejects.toMatchObject({
        code: 'VISIT_NOT_FOUND',
      });
    });
  });
});

describe('Service Interface Contract', () => {
  let service: PlayerFinancialService;

  beforeEach(() => {
    jest.clearAllMocks();
    const supabase = createMockSupabase();
    service = createPlayerFinancialService(supabase);

    // Setup default mocks
    (crud.createTransaction as jest.Mock).mockResolvedValue(mockTransaction);
    (crud.getById as jest.Mock).mockResolvedValue(null);
    (crud.getByIdempotencyKey as jest.Mock).mockResolvedValue(null);
    (crud.list as jest.Mock).mockResolvedValue({ items: [], cursor: null });
    (crud.getVisitSummary as jest.Mock).mockResolvedValue(mockVisitSummary);
  });

  it('create returns Promise<FinancialTransactionDTO>', async () => {
    const result = await service.create({
      casino_id: 'casino-uuid-1',
      player_id: 'player-uuid-1',
      visit_id: 'visit-uuid-1',
      amount: 500,
      direction: 'in',
      source: 'pit',
      tender_type: 'cash',
      created_by_staff_id: 'staff-uuid-1',
    });

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('amount');
    expect(result).toHaveProperty('direction');
  });

  it('getById returns Promise<FinancialTransactionDTO | null>', async () => {
    const result = await service.getById('id');

    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('getByIdempotencyKey returns Promise<FinancialTransactionDTO | null>', async () => {
    const result = await service.getByIdempotencyKey('casino-id', 'key');

    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('list returns Promise<{ items: FinancialTransactionDTO[], cursor: string | null }>', async () => {
    const result = await service.list({});

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('cursor');
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('getVisitSummary returns Promise<VisitFinancialSummaryDTO>', async () => {
    const result = await service.getVisitSummary('visit-id');

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('visit_id');
    expect(result).toHaveProperty('total_in');
    expect(result).toHaveProperty('total_out');
    expect(result).toHaveProperty('net_amount');
  });
});
