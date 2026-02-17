/**
 * Game Settings Zod Validation Schemas — PRD-029
 *
 * Validates CHECK constraints from the database schema:
 * - shoe_decks IN (1, 2, 4, 6, 8)
 * - deck_profile IN ('standard_52', 'with_joker_53', 'spanish_48')
 * - rating_edge_for_comp 0..100
 * - house_edge 0..100
 */

import { z } from 'zod';

// === Enum Schemas ===

export const gameTypeSchema = z.enum([
  'blackjack',
  'poker',
  'roulette',
  'baccarat',
  'pai_gow',
  'carnival',
]);

export const shoeDecksSchema = z
  .union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(8)])
  .nullable()
  .optional();

export const deckProfileSchema = z
  .enum(['standard_52', 'with_joker_53', 'spanish_48'])
  .nullable()
  .optional();

// === Game Settings Schemas ===

/** Schema for creating a game setting */
export const createGameSettingsSchema = z.object({
  casino_id: z.string().uuid('Invalid casino ID'),
  game_type: gameTypeSchema,
  code: z.string().min(1, 'Code is required').max(100),
  name: z.string().min(1, 'Name is required').max(255),
  variant_name: z.string().max(255).nullable().optional(),
  shoe_decks: shoeDecksSchema,
  deck_profile: deckProfileSchema,
  house_edge: z
    .number()
    .min(0, 'House edge must be >= 0')
    .max(100, 'House edge must be <= 100'),
  rating_edge_for_comp: z
    .number()
    .min(0, 'Rating edge must be >= 0')
    .max(100, 'Rating edge must be <= 100')
    .nullable()
    .optional(),
  decisions_per_hour: z
    .number()
    .int()
    .positive('Decisions per hour must be positive'),
  seats_available: z.number().int().positive('Seats must be positive'),
  min_bet: z.number().min(0).nullable().optional(),
  max_bet: z.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** Schema for updating a game setting */
export const updateGameSettingsSchema = z.object({
  game_type: gameTypeSchema.optional(),
  name: z.string().min(1).max(255).optional(),
  variant_name: z.string().max(255).nullable().optional(),
  shoe_decks: shoeDecksSchema,
  deck_profile: deckProfileSchema,
  house_edge: z.number().min(0).max(100).optional(),
  rating_edge_for_comp: z.number().min(0).max(100).nullable().optional(),
  decisions_per_hour: z.number().int().positive().optional(),
  seats_available: z.number().int().positive().optional(),
  min_bet: z.number().min(0).nullable().optional(),
  max_bet: z.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// === Side Bet Schemas ===

/** Schema for creating a side bet (no casino_id — trigger-derived) */
export const createGameSettingsSideBetSchema = z.object({
  game_settings_id: z.string().uuid('Invalid game settings ID'),
  side_bet_name: z.string().min(1, 'Side bet name is required').max(255),
  house_edge: z
    .number()
    .min(0, 'House edge must be >= 0')
    .max(100, 'House edge must be <= 100'),
  paytable_id: z.string().max(100).nullable().optional(),
  enabled_by_default: z.boolean().default(false),
});

/** Schema for updating a side bet */
export const updateGameSettingsSideBetSchema = z.object({
  side_bet_name: z.string().min(1).max(255).optional(),
  house_edge: z.number().min(0).max(100).optional(),
  paytable_id: z.string().max(100).nullable().optional(),
  enabled_by_default: z.boolean().optional(),
});

// === Type Exports ===

export type CreateGameSettingsInput = z.infer<typeof createGameSettingsSchema>;
export type UpdateGameSettingsInput = z.infer<typeof updateGameSettingsSchema>;
export type CreateGameSettingsSideBetInput = z.infer<
  typeof createGameSettingsSideBetSchema
>;
export type UpdateGameSettingsSideBetInput = z.infer<
  typeof updateGameSettingsSideBetSchema
>;
