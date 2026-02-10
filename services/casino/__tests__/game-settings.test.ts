/**
 * Game Settings Mappers & Schemas Unit Tests — PRD-029
 *
 * Tests:
 * - toGameSettingsDTO / toGameSettingsSideBetDTO mapper correctness
 * - Zod schema validation for create/update game settings + side bets
 * - CHECK constraint validation (shoe_decks, deck_profile, edge ranges)
 * - CreateGameSettingsSideBetDTO omits casino_id
 *
 * @see services/casino/game-settings-mappers.ts
 * @see services/casino/game-settings-schemas.ts
 */

import {
  toGameSettingsDTO,
  toGameSettingsDTOList,
  toGameSettingsDTOOrNull,
  toGameSettingsSideBetDTO,
  toGameSettingsSideBetDTOList,
} from '../game-settings-mappers';
import {
  createGameSettingsSchema,
  updateGameSettingsSchema,
  createGameSettingsSideBetSchema,
  updateGameSettingsSideBetSchema,
  shoeDecksSchema,
  deckProfileSchema,
  gameTypeSchema,
} from '../game-settings-schemas';

// === Test Data ===

const mockGameSettingsRow = {
  id: 'gs-001',
  casino_id: 'casino-123',
  game_type: 'blackjack' as const,
  code: 'bj_6d',
  name: 'Blackjack — 6-Deck Shoe',
  variant_name: '6-deck shoe',
  shoe_decks: 6,
  deck_profile: 'standard_52',
  house_edge: 0.28,
  rating_edge_for_comp: 0.75,
  decisions_per_hour: 70,
  seats_available: 7,
  min_bet: 25,
  max_bet: 5000,
  notes: 'Standard table',
  created_at: '2026-02-10T08:00:00.000Z',
  updated_at: '2026-02-10T08:00:00.000Z',
};

const mockGameSettingsRowNulls = {
  id: 'gs-002',
  casino_id: 'casino-123',
  game_type: 'pai_gow' as const,
  code: 'pai_gow',
  name: 'Pai Gow Poker',
  variant_name: null,
  shoe_decks: null,
  deck_profile: 'with_joker_53',
  house_edge: 1.46,
  rating_edge_for_comp: null,
  decisions_per_hour: 30,
  seats_available: 6,
  min_bet: null,
  max_bet: null,
  notes: null,
  created_at: '2026-02-10T08:00:00.000Z',
  updated_at: '2026-02-10T08:00:00.000Z',
};

const mockSideBetRow = {
  id: 'sb-001',
  game_settings_id: 'gs-001',
  casino_id: 'casino-123',
  side_bet_name: 'Lucky Ladies (Pay Table D)',
  house_edge: 13.34,
  paytable_id: 'D',
  enabled_by_default: false,
  created_at: '2026-02-10T08:00:00.000Z',
  updated_at: '2026-02-10T08:00:00.000Z',
};

const mockSideBetRowNulls = {
  id: 'sb-002',
  game_settings_id: 'gs-002',
  casino_id: 'casino-123',
  side_bet_name: "Emperor's Challenge",
  house_edge: 4.171,
  paytable_id: null,
  enabled_by_default: false,
  created_at: '2026-02-10T08:00:00.000Z',
  updated_at: '2026-02-10T08:00:00.000Z',
};

// ============================================================================
// Mapper Tests
// ============================================================================

describe('Game Settings Mappers', () => {
  describe('toGameSettingsDTO', () => {
    it('maps all fields correctly', () => {
      const result = toGameSettingsDTO(mockGameSettingsRow);

      expect(result).toEqual({
        id: 'gs-001',
        casino_id: 'casino-123',
        game_type: 'blackjack',
        code: 'bj_6d',
        name: 'Blackjack — 6-Deck Shoe',
        variant_name: '6-deck shoe',
        shoe_decks: 6,
        deck_profile: 'standard_52',
        house_edge: 0.28,
        rating_edge_for_comp: 0.75,
        decisions_per_hour: 70,
        seats_available: 7,
        min_bet: 25,
        max_bet: 5000,
        notes: 'Standard table',
        created_at: '2026-02-10T08:00:00.000Z',
        updated_at: '2026-02-10T08:00:00.000Z',
      });
    });

    it('handles nullable fields as null', () => {
      const result = toGameSettingsDTO(mockGameSettingsRowNulls);

      expect(result.variant_name).toBeNull();
      expect(result.shoe_decks).toBeNull();
      expect(result.rating_edge_for_comp).toBeNull();
      expect(result.min_bet).toBeNull();
      expect(result.max_bet).toBeNull();
      expect(result.notes).toBeNull();
    });

    it('maps new game types (pai_gow, carnival)', () => {
      const paiGow = toGameSettingsDTO(mockGameSettingsRowNulls);
      expect(paiGow.game_type).toBe('pai_gow');

      const carnival = toGameSettingsDTO({
        ...mockGameSettingsRow,
        game_type: 'carnival' as const,
        code: 'uth',
      });
      expect(carnival.game_type).toBe('carnival');
    });

    it('returns a new object (immutability)', () => {
      const result = toGameSettingsDTO(mockGameSettingsRow);
      expect(result).not.toBe(mockGameSettingsRow);
    });
  });

  describe('toGameSettingsDTOList', () => {
    it('maps empty array', () => {
      expect(toGameSettingsDTOList([])).toEqual([]);
    });

    it('maps multiple items preserving order', () => {
      const result = toGameSettingsDTOList([
        mockGameSettingsRow,
        mockGameSettingsRowNulls,
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('bj_6d');
      expect(result[1].code).toBe('pai_gow');
    });
  });

  describe('toGameSettingsDTOOrNull', () => {
    it('returns DTO for valid row', () => {
      const result = toGameSettingsDTOOrNull(mockGameSettingsRow);
      expect(result).not.toBeNull();
      expect(result?.code).toBe('bj_6d');
    });

    it('returns null for null input', () => {
      expect(toGameSettingsDTOOrNull(null)).toBeNull();
    });
  });
});

describe('Game Settings Side Bet Mappers', () => {
  describe('toGameSettingsSideBetDTO', () => {
    it('maps all fields correctly', () => {
      const result = toGameSettingsSideBetDTO(mockSideBetRow);

      expect(result).toEqual({
        id: 'sb-001',
        game_settings_id: 'gs-001',
        casino_id: 'casino-123',
        side_bet_name: 'Lucky Ladies (Pay Table D)',
        house_edge: 13.34,
        paytable_id: 'D',
        enabled_by_default: false,
        created_at: '2026-02-10T08:00:00.000Z',
        updated_at: '2026-02-10T08:00:00.000Z',
      });
    });

    it('handles null paytable_id', () => {
      const result = toGameSettingsSideBetDTO(mockSideBetRowNulls);
      expect(result.paytable_id).toBeNull();
    });

    it('returns a new object (immutability)', () => {
      const result = toGameSettingsSideBetDTO(mockSideBetRow);
      expect(result).not.toBe(mockSideBetRow);
    });
  });

  describe('toGameSettingsSideBetDTOList', () => {
    it('maps empty array', () => {
      expect(toGameSettingsSideBetDTOList([])).toEqual([]);
    });

    it('maps multiple items', () => {
      const result = toGameSettingsSideBetDTOList([
        mockSideBetRow,
        mockSideBetRowNulls,
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].side_bet_name).toBe('Lucky Ladies (Pay Table D)');
      expect(result[1].side_bet_name).toBe("Emperor's Challenge");
    });
  });
});

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('Game Settings Schemas', () => {
  describe('gameTypeSchema', () => {
    it.each([
      'blackjack',
      'poker',
      'roulette',
      'baccarat',
      'pai_gow',
      'carnival',
    ])('accepts valid game type: %s', (type) => {
      expect(gameTypeSchema.safeParse(type).success).toBe(true);
    });

    it('rejects invalid game type', () => {
      expect(gameTypeSchema.safeParse('slots').success).toBe(false);
    });
  });

  describe('shoeDecksSchema', () => {
    it.each([1, 2, 4, 6, 8])('accepts valid shoe_decks: %d', (value) => {
      expect(shoeDecksSchema.safeParse(value).success).toBe(true);
    });

    it('accepts null', () => {
      expect(shoeDecksSchema.safeParse(null).success).toBe(true);
    });

    it('accepts undefined', () => {
      expect(shoeDecksSchema.safeParse(undefined).success).toBe(true);
    });

    it.each([0, 3, 5, 7, 10, -1])('rejects invalid shoe_decks: %d', (value) => {
      expect(shoeDecksSchema.safeParse(value).success).toBe(false);
    });
  });

  describe('deckProfileSchema', () => {
    it.each(['standard_52', 'with_joker_53', 'spanish_48'])(
      'accepts valid deck profile: %s',
      (value) => {
        expect(deckProfileSchema.safeParse(value).success).toBe(true);
      },
    );

    it('accepts null', () => {
      expect(deckProfileSchema.safeParse(null).success).toBe(true);
    });

    it('accepts undefined', () => {
      expect(deckProfileSchema.safeParse(undefined).success).toBe(true);
    });

    it('rejects invalid deck profile', () => {
      expect(deckProfileSchema.safeParse('invalid').success).toBe(false);
    });
  });

  describe('createGameSettingsSchema', () => {
    const validInput = {
      casino_id: '550e8400-e29b-41d4-a716-446655440000',
      game_type: 'blackjack',
      code: 'bj_6d',
      name: 'Blackjack — 6-Deck Shoe',
      house_edge: 0.28,
      decisions_per_hour: 70,
      seats_available: 7,
    };

    it('accepts valid input with required fields only', () => {
      const result = createGameSettingsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('accepts valid input with all optional fields', () => {
      const result = createGameSettingsSchema.safeParse({
        ...validInput,
        variant_name: '6-deck shoe',
        shoe_decks: 6,
        deck_profile: 'standard_52',
        rating_edge_for_comp: 0.75,
        min_bet: 25,
        max_bet: 5000,
        notes: 'Standard table',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing code', () => {
      const { code: _, ...input } = validInput;
      const result = createGameSettingsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty code', () => {
      const result = createGameSettingsSchema.safeParse({
        ...validInput,
        code: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects house_edge below 0', () => {
      const result = createGameSettingsSchema.safeParse({
        ...validInput,
        house_edge: -1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects house_edge above 100', () => {
      const result = createGameSettingsSchema.safeParse({
        ...validInput,
        house_edge: 101,
      });
      expect(result.success).toBe(false);
    });

    it('accepts house_edge at boundaries (0 and 100)', () => {
      expect(
        createGameSettingsSchema.safeParse({ ...validInput, house_edge: 0 })
          .success,
      ).toBe(true);
      expect(
        createGameSettingsSchema.safeParse({ ...validInput, house_edge: 100 })
          .success,
      ).toBe(true);
    });

    it('rejects rating_edge_for_comp below 0', () => {
      const result = createGameSettingsSchema.safeParse({
        ...validInput,
        rating_edge_for_comp: -0.1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects rating_edge_for_comp above 100', () => {
      const result = createGameSettingsSchema.safeParse({
        ...validInput,
        rating_edge_for_comp: 100.1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid casino_id', () => {
      const result = createGameSettingsSchema.safeParse({
        ...validInput,
        casino_id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative decisions_per_hour', () => {
      const result = createGameSettingsSchema.safeParse({
        ...validInput,
        decisions_per_hour: -10,
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero seats_available', () => {
      const result = createGameSettingsSchema.safeParse({
        ...validInput,
        seats_available: 0,
      });
      expect(result.success).toBe(false);
    });

    it('accepts new game types (pai_gow, carnival)', () => {
      expect(
        createGameSettingsSchema.safeParse({
          ...validInput,
          game_type: 'pai_gow',
          code: 'pg_std',
        }).success,
      ).toBe(true);
      expect(
        createGameSettingsSchema.safeParse({
          ...validInput,
          game_type: 'carnival',
          code: 'uth',
        }).success,
      ).toBe(true);
    });
  });

  describe('updateGameSettingsSchema', () => {
    it('accepts empty object (no updates)', () => {
      const result = updateGameSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts partial update with single field', () => {
      const result = updateGameSettingsSchema.safeParse({
        name: 'Updated Name',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid shoe_decks value', () => {
      const result = updateGameSettingsSchema.safeParse({ shoe_decks: 3 });
      expect(result.success).toBe(false);
    });

    it('rejects invalid deck_profile value', () => {
      const result = updateGameSettingsSchema.safeParse({
        deck_profile: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Side Bet Schemas', () => {
  describe('createGameSettingsSideBetSchema', () => {
    const validInput = {
      game_settings_id: '550e8400-e29b-41d4-a716-446655440000',
      side_bet_name: 'Lucky Ladies',
      house_edge: 13.34,
      enabled_by_default: false,
    };

    it('accepts valid input', () => {
      const result = createGameSettingsSideBetSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('accepts input with paytable_id', () => {
      const result = createGameSettingsSideBetSchema.safeParse({
        ...validInput,
        paytable_id: 'D',
      });
      expect(result.success).toBe(true);
    });

    it('does NOT have casino_id field (trigger-derived)', () => {
      const result = createGameSettingsSideBetSchema.safeParse({
        ...validInput,
        casino_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      // Zod strips unknown keys by default, so it should still succeed
      // but casino_id should not be in the parsed result
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('casino_id');
      }
    });

    it('defaults enabled_by_default to false', () => {
      const { enabled_by_default: _, ...input } = validInput;
      const result = createGameSettingsSideBetSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled_by_default).toBe(false);
      }
    });

    it('rejects missing side_bet_name', () => {
      const { side_bet_name: _, ...input } = validInput;
      const result = createGameSettingsSideBetSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects house_edge below 0', () => {
      const result = createGameSettingsSideBetSchema.safeParse({
        ...validInput,
        house_edge: -1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects house_edge above 100', () => {
      const result = createGameSettingsSideBetSchema.safeParse({
        ...validInput,
        house_edge: 101,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid game_settings_id', () => {
      const result = createGameSettingsSideBetSchema.safeParse({
        ...validInput,
        game_settings_id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateGameSettingsSideBetSchema', () => {
    it('accepts empty object', () => {
      const result = updateGameSettingsSideBetSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts partial update', () => {
      const result = updateGameSettingsSideBetSchema.safeParse({
        house_edge: 5.0,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid house_edge', () => {
      const result = updateGameSettingsSideBetSchema.safeParse({
        house_edge: -1,
      });
      expect(result.success).toBe(false);
    });

    it('accepts enabled_by_default toggle', () => {
      const result = updateGameSettingsSideBetSchema.safeParse({
        enabled_by_default: true,
      });
      expect(result.success).toBe(true);
    });
  });
});
