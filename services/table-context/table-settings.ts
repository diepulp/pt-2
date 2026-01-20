/**
 * Table Settings Operations
 *
 * Manages betting limits (min_bet/max_bet) for gaming tables.
 * Auto-creates settings from game_settings defaults when missing.
 *
 * @see PRD-012 Table Betting Limits Management
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import type { TableSettingsDTO, UpdateTableLimitsDTO, GameType } from './dtos';
import { toTableSettingsDTO } from './mappers';
import { GAMING_TABLE_SETTINGS_SELECT } from './selects';

// System fallback defaults when game_settings not configured
const SYSTEM_FALLBACK_MIN_BET = 10;
const SYSTEM_FALLBACK_MAX_BET = 500;

/**
 * Fetches default betting limits from game_settings table for a casino and game type.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID
 * @param gameType - Game type (blackjack, poker, etc.)
 * @returns Default min_bet and max_bet from game_settings, or system fallback
 */
async function getGameSettingsDefaults(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  gameType: GameType,
): Promise<{ min_bet: number; max_bet: number }> {
  const { data, error } = await supabase
    .from('game_settings')
    .select('min_bet, max_bet')
    .eq('casino_id', casinoId)
    .eq('game_type', gameType)
    .maybeSingle();

  if (error) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch game settings defaults: ${error.message}`,
      { details: error },
    );
  }

  // If game_settings exists and has limits configured, use them
  if (data && data.min_bet !== null && data.max_bet !== null) {
    return {
      min_bet: data.min_bet,
      max_bet: data.max_bet,
    };
  }

  // Otherwise use system fallback
  return {
    min_bet: SYSTEM_FALLBACK_MIN_BET,
    max_bet: SYSTEM_FALLBACK_MAX_BET,
  };
}

/**
 * Fetches table settings by table_id, auto-creating from game_settings defaults if missing.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID for RLS scoping
 * @returns Table settings DTO with betting limits
 * @throws DomainError TABLE_NOT_FOUND if gaming_table does not exist
 */
export async function getTableSettings(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
): Promise<TableSettingsDTO> {
  // First, check if settings already exist
  const { data: existingSettings, error: settingsError } = await supabase
    .from('gaming_table_settings')
    .select(GAMING_TABLE_SETTINGS_SELECT)
    .eq('table_id', tableId)
    .eq('casino_id', casinoId)
    .is('active_to', null) // Only active settings
    .maybeSingle();

  if (settingsError) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to fetch table settings: ${settingsError.message}`,
      { details: settingsError },
    );
  }

  if (existingSettings) {
    return toTableSettingsDTO(existingSettings);
  }

  // Settings don't exist, need to auto-create from game_settings defaults

  // First, get the gaming_table to determine game type
  const { data: table, error: tableError } = await supabase
    .from('gaming_table')
    .select('type')
    .eq('id', tableId)
    .eq('casino_id', casinoId)
    .maybeSingle();

  if (tableError || !table) {
    throw new DomainError('TABLE_NOT_FOUND', `Table ${tableId} not found`, {
      details: tableError,
    });
  }

  // Get default limits from game_settings or system fallback
  const defaults = await getGameSettingsDefaults(
    supabase,
    casinoId,
    table.type,
  );

  // Create new table_settings row with defaults
  const { data: newSettings, error: insertError } = await supabase
    .from('gaming_table_settings')
    .insert({
      casino_id: casinoId,
      table_id: tableId,
      min_bet: defaults.min_bet,
      max_bet: defaults.max_bet,
      active_from: new Date().toISOString(),
      active_to: null,
      rotation_interval_minutes: null,
    })
    .select(GAMING_TABLE_SETTINGS_SELECT)
    .single();

  if (insertError || !newSettings) {
    throw new DomainError(
      'INTERNAL_ERROR',
      `Failed to create table settings: ${insertError?.message}`,
      { details: insertError },
    );
  }

  return toTableSettingsDTO(newSettings);
}

/**
 * Updates table betting limits via upsert.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID for RLS scoping
 * @param data - Updated min_bet and max_bet (both required)
 * @returns Updated table settings DTO
 * @throws DomainError VALIDATION_ERROR if min_bet > max_bet
 * @throws DomainError TABLE_NOT_FOUND if gaming_table does not exist
 */
export async function updateTableLimits(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
  data: UpdateTableLimitsDTO,
): Promise<TableSettingsDTO> {
  // Validate min_bet <= max_bet
  if (data.min_bet > data.max_bet) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'min_bet must be less than or equal to max_bet',
    );
  }

  // Check if table exists
  const { data: table, error: tableError } = await supabase
    .from('gaming_table')
    .select('id')
    .eq('id', tableId)
    .eq('casino_id', casinoId)
    .maybeSingle();

  if (tableError || !table) {
    throw new DomainError('TABLE_NOT_FOUND', `Table ${tableId} not found`, {
      details: tableError,
    });
  }

  // Upsert table_settings
  // If a row exists with active_to = null, update it
  // Otherwise, insert a new row
  const { data: existingSettings } = await supabase
    .from('gaming_table_settings')
    .select('id')
    .eq('table_id', tableId)
    .eq('casino_id', casinoId)
    .is('active_to', null)
    .maybeSingle();

  if (existingSettings) {
    // Update existing active settings
    const { data: updated, error: updateError } = await supabase
      .from('gaming_table_settings')
      .update({
        min_bet: data.min_bet,
        max_bet: data.max_bet,
      })
      .eq('id', existingSettings.id)
      .select(GAMING_TABLE_SETTINGS_SELECT)
      .single();

    if (updateError || !updated) {
      throw new DomainError(
        'INTERNAL_ERROR',
        `Failed to update table limits: ${updateError?.message}`,
        { details: updateError },
      );
    }

    return toTableSettingsDTO(updated);
  } else {
    // Insert new settings row
    const { data: inserted, error: insertError } = await supabase
      .from('gaming_table_settings')
      .insert({
        casino_id: casinoId,
        table_id: tableId,
        min_bet: data.min_bet,
        max_bet: data.max_bet,
        active_from: new Date().toISOString(),
        active_to: null,
        rotation_interval_minutes: null,
      })
      .select(GAMING_TABLE_SETTINGS_SELECT)
      .single();

    if (insertError || !inserted) {
      throw new DomainError(
        'INTERNAL_ERROR',
        `Failed to insert table limits: ${insertError?.message}`,
        { details: insertError },
      );
    }

    return toTableSettingsDTO(inserted);
  }
}
