/**
 * Player Exclusion Mapper Tests
 *
 * Tests Row → DTO transformations for exclusion records.
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS7
 */

import {
  toExclusionDTO,
  toExclusionDTOList,
  toExclusionDTOOrNull,
  toExclusionStatusDTO,
} from '../exclusion-mappers';

// === Test Data ===

const mockRow = {
  id: '11111111-1111-1111-1111-111111111111',
  casino_id: '22222222-2222-2222-2222-222222222222',
  player_id: '33333333-3333-3333-3333-333333333333',
  exclusion_type: 'internal_ban',
  enforcement: 'hard_block',
  effective_from: '2026-03-01T00:00:00Z',
  effective_until: null,
  review_date: '2026-06-01T00:00:00Z',
  reason: 'Disruptive behavior',
  external_ref: null,
  jurisdiction: null,
  created_by: '44444444-4444-4444-4444-444444444444',
  created_at: '2026-03-01T00:00:00Z',
  lifted_by: null,
  lifted_at: null,
  lift_reason: null,
};

const mockLiftedRow = {
  ...mockRow,
  lifted_by: '55555555-5555-5555-5555-555555555555',
  lifted_at: '2026-03-05T12:00:00Z',
  lift_reason: 'Reviewed and cleared',
};

const mockRowWithAllFields = {
  ...mockRow,
  effective_until: '2026-12-31T23:59:59Z',
  external_ref: 'STATE-2026-001',
  jurisdiction: 'Nevada',
  exclusion_type: 'regulatory',
  enforcement: 'soft_alert',
};

// === Tests ===

describe('toExclusionDTO', () => {
  it('maps a full row to DTO', () => {
    const dto = toExclusionDTO(mockRow);

    expect(dto.id).toBe(mockRow.id);
    expect(dto.casino_id).toBe(mockRow.casino_id);
    expect(dto.player_id).toBe(mockRow.player_id);
    expect(dto.exclusion_type).toBe('internal_ban');
    expect(dto.enforcement).toBe('hard_block');
    expect(dto.effective_from).toBe('2026-03-01T00:00:00Z');
    expect(dto.effective_until).toBeNull();
    expect(dto.review_date).toBe('2026-06-01T00:00:00Z');
    expect(dto.reason).toBe('Disruptive behavior');
    expect(dto.external_ref).toBeNull();
    expect(dto.jurisdiction).toBeNull();
    expect(dto.created_by).toBe(mockRow.created_by);
    expect(dto.created_at).toBe('2026-03-01T00:00:00Z');
    expect(dto.lifted_by).toBeNull();
    expect(dto.lifted_at).toBeNull();
    expect(dto.lift_reason).toBeNull();
  });

  it('maps a lifted row preserving lift fields', () => {
    const dto = toExclusionDTO(mockLiftedRow);

    expect(dto.lifted_by).toBe('55555555-5555-5555-5555-555555555555');
    expect(dto.lifted_at).toBe('2026-03-05T12:00:00Z');
    expect(dto.lift_reason).toBe('Reviewed and cleared');
  });

  it('maps a row with all optional fields populated', () => {
    const dto = toExclusionDTO(mockRowWithAllFields);

    expect(dto.effective_until).toBe('2026-12-31T23:59:59Z');
    expect(dto.external_ref).toBe('STATE-2026-001');
    expect(dto.jurisdiction).toBe('Nevada');
    expect(dto.exclusion_type).toBe('regulatory');
    expect(dto.enforcement).toBe('soft_alert');
  });

  it('produces an object distinct from the input', () => {
    const dto = toExclusionDTO(mockRow);
    expect(dto).not.toBe(mockRow);
  });
});

describe('toExclusionDTOList', () => {
  it('maps an array of rows', () => {
    const dtos = toExclusionDTOList([mockRow, mockLiftedRow]);
    expect(dtos).toHaveLength(2);
    expect(dtos[0].id).toBe(mockRow.id);
    expect(dtos[1].lifted_at).toBe('2026-03-05T12:00:00Z');
  });

  it('returns empty array for empty input', () => {
    expect(toExclusionDTOList([])).toEqual([]);
  });
});

describe('toExclusionDTOOrNull', () => {
  it('maps a row to DTO', () => {
    const dto = toExclusionDTOOrNull(mockRow);
    expect(dto).not.toBeNull();
    expect(dto!.id).toBe(mockRow.id);
  });

  it('returns null for null input', () => {
    expect(toExclusionDTOOrNull(null)).toBeNull();
  });
});

describe('toExclusionStatusDTO', () => {
  it.each([
    ['blocked', 'blocked'],
    ['alert', 'alert'],
    ['watchlist', 'watchlist'],
    ['clear', 'clear'],
  ])('maps status "%s" correctly', (input, expected) => {
    const dto = toExclusionStatusDTO('player-123', input);
    expect(dto.player_id).toBe('player-123');
    expect(dto.status).toBe(expected);
  });
});
