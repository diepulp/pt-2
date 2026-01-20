/**
 * LoyaltyService Promo Instruments Service Layer Unit Tests
 *
 * Unit tests for promo program and coupon CRUD operations.
 * Uses mocked Supabase client to test service layer logic in isolation.
 *
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS5
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createProgram,
  getProgram,
  listPrograms,
  updateProgram,
  issueCoupon,
  voidCoupon,
  replaceCoupon,
  getCouponInventory,
  listCoupons,
  getCoupon,
  getCouponByValidationNumber,
} from '@/services/loyalty/promo/crud';
import type {
  CreatePromoProgramInput,
  IssueCouponInput,
  PromoProgramListQuery,
  PromoCouponListQuery,
  ReplaceCouponInput,
  VoidCouponInput,
} from '@/services/loyalty/promo/dtos';

// Mock Supabase client factory
function createMockSupabase() {
  const mockFrom = jest.fn();
  const mockRpc = jest.fn();

  return {
    from: mockFrom,
    rpc: mockRpc,
    _mockFrom: mockFrom,
    _mockRpc: mockRpc,
  };
}

// Mock program row from database
const mockProgramRow = {
  id: 'program-uuid-123',
  casino_id: 'casino-uuid-456',
  name: 'Weekend Match Play $25',
  promo_type: 'match_play' as const,
  face_value_amount: 25.0,
  required_match_wager_amount: 25.0,
  status: 'active',
  start_at: '2026-01-01T00:00:00Z',
  end_at: '2026-12-31T23:59:59Z',
  created_by_staff_id: 'staff-uuid-789',
  created_at: '2025-12-15T10:00:00Z',
  updated_at: '2025-12-15T10:00:00Z',
};

// Mock coupon row from database
const mockCouponRow = {
  id: 'coupon-uuid-123',
  casino_id: 'casino-uuid-456',
  promo_program_id: 'program-uuid-789',
  validation_number: 'VAL-001',
  status: 'issued' as const,
  face_value_amount: 25.0,
  required_match_wager_amount: 25.0,
  issued_at: '2026-01-07T10:00:00Z',
  expires_at: '2026-02-07T10:00:00Z',
  voided_at: null,
  replaced_at: null,
  cleared_at: null,
  player_id: 'player-uuid-abc',
  visit_id: 'visit-uuid-def',
  issued_by_staff_id: 'staff-uuid-ghi',
  voided_by_staff_id: null,
  replaced_by_staff_id: null,
  replacement_coupon_id: null,
};

describe('Promo Instruments Service Layer', () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    jest.clearAllMocks();
    supabase = createMockSupabase();
  });

  describe('Promo Program Operations', () => {
    describe('listPrograms', () => {
      it('returns empty array when no programs exist', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          range: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const result = await listPrograms(supabase as never, {});

        expect(result).toEqual([]);
        expect(supabase._mockFrom).toHaveBeenCalledWith('promo_program');
      });

      it('returns mapped PromoProgramDTO array', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({
            data: [mockProgramRow],
            error: null,
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const result = await listPrograms(supabase as never, {});

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('program-uuid-123');
        expect(result[0].casinoId).toBe('casino-uuid-456');
        expect(result[0].name).toBe('Weekend Match Play $25');
        expect(result[0].promoType).toBe('match_play');
        expect(result[0].faceValueAmount).toBe(25.0);
      });

      it('filters by status when provided', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        await listPrograms(supabase as never, { status: 'active' });

        expect(chainMock.eq).toHaveBeenCalledWith('status', 'active');
      });

      it('applies pagination with limit and offset', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          range: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        await listPrograms(supabase as never, { limit: 20, offset: 40 });

        expect(chainMock.limit).toHaveBeenCalledWith(20);
        expect(chainMock.range).toHaveBeenCalledWith(40, 59);
      });

      it('caps limit at 100', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        await listPrograms(supabase as never, { limit: 200 });

        expect(chainMock.limit).toHaveBeenCalledWith(100);
      });

      it('throws DomainError on Supabase error', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'No rows found' },
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        await expect(listPrograms(supabase as never, {})).rejects.toThrow(
          DomainError,
        );
      });
    });

    describe('getProgram', () => {
      it('returns PromoProgramDTO when found', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: mockProgramRow,
            error: null,
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const result = await getProgram(supabase as never, 'program-uuid-123');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('program-uuid-123');
        expect(result?.name).toBe('Weekend Match Play $25');
      });

      it('returns null when program not found', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const result = await getProgram(supabase as never, 'nonexistent-id');

        expect(result).toBeNull();
      });
    });

    describe('createProgram', () => {
      it('creates program with required fields', async () => {
        const chainMock = {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: mockProgramRow,
            error: null,
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const input: CreatePromoProgramInput = {
          name: 'Weekend Match Play $25',
          faceValueAmount: 25.0,
          requiredMatchWagerAmount: 25.0,
        };

        const result = await createProgram(supabase as never, input);

        expect(result.id).toBe('program-uuid-123');
        expect(result.name).toBe('Weekend Match Play $25');
        expect(chainMock.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Weekend Match Play $25',
            face_value_amount: 25.0,
            required_match_wager_amount: 25.0,
            promo_type: 'match_play',
            status: 'active',
          }),
        );
      });

      it('creates program with optional date fields', async () => {
        const chainMock = {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: mockProgramRow,
            error: null,
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const input: CreatePromoProgramInput = {
          name: 'Limited Time Offer',
          faceValueAmount: 50.0,
          requiredMatchWagerAmount: 50.0,
          startAt: '2026-01-01T00:00:00Z',
          endAt: '2026-01-31T23:59:59Z',
        };

        await createProgram(supabase as never, input);

        expect(chainMock.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            start_at: '2026-01-01T00:00:00Z',
            end_at: '2026-01-31T23:59:59Z',
          }),
        );
      });
    });

    describe('updateProgram', () => {
      it('updates program with partial fields', async () => {
        const updatedRow = { ...mockProgramRow, status: 'inactive' };
        const chainMock = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: updatedRow,
            error: null,
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const result = await updateProgram(supabase as never, {
          id: 'program-uuid-123',
          status: 'inactive',
        });

        expect(result.status).toBe('inactive');
        expect(chainMock.update).toHaveBeenCalledWith({ status: 'inactive' });
      });

      it('throws NOT_FOUND when program does not exist', async () => {
        const chainMock = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'No rows found' },
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        await expect(
          updateProgram(supabase as never, {
            id: 'nonexistent-id',
            status: 'inactive',
          }),
        ).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
      });
    });
  });

  describe('Promo Coupon Operations', () => {
    describe('issueCoupon', () => {
      const validInput: IssueCouponInput = {
        promoProgramId: 'program-uuid-123',
        validationNumber: 'VAL-001',
        idempotencyKey: 'issue:VAL-001',
        playerId: 'player-uuid-abc',
        visitId: 'visit-uuid-def',
      };

      it('issues coupon successfully', async () => {
        const rpcResponse = {
          success: true,
          is_existing: false,
          coupon: {
            id: 'coupon-uuid-123',
            validation_number: 'VAL-001',
            status: 'issued',
            face_value_amount: 25.0,
            required_match_wager_amount: 25.0,
            issued_at: '2026-01-07T10:00:00Z',
            expires_at: '2026-02-07T10:00:00Z',
            player_id: 'player-uuid-abc',
            visit_id: 'visit-uuid-def',
          },
        };
        supabase._mockRpc.mockResolvedValue({ data: rpcResponse, error: null });

        const result = await issueCoupon(supabase as never, validInput);

        expect(result.coupon.id).toBe('coupon-uuid-123');
        expect(result.coupon.validationNumber).toBe('VAL-001');
        expect(result.coupon.status).toBe('issued');
        expect(result.isExisting).toBe(false);
        expect(supabase._mockRpc).toHaveBeenCalledWith(
          'rpc_issue_promo_coupon',
          {
            p_promo_program_id: 'program-uuid-123',
            p_validation_number: 'VAL-001',
            p_idempotency_key: 'issue:VAL-001',
            p_player_id: 'player-uuid-abc',
            p_visit_id: 'visit-uuid-def',
            p_expires_at: null,
            p_correlation_id: null,
          },
        );
      });

      it('returns isExisting=true for idempotent duplicate', async () => {
        const rpcResponse = {
          success: true,
          is_existing: true,
          coupon: {
            id: 'coupon-uuid-123',
            validation_number: 'VAL-001',
            status: 'issued',
            face_value_amount: 25.0,
            issued_at: '2026-01-07T10:00:00Z',
            expires_at: null,
          },
        };
        supabase._mockRpc.mockResolvedValue({ data: rpcResponse, error: null });

        const result = await issueCoupon(supabase as never, validInput);

        expect(result.isExisting).toBe(true);
      });

      it('throws PROMO_PROGRAM_NOT_FOUND for missing program', async () => {
        supabase._mockRpc.mockResolvedValue({
          data: null,
          error: { message: 'PROMO_PROGRAM_NOT_FOUND' },
        });

        await expect(
          issueCoupon(supabase as never, validInput),
        ).rejects.toMatchObject({
          code: 'PROMO_PROGRAM_NOT_FOUND',
        });
      });

      it('throws PROMO_PROGRAM_INACTIVE when program not active', async () => {
        supabase._mockRpc.mockResolvedValue({
          data: null,
          error: { message: 'PROMO_PROGRAM_INACTIVE' },
        });

        await expect(
          issueCoupon(supabase as never, validInput),
        ).rejects.toMatchObject({
          code: 'PROMO_PROGRAM_INACTIVE',
        });
      });

      it('throws ANONYMOUS_ISSUANCE_DISABLED when casino disallows anonymous', async () => {
        const anonymousInput = { ...validInput, playerId: undefined };
        supabase._mockRpc.mockResolvedValue({
          data: null,
          error: { message: 'ANONYMOUS_ISSUANCE_DISABLED' },
        });

        await expect(
          issueCoupon(supabase as never, anonymousInput),
        ).rejects.toMatchObject({
          code: 'ANONYMOUS_ISSUANCE_DISABLED',
        });
      });

      it('throws DUPLICATE_VALIDATION_NUMBER on unique constraint violation', async () => {
        supabase._mockRpc.mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'validation_number unique' },
        });

        await expect(
          issueCoupon(supabase as never, validInput),
        ).rejects.toMatchObject({
          code: 'DUPLICATE_VALIDATION_NUMBER',
        });
      });
    });

    describe('voidCoupon', () => {
      const validInput: VoidCouponInput = {
        couponId: 'coupon-uuid-123',
        idempotencyKey: 'void:VAL-001',
      };

      it('voids coupon successfully', async () => {
        const rpcResponse = {
          success: true,
          is_existing: false,
          coupon: {
            id: 'coupon-uuid-123',
            validation_number: 'VAL-001',
            status: 'voided',
            voided_at: '2026-01-07T12:00:00Z',
            voided_by_staff_id: 'staff-uuid-456',
          },
        };
        supabase._mockRpc.mockResolvedValue({ data: rpcResponse, error: null });

        const result = await voidCoupon(supabase as never, validInput);

        expect(result.coupon.id).toBe('coupon-uuid-123');
        expect(result.coupon.status).toBe('voided');
        expect(result.coupon.voidedAt).toBe('2026-01-07T12:00:00Z');
        expect(result.isExisting).toBe(false);
      });

      it('throws COUPON_NOT_FOUND for missing coupon', async () => {
        supabase._mockRpc.mockResolvedValue({
          data: null,
          error: { message: 'COUPON_NOT_FOUND' },
        });

        await expect(
          voidCoupon(supabase as never, validInput),
        ).rejects.toMatchObject({
          code: 'COUPON_NOT_FOUND',
        });
      });

      it('throws INVALID_COUPON_STATUS when coupon already voided', async () => {
        supabase._mockRpc.mockResolvedValue({
          data: null,
          error: { message: 'INVALID_COUPON_STATUS' },
        });

        await expect(
          voidCoupon(supabase as never, validInput),
        ).rejects.toMatchObject({
          code: 'INVALID_COUPON_STATUS',
        });
      });
    });

    describe('replaceCoupon', () => {
      const validInput: ReplaceCouponInput = {
        couponId: 'coupon-uuid-123',
        newValidationNumber: 'VAL-002',
        idempotencyKey: 'replace:VAL-001',
      };

      it('replaces coupon successfully', async () => {
        const rpcResponse = {
          success: true,
          is_existing: false,
          old_coupon: {
            id: 'coupon-uuid-123',
            validation_number: 'VAL-001',
            status: 'replaced',
            replaced_at: '2026-01-07T14:00:00Z',
          },
          new_coupon: {
            id: 'new-coupon-uuid',
            validation_number: 'VAL-002',
            status: 'issued',
            face_value_amount: 25.0,
            issued_at: '2026-01-07T14:00:00Z',
            expires_at: '2026-02-07T14:00:00Z',
          },
        };
        supabase._mockRpc.mockResolvedValue({ data: rpcResponse, error: null });

        const result = await replaceCoupon(supabase as never, validInput);

        expect(result.oldCoupon.id).toBe('coupon-uuid-123');
        expect(result.oldCoupon.status).toBe('replaced');
        expect(result.newCoupon.id).toBe('new-coupon-uuid');
        expect(result.newCoupon.validationNumber).toBe('VAL-002');
        expect(result.newCoupon.status).toBe('issued');
        expect(result.isExisting).toBe(false);
      });

      it('throws INVALID_COUPON_STATUS when coupon cannot be replaced', async () => {
        supabase._mockRpc.mockResolvedValue({
          data: null,
          error: { message: 'INVALID_COUPON_STATUS' },
        });

        await expect(
          replaceCoupon(supabase as never, validInput),
        ).rejects.toMatchObject({
          code: 'INVALID_COUPON_STATUS',
        });
      });
    });

    describe('getCouponInventory', () => {
      it('returns inventory breakdown by status', async () => {
        const rpcResponse = [
          {
            status: 'issued',
            coupon_count: 10,
            total_face_value: 250.0,
            total_match_wager: 250.0,
          },
          {
            status: 'voided',
            coupon_count: 2,
            total_face_value: 50.0,
            total_match_wager: 50.0,
          },
        ];
        supabase._mockRpc.mockResolvedValue({ data: rpcResponse, error: null });

        const result = await getCouponInventory(supabase as never, {});

        expect(result.inventory).toHaveLength(2);
        expect(result.inventory[0].status).toBe('issued');
        expect(result.inventory[0].couponCount).toBe(10);
        expect(result.inventory[0].totalFaceValue).toBe(250.0);
      });

      it('filters by program when provided', async () => {
        supabase._mockRpc.mockResolvedValue({ data: [], error: null });

        await getCouponInventory(supabase as never, {
          promoProgramId: 'program-uuid-123',
        });

        expect(supabase._mockRpc).toHaveBeenCalledWith(
          'rpc_promo_coupon_inventory',
          expect.objectContaining({
            p_promo_program_id: 'program-uuid-123',
          }),
        );
      });
    });

    describe('listCoupons', () => {
      it('returns mapped PromoCouponDTO array', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({
            data: [mockCouponRow],
            error: null,
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const result = await listCoupons(supabase as never, {});

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('coupon-uuid-123');
        expect(result[0].validationNumber).toBe('VAL-001');
        expect(result[0].status).toBe('issued');
      });

      it('filters by status', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        await listCoupons(supabase as never, { status: 'voided' });

        expect(chainMock.eq).toHaveBeenCalledWith('status', 'voided');
      });

      it('filters by player', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        await listCoupons(supabase as never, { playerId: 'player-uuid-abc' });

        expect(chainMock.eq).toHaveBeenCalledWith(
          'player_id',
          'player-uuid-abc',
        );
      });

      it('filters by expiringBefore', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        await listCoupons(supabase as never, {
          expiringBefore: '2026-01-08T00:00:00Z',
        });

        expect(chainMock.eq).toHaveBeenCalledWith('status', 'issued');
        expect(chainMock.lt).toHaveBeenCalledWith(
          'expires_at',
          '2026-01-08T00:00:00Z',
        );
      });
    });

    describe('getCoupon', () => {
      it('returns PromoCouponDTO when found', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: mockCouponRow,
            error: null,
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const result = await getCoupon(supabase as never, 'coupon-uuid-123');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('coupon-uuid-123');
      });

      it('returns null when coupon not found', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const result = await getCoupon(supabase as never, 'nonexistent-id');

        expect(result).toBeNull();
      });
    });

    describe('getCouponByValidationNumber', () => {
      it('returns PromoCouponDTO when found', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: mockCouponRow,
            error: null,
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const result = await getCouponByValidationNumber(
          supabase as never,
          'VAL-001',
        );

        expect(result).not.toBeNull();
        expect(result?.validationNumber).toBe('VAL-001');
      });

      it('returns null when validation number not found', async () => {
        const chainMock = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };
        supabase._mockFrom.mockReturnValue(chainMock);

        const result = await getCouponByValidationNumber(
          supabase as never,
          'NONEXISTENT',
        );

        expect(result).toBeNull();
      });
    });
  });

  describe('Error Mapping', () => {
    it('maps UNAUTHORIZED error correctly', async () => {
      supabase._mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'UNAUTHORIZED: context not set' },
      });

      await expect(
        issueCoupon(supabase as never, {
          promoProgramId: 'test',
          validationNumber: 'VAL-001',
          idempotencyKey: 'test',
        }),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('maps FORBIDDEN error with role info', async () => {
      supabase._mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'FORBIDDEN: Role floor_staff cannot issue' },
      });

      await expect(
        issueCoupon(supabase as never, {
          promoProgramId: 'test',
          validationNumber: 'VAL-001',
          idempotencyKey: 'test',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('maps PLAYER_NOT_ENROLLED error', async () => {
      supabase._mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'PLAYER_NOT_ENROLLED' },
      });

      await expect(
        issueCoupon(supabase as never, {
          promoProgramId: 'test',
          validationNumber: 'VAL-001',
          idempotencyKey: 'test',
          playerId: 'player-123',
        }),
      ).rejects.toMatchObject({
        code: 'PLAYER_NOT_ENROLLED',
      });
    });

    it('maps VISIT_NOT_FOUND error', async () => {
      supabase._mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'VISIT_NOT_FOUND' },
      });

      await expect(
        issueCoupon(supabase as never, {
          promoProgramId: 'test',
          validationNumber: 'VAL-001',
          idempotencyKey: 'test',
          visitId: 'visit-123',
        }),
      ).rejects.toMatchObject({
        code: 'VISIT_NOT_FOUND',
      });
    });

    it('maps foreign key violation to specific error', async () => {
      supabase._mockRpc.mockResolvedValue({
        data: null,
        error: { code: '23503', message: 'FK violation on promo_program_id' },
      });

      await expect(
        issueCoupon(supabase as never, {
          promoProgramId: 'nonexistent',
          validationNumber: 'VAL-001',
          idempotencyKey: 'test',
        }),
      ).rejects.toMatchObject({
        code: 'PROMO_PROGRAM_NOT_FOUND',
      });
    });

    it('maps generic error to INTERNAL_ERROR', async () => {
      supabase._mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Unknown database error' },
      });

      await expect(
        issueCoupon(supabase as never, {
          promoProgramId: 'test',
          validationNumber: 'VAL-001',
          idempotencyKey: 'test',
        }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });

    it('throws INTERNAL_ERROR when RPC returns null data', async () => {
      supabase._mockRpc.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(
        issueCoupon(supabase as never, {
          promoProgramId: 'test',
          validationNumber: 'VAL-001',
          idempotencyKey: 'test',
        }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });
  });
});
