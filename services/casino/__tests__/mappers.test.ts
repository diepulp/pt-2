/**
 * CasinoService Mappers Unit Tests
 *
 * Tests type-safe transformations from database rows to DTOs.
 *
 * @see mappers.ts
 */

import {
  toCasinoDTO,
  toCasinoDTOList,
  toCasinoDTOOrNull,
  toCasinoSettingsDTO,
  toCasinoSettingsDTOOrNull,
  toStaffDTO,
  toStaffDTOList,
  toStaffDTOOrNull,
} from '../mappers';

describe('CasinoService Mappers', () => {
  // === Test Data ===

  const mockCasinoRow = {
    id: 'casino-123',
    name: 'Test Casino',
    location: 'Las Vegas, NV',
    status: 'active',
    created_at: '2025-01-01T00:00:00.000Z',
  };

  const mockCasinoRowInactive = {
    id: 'casino-456',
    name: 'Closed Casino',
    location: null,
    status: 'inactive',
    created_at: '2024-06-01T00:00:00.000Z',
  };

  const mockCasinoSettingsRow = {
    id: 'settings-123',
    casino_id: 'casino-123',
    gaming_day_start_time: '06:00:00',
    timezone: 'America/Los_Angeles',
    watchlist_floor: 5000,
    ctr_threshold: 10000,
  };

  const mockStaffRow = {
    id: 'staff-123',
    first_name: 'John',
    last_name: 'Dealer',
    role: 'dealer' as const,
    status: 'active' as const,
    employee_id: 'EMP001',
    casino_id: 'casino-123',
  };

  const mockStaffRowPitBoss = {
    id: 'staff-456',
    first_name: 'Jane',
    last_name: 'Boss',
    role: 'pit_boss' as const,
    status: 'active' as const,
    employee_id: null,
    casino_id: 'casino-123',
  };

  // === Casino Mapper Tests ===

  describe('toCasinoDTO', () => {
    it('maps all fields correctly', () => {
      const result = toCasinoDTO(mockCasinoRow);

      expect(result).toEqual({
        id: 'casino-123',
        name: 'Test Casino',
        location: 'Las Vegas, NV',
        status: 'active',
        created_at: '2025-01-01T00:00:00.000Z',
      });
    });

    it('handles null location', () => {
      const result = toCasinoDTO(mockCasinoRowInactive);

      expect(result.location).toBeNull();
    });

    it('maps inactive status correctly', () => {
      const result = toCasinoDTO(mockCasinoRowInactive);

      expect(result.status).toBe('inactive');
    });

    it('returns a new object (immutability)', () => {
      const result = toCasinoDTO(mockCasinoRow);

      expect(result).not.toBe(mockCasinoRow);
    });
  });

  describe('toCasinoDTOList', () => {
    it('maps empty array', () => {
      const result = toCasinoDTOList([]);

      expect(result).toEqual([]);
    });

    it('maps single item array', () => {
      const result = toCasinoDTOList([mockCasinoRow]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('casino-123');
    });

    it('maps multiple items', () => {
      const result = toCasinoDTOList([mockCasinoRow, mockCasinoRowInactive]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('casino-123');
      expect(result[1].id).toBe('casino-456');
    });

    it('preserves order', () => {
      const result = toCasinoDTOList([mockCasinoRowInactive, mockCasinoRow]);

      expect(result[0].id).toBe('casino-456');
      expect(result[1].id).toBe('casino-123');
    });
  });

  describe('toCasinoDTOOrNull', () => {
    it('returns DTO for valid row', () => {
      const result = toCasinoDTOOrNull(mockCasinoRow);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('casino-123');
    });

    it('returns null for null input', () => {
      const result = toCasinoDTOOrNull(null);

      expect(result).toBeNull();
    });
  });

  // === Casino Settings Mapper Tests ===

  describe('toCasinoSettingsDTO', () => {
    it('maps all fields correctly', () => {
      const result = toCasinoSettingsDTO(mockCasinoSettingsRow);

      expect(result).toEqual({
        id: 'settings-123',
        casino_id: 'casino-123',
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 5000,
        ctr_threshold: 10000,
      });
    });

    it('returns a new object (immutability)', () => {
      const result = toCasinoSettingsDTO(mockCasinoSettingsRow);

      expect(result).not.toBe(mockCasinoSettingsRow);
    });

    it('handles different timezones', () => {
      const row = { ...mockCasinoSettingsRow, timezone: 'Europe/London' };
      const result = toCasinoSettingsDTO(row);

      expect(result.timezone).toBe('Europe/London');
    });

    it('handles different threshold values', () => {
      const row = {
        ...mockCasinoSettingsRow,
        watchlist_floor: 0,
        ctr_threshold: 50000,
      };
      const result = toCasinoSettingsDTO(row);

      expect(result.watchlist_floor).toBe(0);
      expect(result.ctr_threshold).toBe(50000);
    });
  });

  describe('toCasinoSettingsDTOOrNull', () => {
    it('returns DTO for valid row', () => {
      const result = toCasinoSettingsDTOOrNull(mockCasinoSettingsRow);

      expect(result).not.toBeNull();
      expect(result?.casino_id).toBe('casino-123');
    });

    it('returns null for null input', () => {
      const result = toCasinoSettingsDTOOrNull(null);

      expect(result).toBeNull();
    });
  });

  // === Staff Mapper Tests ===

  describe('toStaffDTO', () => {
    it('maps all fields correctly for dealer', () => {
      const result = toStaffDTO(mockStaffRow);

      expect(result).toEqual({
        id: 'staff-123',
        first_name: 'John',
        last_name: 'Dealer',
        role: 'dealer',
        status: 'active',
        employee_id: 'EMP001',
        casino_id: 'casino-123',
      });
    });

    it('maps all fields correctly for pit_boss', () => {
      const result = toStaffDTO(mockStaffRowPitBoss);

      expect(result).toEqual({
        id: 'staff-456',
        first_name: 'Jane',
        last_name: 'Boss',
        role: 'pit_boss',
        status: 'active',
        employee_id: null,
        casino_id: 'casino-123',
      });
    });

    it('handles admin role', () => {
      const adminRow = { ...mockStaffRow, role: 'admin' as const };
      const result = toStaffDTO(adminRow);

      expect(result.role).toBe('admin');
    });

    it('handles inactive status', () => {
      const inactiveRow = { ...mockStaffRow, status: 'inactive' as const };
      const result = toStaffDTO(inactiveRow);

      expect(result.status).toBe('inactive');
    });

    it('handles null employee_id', () => {
      const result = toStaffDTO(mockStaffRowPitBoss);

      expect(result.employee_id).toBeNull();
    });

    it('handles null casino_id', () => {
      const row = { ...mockStaffRow, casino_id: null };
      const result = toStaffDTO(row);

      expect(result.casino_id).toBeNull();
    });

    it('returns a new object (immutability)', () => {
      const result = toStaffDTO(mockStaffRow);

      expect(result).not.toBe(mockStaffRow);
    });
  });

  describe('toStaffDTOList', () => {
    it('maps empty array', () => {
      const result = toStaffDTOList([]);

      expect(result).toEqual([]);
    });

    it('maps single item array', () => {
      const result = toStaffDTOList([mockStaffRow]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('staff-123');
    });

    it('maps multiple items with different roles', () => {
      const result = toStaffDTOList([mockStaffRow, mockStaffRowPitBoss]);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('dealer');
      expect(result[1].role).toBe('pit_boss');
    });

    it('preserves order', () => {
      const result = toStaffDTOList([mockStaffRowPitBoss, mockStaffRow]);

      expect(result[0].id).toBe('staff-456');
      expect(result[1].id).toBe('staff-123');
    });

    it('handles rows with created_at (pagination use case)', () => {
      const rowsWithCreatedAt = [
        { ...mockStaffRow, created_at: '2025-01-01T00:00:00.000Z' },
        { ...mockStaffRowPitBoss, created_at: '2025-01-02T00:00:00.000Z' },
      ];
      const result = toStaffDTOList(rowsWithCreatedAt);

      // created_at should NOT be in the output DTO
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('created_at');
      expect(result[1]).not.toHaveProperty('created_at');
    });
  });

  describe('toStaffDTOOrNull', () => {
    it('returns DTO for valid row', () => {
      const result = toStaffDTOOrNull(mockStaffRow);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('staff-123');
    });

    it('returns null for null input', () => {
      const result = toStaffDTOOrNull(null);

      expect(result).toBeNull();
    });
  });

  // === Edge Cases ===

  describe('Edge Cases', () => {
    it('handles empty strings in casino name', () => {
      const row = { ...mockCasinoRow, name: '' };
      const result = toCasinoDTO(row);

      expect(result.name).toBe('');
    });

    it('handles empty strings in staff names', () => {
      const row = { ...mockStaffRow, first_name: '', last_name: '' };
      const result = toStaffDTO(row);

      expect(result.first_name).toBe('');
      expect(result.last_name).toBe('');
    });

    it('handles gaming_day_start_time edge cases', () => {
      const row = {
        ...mockCasinoSettingsRow,
        gaming_day_start_time: '00:00:00',
      };
      const result = toCasinoSettingsDTO(row);

      expect(result.gaming_day_start_time).toBe('00:00:00');
    });

    it('handles zero thresholds', () => {
      const row = {
        ...mockCasinoSettingsRow,
        watchlist_floor: 0,
        ctr_threshold: 0,
      };
      const result = toCasinoSettingsDTO(row);

      expect(result.watchlist_floor).toBe(0);
      expect(result.ctr_threshold).toBe(0);
    });
  });
});
