/**
 * LoyaltyService Promo Instruments Mapper Tests
 *
 * Unit tests for type-safe transformations from RPC responses to DTOs.
 * Tests type guards and mapper functions for all promo instrument operations.
 *
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS5
 */

import { describe, it, expect } from '@jest/globals';

import {
  parseIssueCouponResponse,
  parseVoidCouponResponse,
  parseReplaceCouponResponse,
  parseInventoryResponse,
  parsePromoProgramRow,
  parsePromoCouponRow,
  toPromoProgramDTO,
  toPromoProgramDTOOrNull,
  toPromoCouponDTO,
  toPromoCouponDTOOrNull,
  toIssueCouponOutput,
  toVoidCouponOutput,
  toReplaceCouponOutput,
  toInventoryRow,
  type IssueCouponRpcResponse,
  type VoidCouponRpcResponse,
  type ReplaceCouponRpcResponse,
  type InventoryRpcRow,
  type PromoProgramRow,
  type PromoCouponRow,
} from '@/services/loyalty/promo/mappers';

describe('Promo Instruments Mappers', () => {
  describe('Issue Coupon Mappers', () => {
    const validIssueCouponResponse: IssueCouponRpcResponse = {
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
        player_id: 'player-uuid-456',
        visit_id: 'visit-uuid-789',
      },
    };

    it('toIssueCouponOutput maps valid RPC response to DTO', () => {
      const result = toIssueCouponOutput(validIssueCouponResponse);

      expect(result.coupon.id).toBe('coupon-uuid-123');
      expect(result.coupon.validationNumber).toBe('VAL-001');
      expect(result.coupon.status).toBe('issued');
      expect(result.coupon.faceValueAmount).toBe(25.0);
      expect(result.coupon.requiredMatchWagerAmount).toBe(25.0);
      expect(result.coupon.issuedAt).toBe('2026-01-07T10:00:00Z');
      expect(result.coupon.expiresAt).toBe('2026-02-07T10:00:00Z');
      expect(result.coupon.playerId).toBe('player-uuid-456');
      expect(result.coupon.visitId).toBe('visit-uuid-789');
      expect(result.isExisting).toBe(false);
    });

    it('toIssueCouponOutput handles null optional fields', () => {
      const response: IssueCouponRpcResponse = {
        ...validIssueCouponResponse,
        coupon: {
          ...validIssueCouponResponse.coupon,
          expires_at: null,
          player_id: null,
          visit_id: null,
          required_match_wager_amount: undefined,
        },
      };

      const result = toIssueCouponOutput(response);

      expect(result.coupon.expiresAt).toBeNull();
      expect(result.coupon.playerId).toBeNull();
      expect(result.coupon.visitId).toBeNull();
      expect(result.coupon.requiredMatchWagerAmount).toBe(0);
    });

    it('toIssueCouponOutput handles isExisting=true for idempotent responses', () => {
      const response: IssueCouponRpcResponse = {
        ...validIssueCouponResponse,
        is_existing: true,
      };

      const result = toIssueCouponOutput(response);

      expect(result.isExisting).toBe(true);
    });

    it('parseIssueCouponResponse validates and parses valid response', () => {
      const result = parseIssueCouponResponse(validIssueCouponResponse);

      expect(result.coupon.id).toBe('coupon-uuid-123');
      expect(result.isExisting).toBe(false);
    });

    it('parseIssueCouponResponse throws on invalid response structure', () => {
      const invalidResponses = [
        null,
        undefined,
        {},
        { success: true },
        { success: true, is_existing: false },
        { success: true, is_existing: false, coupon: null },
        { success: true, is_existing: false, coupon: {} },
        { success: true, is_existing: false, coupon: { id: '123' } },
      ];

      for (const invalid of invalidResponses) {
        expect(() => parseIssueCouponResponse(invalid)).toThrow(
          'Invalid IssueCoupon RPC response structure'
        );
      }
    });
  });

  describe('Void Coupon Mappers', () => {
    const validVoidCouponResponse: VoidCouponRpcResponse = {
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

    it('toVoidCouponOutput maps valid RPC response to DTO', () => {
      const result = toVoidCouponOutput(validVoidCouponResponse);

      expect(result.coupon.id).toBe('coupon-uuid-123');
      expect(result.coupon.validationNumber).toBe('VAL-001');
      expect(result.coupon.status).toBe('voided');
      expect(result.coupon.voidedAt).toBe('2026-01-07T12:00:00Z');
      expect(result.coupon.voidedByStaffId).toBe('staff-uuid-456');
      expect(result.isExisting).toBe(false);
    });

    it('toVoidCouponOutput handles missing voided_by_staff_id', () => {
      const response: VoidCouponRpcResponse = {
        ...validVoidCouponResponse,
        coupon: {
          ...validVoidCouponResponse.coupon,
          voided_by_staff_id: undefined,
        },
      };

      const result = toVoidCouponOutput(response);

      expect(result.coupon.voidedByStaffId).toBe('');
    });

    it('parseVoidCouponResponse validates and parses valid response', () => {
      const result = parseVoidCouponResponse(validVoidCouponResponse);

      expect(result.coupon.id).toBe('coupon-uuid-123');
      expect(result.isExisting).toBe(false);
    });

    it('parseVoidCouponResponse throws on invalid response structure', () => {
      const invalidResponses = [
        null,
        undefined,
        {},
        { success: true, is_existing: false },
        { success: true, is_existing: false, coupon: null },
        { success: true, is_existing: false, coupon: { id: '123' } },
      ];

      for (const invalid of invalidResponses) {
        expect(() => parseVoidCouponResponse(invalid)).toThrow(
          'Invalid VoidCoupon RPC response structure'
        );
      }
    });
  });

  describe('Replace Coupon Mappers', () => {
    const validReplaceCouponResponse: ReplaceCouponRpcResponse = {
      success: true,
      is_existing: false,
      old_coupon: {
        id: 'old-coupon-uuid',
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

    it('toReplaceCouponOutput maps valid RPC response to DTO', () => {
      const result = toReplaceCouponOutput(validReplaceCouponResponse);

      expect(result.oldCoupon.id).toBe('old-coupon-uuid');
      expect(result.oldCoupon.validationNumber).toBe('VAL-001');
      expect(result.oldCoupon.status).toBe('replaced');
      expect(result.oldCoupon.replacedAt).toBe('2026-01-07T14:00:00Z');

      expect(result.newCoupon.id).toBe('new-coupon-uuid');
      expect(result.newCoupon.validationNumber).toBe('VAL-002');
      expect(result.newCoupon.status).toBe('issued');
      expect(result.newCoupon.faceValueAmount).toBe(25.0);
      expect(result.newCoupon.issuedAt).toBe('2026-01-07T14:00:00Z');
      expect(result.newCoupon.expiresAt).toBe('2026-02-07T14:00:00Z');
      expect(result.isExisting).toBe(false);
    });

    it('toReplaceCouponOutput handles missing optional fields', () => {
      const response: ReplaceCouponRpcResponse = {
        ...validReplaceCouponResponse,
        old_coupon: {
          id: 'old-coupon-uuid',
          status: 'replaced',
        },
        new_coupon: {
          id: 'new-coupon-uuid',
          validation_number: 'VAL-002',
          status: 'issued',
        },
      };

      const result = toReplaceCouponOutput(response);

      expect(result.oldCoupon.validationNumber).toBe('');
      expect(result.oldCoupon.replacedAt).toBe('');
      expect(result.newCoupon.faceValueAmount).toBe(0);
      expect(result.newCoupon.issuedAt).toBe('');
      expect(result.newCoupon.expiresAt).toBeNull();
    });

    it('parseReplaceCouponResponse validates and parses valid response', () => {
      const result = parseReplaceCouponResponse(validReplaceCouponResponse);

      expect(result.oldCoupon.id).toBe('old-coupon-uuid');
      expect(result.newCoupon.id).toBe('new-coupon-uuid');
    });

    it('parseReplaceCouponResponse throws on invalid response structure', () => {
      // Cases that fail the type guard (throws specific message)
      const typeGuardFailures = [
        null,
        undefined,
        {},
        { success: true, is_existing: false },
        { success: true, is_existing: false, old_coupon: 'not-object' },
      ];

      for (const invalid of typeGuardFailures) {
        expect(() => parseReplaceCouponResponse(invalid)).toThrow(
          'Invalid ReplaceCoupon RPC response structure'
        );
      }

      // Cases where type guard passes but mapping fails (null is typeof 'object')
      // These throw different errors when accessing properties on null
      const mappingFailures = [
        { success: true, is_existing: false, old_coupon: {}, new_coupon: null },
        { success: true, is_existing: false, old_coupon: null, new_coupon: {} },
      ];

      for (const invalid of mappingFailures) {
        expect(() => parseReplaceCouponResponse(invalid)).toThrow();
      }
    });
  });

  describe('Inventory Mappers', () => {
    const validInventoryRow: InventoryRpcRow = {
      status: 'issued',
      coupon_count: 10,
      total_face_value: 250.0,
      total_match_wager: 250.0,
    };

    it('toInventoryRow maps valid RPC row to DTO', () => {
      const result = toInventoryRow(validInventoryRow);

      expect(result.status).toBe('issued');
      expect(result.couponCount).toBe(10);
      expect(result.totalFaceValue).toBe(250.0);
      expect(result.totalMatchWager).toBe(250.0);
    });

    it('toInventoryRow handles null totals', () => {
      const row: InventoryRpcRow = {
        status: 'voided',
        coupon_count: 5,
        total_face_value: null,
        total_match_wager: null,
      };

      const result = toInventoryRow(row);

      expect(result.totalFaceValue).toBe(0);
      expect(result.totalMatchWager).toBe(0);
    });

    it('parseInventoryResponse handles empty array', () => {
      const result = parseInventoryResponse([]);

      expect(result.inventory).toEqual([]);
    });

    it('parseInventoryResponse parses multiple status rows', () => {
      const data = [
        { status: 'issued', coupon_count: 10, total_face_value: 250.0, total_match_wager: 250.0 },
        { status: 'voided', coupon_count: 2, total_face_value: 50.0, total_match_wager: 50.0 },
        { status: 'replaced', coupon_count: 1, total_face_value: 25.0, total_match_wager: 25.0 },
      ];

      const result = parseInventoryResponse(data);

      expect(result.inventory).toHaveLength(3);
      expect(result.inventory[0].status).toBe('issued');
      expect(result.inventory[1].status).toBe('voided');
      expect(result.inventory[2].status).toBe('replaced');
    });

    it('parseInventoryResponse throws on non-array input', () => {
      expect(() => parseInventoryResponse(null)).toThrow(
        'Invalid Inventory RPC response: expected array'
      );
      expect(() => parseInventoryResponse({})).toThrow(
        'Invalid Inventory RPC response: expected array'
      );
    });

    it('parseInventoryResponse throws on invalid row structure', () => {
      const invalidData = [{ status: 'issued' }]; // missing coupon_count

      expect(() => parseInventoryResponse(invalidData)).toThrow(
        'Invalid InventoryRpcRow structure'
      );
    });
  });

  describe('Promo Program Mappers', () => {
    const validProgramRow: PromoProgramRow = {
      id: 'program-uuid-123',
      casino_id: 'casino-uuid-456',
      name: 'Weekend Match Play $25',
      promo_type: 'match_play',
      face_value_amount: 25.0,
      required_match_wager_amount: 25.0,
      status: 'active',
      start_at: '2026-01-01T00:00:00Z',
      end_at: '2026-12-31T23:59:59Z',
      created_by_staff_id: 'staff-uuid-789',
      created_at: '2025-12-15T10:00:00Z',
      updated_at: '2025-12-15T10:00:00Z',
    };

    it('toPromoProgramDTO maps valid row to DTO with camelCase', () => {
      const result = toPromoProgramDTO(validProgramRow);

      expect(result.id).toBe('program-uuid-123');
      expect(result.casinoId).toBe('casino-uuid-456');
      expect(result.name).toBe('Weekend Match Play $25');
      expect(result.promoType).toBe('match_play');
      expect(result.faceValueAmount).toBe(25.0);
      expect(result.requiredMatchWagerAmount).toBe(25.0);
      expect(result.status).toBe('active');
      expect(result.startAt).toBe('2026-01-01T00:00:00Z');
      expect(result.endAt).toBe('2026-12-31T23:59:59Z');
      expect(result.createdByStaffId).toBe('staff-uuid-789');
      expect(result.createdAt).toBe('2025-12-15T10:00:00Z');
      expect(result.updatedAt).toBe('2025-12-15T10:00:00Z');
    });

    it('toPromoProgramDTO handles null date fields', () => {
      const row: PromoProgramRow = {
        ...validProgramRow,
        start_at: null,
        end_at: null,
        created_by_staff_id: null,
      };

      const result = toPromoProgramDTO(row);

      expect(result.startAt).toBeNull();
      expect(result.endAt).toBeNull();
      expect(result.createdByStaffId).toBeNull();
    });

    it('toPromoProgramDTO converts numeric types correctly', () => {
      const row: PromoProgramRow = {
        ...validProgramRow,
        face_value_amount: '100.50' as unknown as number, // String from Postgres numeric
        required_match_wager_amount: '100.50' as unknown as number,
      };

      const result = toPromoProgramDTO(row);

      expect(result.faceValueAmount).toBe(100.5);
      expect(result.requiredMatchWagerAmount).toBe(100.5);
    });

    it('toPromoProgramDTOOrNull returns null for null input', () => {
      expect(toPromoProgramDTOOrNull(null)).toBeNull();
    });

    it('toPromoProgramDTOOrNull returns DTO for valid input', () => {
      const result = toPromoProgramDTOOrNull(validProgramRow);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('program-uuid-123');
    });

    it('parsePromoProgramRow validates and parses valid row', () => {
      const result = parsePromoProgramRow(validProgramRow);

      expect(result.id).toBe('program-uuid-123');
    });

    it('parsePromoProgramRow throws on invalid row structure', () => {
      const invalidRows = [
        null,
        undefined,
        {},
        { id: '123' },
        { id: '123', casino_id: '456' },
        { id: '123', casino_id: '456', name: 'Test' },
      ];

      for (const invalid of invalidRows) {
        expect(() => parsePromoProgramRow(invalid)).toThrow(
          'Invalid PromoProgramRow structure'
        );
      }
    });
  });

  describe('Promo Coupon Mappers', () => {
    const validCouponRow: PromoCouponRow = {
      id: 'coupon-uuid-123',
      casino_id: 'casino-uuid-456',
      promo_program_id: 'program-uuid-789',
      validation_number: 'VAL-001',
      status: 'issued',
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

    it('toPromoCouponDTO maps valid row to DTO with camelCase', () => {
      const result = toPromoCouponDTO(validCouponRow);

      expect(result.id).toBe('coupon-uuid-123');
      expect(result.casinoId).toBe('casino-uuid-456');
      expect(result.promoProgramId).toBe('program-uuid-789');
      expect(result.validationNumber).toBe('VAL-001');
      expect(result.status).toBe('issued');
      expect(result.faceValueAmount).toBe(25.0);
      expect(result.requiredMatchWagerAmount).toBe(25.0);
      expect(result.issuedAt).toBe('2026-01-07T10:00:00Z');
      expect(result.expiresAt).toBe('2026-02-07T10:00:00Z');
      expect(result.voidedAt).toBeNull();
      expect(result.replacedAt).toBeNull();
      expect(result.clearedAt).toBeNull();
      expect(result.playerId).toBe('player-uuid-abc');
      expect(result.visitId).toBe('visit-uuid-def');
      expect(result.issuedByStaffId).toBe('staff-uuid-ghi');
      expect(result.voidedByStaffId).toBeNull();
      expect(result.replacedByStaffId).toBeNull();
      expect(result.replacementCouponId).toBeNull();
    });

    it('toPromoCouponDTO handles voided coupon with all fields', () => {
      const voidedRow: PromoCouponRow = {
        ...validCouponRow,
        status: 'voided',
        voided_at: '2026-01-08T12:00:00Z',
        voided_by_staff_id: 'staff-void-123',
      };

      const result = toPromoCouponDTO(voidedRow);

      expect(result.status).toBe('voided');
      expect(result.voidedAt).toBe('2026-01-08T12:00:00Z');
      expect(result.voidedByStaffId).toBe('staff-void-123');
    });

    it('toPromoCouponDTO handles replaced coupon with replacement reference', () => {
      const replacedRow: PromoCouponRow = {
        ...validCouponRow,
        status: 'replaced',
        replaced_at: '2026-01-08T14:00:00Z',
        replaced_by_staff_id: 'staff-replace-123',
        replacement_coupon_id: 'new-coupon-uuid',
      };

      const result = toPromoCouponDTO(replacedRow);

      expect(result.status).toBe('replaced');
      expect(result.replacedAt).toBe('2026-01-08T14:00:00Z');
      expect(result.replacedByStaffId).toBe('staff-replace-123');
      expect(result.replacementCouponId).toBe('new-coupon-uuid');
    });

    it('toPromoCouponDTO handles anonymous coupon (null player/visit)', () => {
      const anonymousRow: PromoCouponRow = {
        ...validCouponRow,
        player_id: null,
        visit_id: null,
      };

      const result = toPromoCouponDTO(anonymousRow);

      expect(result.playerId).toBeNull();
      expect(result.visitId).toBeNull();
    });

    it('toPromoCouponDTOOrNull returns null for null input', () => {
      expect(toPromoCouponDTOOrNull(null)).toBeNull();
    });

    it('toPromoCouponDTOOrNull returns DTO for valid input', () => {
      const result = toPromoCouponDTOOrNull(validCouponRow);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('coupon-uuid-123');
    });

    it('parsePromoCouponRow validates and parses valid row', () => {
      const result = parsePromoCouponRow(validCouponRow);

      expect(result.id).toBe('coupon-uuid-123');
      expect(result.validationNumber).toBe('VAL-001');
    });

    it('parsePromoCouponRow throws on invalid row structure', () => {
      const invalidRows = [
        null,
        undefined,
        {},
        { id: '123' },
        { id: '123', casino_id: '456' },
        { id: '123', casino_id: '456', promo_program_id: '789' },
        { id: '123', casino_id: '456', promo_program_id: '789', validation_number: 'VAL' },
      ];

      for (const invalid of invalidRows) {
        expect(() => parsePromoCouponRow(invalid)).toThrow(
          'Invalid PromoCouponRow structure'
        );
      }
    });

    it('toPromoCouponDTO converts numeric types correctly', () => {
      const row: PromoCouponRow = {
        ...validCouponRow,
        face_value_amount: '50.00' as unknown as number,
        required_match_wager_amount: '50.00' as unknown as number,
      };

      const result = toPromoCouponDTO(row);

      expect(result.faceValueAmount).toBe(50);
      expect(result.requiredMatchWagerAmount).toBe(50);
    });
  });
});
