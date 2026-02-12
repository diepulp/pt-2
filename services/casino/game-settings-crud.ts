/**
 * Game Settings & Side Bet CRUD Operations — PRD-029
 *
 * Low-level database operations for game_settings and game_settings_side_bet.
 * Functional pattern (no classes) per SLAD.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type {
  CreateGameSettingsDTO,
  GameSettingsDTO,
  GameSettingsListFilters,
  UpdateGameSettingsDTO,
} from './game-settings-dtos';
import {
  toGameSettingsDTOList,
  toGameSettingsDTOOrNull,
  toGameSettingsSideBetDTO,
  toGameSettingsSideBetDTOList,
} from './game-settings-mappers';
import type {
  CreateGameSettingsSideBetDTO,
  GameSettingsSideBetDTO,
  UpdateGameSettingsSideBetDTO,
} from './game-settings-side-bet-dtos';

// === Select Strings ===

const GAME_SETTINGS_SELECT =
  'id, casino_id, game_type, code, name, variant_name, shoe_decks, deck_profile, house_edge, rating_edge_for_comp, decisions_per_hour, seats_available, min_bet, max_bet, notes, created_at, updated_at';

const SIDE_BET_SELECT =
  'id, game_settings_id, casino_id, side_bet_name, house_edge, paytable_id, enabled_by_default, created_at, updated_at';

// === Game Settings CRUD ===

/**
 * List game settings with optional filters.
 * Returns an array — multiple variants per game_type are expected.
 * Callers MUST NOT use .maybeSingle().
 */
export async function listGameSettings(
  supabase: SupabaseClient<Database>,
  filters: GameSettingsListFilters = {},
): Promise<GameSettingsDTO[]> {
  let query = supabase
    .from('game_settings')
    .select(GAME_SETTINGS_SELECT)
    .order('game_type')
    .order('code');

  if (filters.game_type) {
    query = query.eq('game_type', filters.game_type);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toGameSettingsDTOList(data ?? []);
}

/**
 * Get game settings by stable code identifier.
 */
export async function getGameSettingsByCode(
  supabase: SupabaseClient<Database>,
  code: string,
): Promise<GameSettingsDTO | null> {
  const { data, error } = await supabase
    .from('game_settings')
    .select(GAME_SETTINGS_SELECT)
    .eq('code', code)
    .maybeSingle();

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toGameSettingsDTOOrNull(data);
}

/**
 * Get game settings by ID.
 */
export async function getGameSettingsById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<GameSettingsDTO | null> {
  const { data, error } = await supabase
    .from('game_settings')
    .select(GAME_SETTINGS_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toGameSettingsDTOOrNull(data);
}

/**
 * Create a game setting.
 */
export async function createGameSettings(
  supabase: SupabaseClient<Database>,
  input: CreateGameSettingsDTO,
): Promise<GameSettingsDTO> {
  const { data, error } = await supabase
    .from('game_settings')
    .insert({
      casino_id: input.casino_id,
      game_type: input.game_type,
      code: input.code,
      name: input.name,
      variant_name: input.variant_name ?? null,
      shoe_decks: input.shoe_decks ?? null,
      deck_profile: input.deck_profile ?? null,
      house_edge: input.house_edge,
      rating_edge_for_comp: input.rating_edge_for_comp ?? null,
      decisions_per_hour: input.decisions_per_hour,
      seats_available: input.seats_available,
      min_bet: input.min_bet ?? null,
      max_bet: input.max_bet ?? null,
      notes: input.notes ?? null,
    })
    .select(GAME_SETTINGS_SELECT)
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new DomainError(
        'UNIQUE_VIOLATION',
        'Game setting with this code already exists for this casino',
      );
    }
    if (error.code === '23514') {
      throw new DomainError(
        'VALIDATION_ERROR',
        'CHECK constraint violated: ' + error.message,
      );
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toGameSettingsDTOOrNull(data)!;
}

/**
 * Update a game setting.
 */
export async function updateGameSettings(
  supabase: SupabaseClient<Database>,
  id: string,
  input: UpdateGameSettingsDTO,
): Promise<GameSettingsDTO> {
  const updateData: Record<string, unknown> = {};
  if (input.game_type !== undefined) updateData.game_type = input.game_type;
  if (input.name !== undefined) updateData.name = input.name;
  if (input.variant_name !== undefined)
    updateData.variant_name = input.variant_name;
  if (input.shoe_decks !== undefined) updateData.shoe_decks = input.shoe_decks;
  if (input.deck_profile !== undefined)
    updateData.deck_profile = input.deck_profile;
  if (input.house_edge !== undefined) updateData.house_edge = input.house_edge;
  if (input.rating_edge_for_comp !== undefined)
    updateData.rating_edge_for_comp = input.rating_edge_for_comp;
  if (input.decisions_per_hour !== undefined)
    updateData.decisions_per_hour = input.decisions_per_hour;
  if (input.seats_available !== undefined)
    updateData.seats_available = input.seats_available;
  if (input.min_bet !== undefined) updateData.min_bet = input.min_bet;
  if (input.max_bet !== undefined) updateData.max_bet = input.max_bet;
  if (input.notes !== undefined) updateData.notes = input.notes;

  const { data, error } = await supabase
    .from('game_settings')
    .update(updateData)
    .eq('id', id)
    .select(GAME_SETTINGS_SELECT)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new DomainError('NOT_FOUND', 'Game setting not found');
    }
    if (error.code === '23514') {
      throw new DomainError(
        'VALIDATION_ERROR',
        'CHECK constraint violated: ' + error.message,
      );
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toGameSettingsDTOOrNull(data)!;
}

// === Side Bet CRUD ===

/**
 * List side bets for a game setting.
 */
export async function listSideBets(
  supabase: SupabaseClient<Database>,
  gameSettingsId: string,
): Promise<GameSettingsSideBetDTO[]> {
  const { data, error } = await supabase
    .from('game_settings_side_bet')
    .select(SIDE_BET_SELECT)
    .eq('game_settings_id', gameSettingsId)
    .order('side_bet_name');

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toGameSettingsSideBetDTOList(data ?? []);
}

/**
 * Create a side bet. casino_id is trigger-derived from parent game_settings.
 * We pass a placeholder casino_id to satisfy the NOT NULL type constraint;
 * the BEFORE INSERT trigger overwrites it with the parent's casino_id.
 */
export async function createSideBet(
  supabase: SupabaseClient<Database>,
  input: CreateGameSettingsSideBetDTO,
): Promise<GameSettingsSideBetDTO> {
  // casino_id placeholder — trigger overwrites with parent game_settings.casino_id
  const { data, error } = await supabase
    .from('game_settings_side_bet')
    .insert({
      game_settings_id: input.game_settings_id,
      casino_id: '00000000-0000-0000-0000-000000000000',
      side_bet_name: input.side_bet_name,
      house_edge: input.house_edge,
      paytable_id: input.paytable_id ?? null,
      enabled_by_default: input.enabled_by_default,
    })
    .select(SIDE_BET_SELECT)
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new DomainError(
        'UNIQUE_VIOLATION',
        'Side bet already exists for this game setting',
      );
    }
    if (error.code === '23514') {
      throw new DomainError(
        'VALIDATION_ERROR',
        'CHECK constraint violated: ' + error.message,
      );
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toGameSettingsSideBetDTO(data);
}

/**
 * Update a side bet.
 */
export async function updateSideBet(
  supabase: SupabaseClient<Database>,
  id: string,
  input: UpdateGameSettingsSideBetDTO,
): Promise<GameSettingsSideBetDTO> {
  const updateData: Record<string, unknown> = {};
  if (input.side_bet_name !== undefined)
    updateData.side_bet_name = input.side_bet_name;
  if (input.house_edge !== undefined) updateData.house_edge = input.house_edge;
  if (input.paytable_id !== undefined)
    updateData.paytable_id = input.paytable_id;
  if (input.enabled_by_default !== undefined)
    updateData.enabled_by_default = input.enabled_by_default;

  const { data, error } = await supabase
    .from('game_settings_side_bet')
    .update(updateData)
    .eq('id', id)
    .select(SIDE_BET_SELECT)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new DomainError('NOT_FOUND', 'Side bet not found');
    }
    if (error.code === '23514') {
      throw new DomainError(
        'VALIDATION_ERROR',
        'CHECK constraint violated: ' + error.message,
      );
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return toGameSettingsSideBetDTO(data);
}

/**
 * Delete a game setting by ID.
 * Hard delete — no soft_deleted_at column on game_settings.
 * RLS handles casino scoping. game_settings_side_bet has ON DELETE CASCADE.
 */
export async function deleteGameSettings(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error, count } = await supabase
    .from('game_settings')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) {
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  if (count === 0) {
    throw new DomainError('NOT_FOUND', 'Game setting not found');
  }
}

// === Seed RPC ===

/**
 * Call the seed RPC to bulk-insert template game settings for the current casino.
 * Returns count of inserted rows.
 */
export async function seedGameSettingsDefaults(
  supabase: SupabaseClient<Database>,
  template: string = 'small_pit_starter',
): Promise<number> {
  const { data, error } = await supabase.rpc(
    'rpc_seed_game_settings_defaults',
    {
      p_template: template,
    },
  );

  if (error) {
    if (error.code === 'P0001' && error.message.includes('FORBIDDEN')) {
      throw new DomainError('FORBIDDEN', error.message);
    }
    if (error.code === 'P0001' && error.message.includes('UNAUTHORIZED')) {
      throw new DomainError('UNAUTHORIZED', error.message);
    }
    throw new DomainError('INTERNAL_ERROR', error.message, { details: error });
  }

  return data ?? 0;
}
