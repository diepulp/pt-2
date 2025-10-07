/**
 * Table Context Settings Module
 * Following PT-2 canonical service architecture
 * Handles temporal game settings configuration for gaming tables
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

// ============================================================================
// DTOs for Game Settings
// ============================================================================

export type GameSettingsDTO = Pick<
  Database["public"]["Tables"]["gamesettings"]["Row"],
  | "id"
  | "name"
  | "average_rounds_per_hour"
  | "house_edge"
  | "point_multiplier"
  | "points_conversion_rate"
  | "seats_available"
  | "version"
  | "created_at"
  | "updated_at"
>;

export type GamingTableSettingsDTO = Pick<
  Database["public"]["Tables"]["gamingtablesettings"]["Row"],
  | "id"
  | "gaming_table_id"
  | "game_settings_id"
  | "active_from"
  | "active_until"
  | "description"
  | "is_active"
>;

export interface ApplySettingsDTO {
  gamingTableId: string;
  gameSettingsId: string;
  activeFrom: string;
  activeUntil?: string;
  description?: string;
}

// Combined DTO for settings with game details
export interface ActiveSettingsDTO extends GamingTableSettingsDTO {
  gameSettings: GameSettingsDTO;
}

// ============================================================================
// Settings Service Factory
// ============================================================================

export function createTableContextSettingsService(
  supabase: SupabaseClient<Database>,
) {
  return {
    /**
     * Apply game settings to a gaming table with temporal validity
     * Maps error codes:
     * - 23503: FOREIGN_KEY_VIOLATION (invalid gaming_table_id or game_settings_id)
     */
    applySettings: async (
      data: ApplySettingsDTO,
    ): Promise<ServiceResult<GamingTableSettingsDTO>> => {
      return executeOperation<GamingTableSettingsDTO>(
        "apply_table_settings",
        async () => {
          // Before applying new settings, deactivate any currently active settings for this table
          // This ensures only one active setting per table at a time
          const { error: deactivateError } = await supabase
            .from("gamingtablesettings")
            .update({ is_active: false })
            .eq("gaming_table_id", data.gamingTableId)
            .eq("is_active", true);

          if (deactivateError) {
            throw deactivateError;
          }

          // Insert new settings configuration
          const { data: settings, error } = await supabase
            .from("gamingtablesettings")
            .insert({
              gaming_table_id: data.gamingTableId,
              game_settings_id: data.gameSettingsId,
              active_from: data.activeFrom,
              ...(data.activeUntil && { active_until: data.activeUntil }),
              ...(data.description && { description: data.description }),
              is_active: true,
            })
            .select(
              "id, gaming_table_id, game_settings_id, active_from, active_until, description, is_active",
            )
            .single();

          if (error) {
            // Check for foreign key violation (gaming_table_id or game_settings_id not found)
            if (error.code === "23503") {
              throw {
                code: "FOREIGN_KEY_VIOLATION",
                message:
                  "Referenced gaming table or game settings does not exist",
                details: error,
              };
            }

            throw error;
          }

          return settings;
        },
      );
    },

    /**
     * Get currently active settings for a gaming table
     * Returns null if no active settings found
     */
    getActiveSettings: async (
      gamingTableId: string,
    ): Promise<ServiceResult<ActiveSettingsDTO | null>> => {
      return executeOperation<ActiveSettingsDTO | null>(
        "get_active_table_settings",
        async () => {
          const { data: settingsLink, error: linkError } = await supabase
            .from("gamingtablesettings")
            .select(
              "id, gaming_table_id, game_settings_id, active_from, active_until, description, is_active",
            )
            .eq("gaming_table_id", gamingTableId)
            .eq("is_active", true)
            .maybeSingle();

          if (linkError) {
            throw linkError;
          }

          // No active settings found
          if (!settingsLink) {
            return null;
          }

          // Fetch the associated game settings details
          const { data: gameSettings, error: settingsError } = await supabase
            .from("gamesettings")
            .select(
              "id, name, average_rounds_per_hour, house_edge, point_multiplier, points_conversion_rate, seats_available, version, created_at, updated_at",
            )
            .eq("id", settingsLink.game_settings_id)
            .single();

          if (settingsError) {
            throw settingsError;
          }

          return {
            ...settingsLink,
            gameSettings: gameSettings,
          };
        },
      );
    },

    /**
     * Get all settings history for a gaming table (both active and inactive)
     * Returns array of all temporal settings configurations
     */
    getSettingsHistory: async (
      gamingTableId: string,
    ): Promise<ServiceResult<GamingTableSettingsDTO[]>> => {
      return executeOperation<GamingTableSettingsDTO[]>(
        "get_table_settings_history",
        async () => {
          const { data: history, error } = await supabase
            .from("gamingtablesettings")
            .select(
              "id, gaming_table_id, game_settings_id, active_from, active_until, description, is_active",
            )
            .eq("gaming_table_id", gamingTableId)
            .order("active_from", { ascending: false });

          if (error) {
            throw error;
          }

          return history || [];
        },
      );
    },

    /**
     * Deactivate currently active settings for a gaming table
     * Useful when a table is being closed or reconfigured
     */
    deactivateSettings: async (
      gamingTableId: string,
    ): Promise<ServiceResult<void>> => {
      return executeOperation<void>("deactivate_table_settings", async () => {
        const { error } = await supabase
          .from("gamingtablesettings")
          .update({ is_active: false })
          .eq("gaming_table_id", gamingTableId)
          .eq("is_active", true);

        if (error) {
          throw error;
        }

        return undefined as void;
      });
    },
  };
}
