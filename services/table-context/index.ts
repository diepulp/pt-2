/**
 * Table Context Service Factory
 * Following PT-2 canonical service architecture with explicit interfaces
 * Bounded Context: "What game/table configuration?" (Configuration Domain)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type { ServiceResult } from "../shared/types";

import { createTableContextCrudService } from "./crud";
import type {
  GamingTableCreateDTO,
  GamingTableUpdateDTO,
  GamingTableDTO,
} from "./crud";
import { createTableContextSettingsService } from "./settings";
import type {
  ApplySettingsDTO,
  ActiveSettingsDTO,
  GamingTableSettingsDTO,
  GameSettingsDTO,
} from "./settings";

// ============================================================================
// Explicit Interface - NOT ReturnType inference
// ============================================================================

export interface TableContextService {
  // Gaming Table CRUD
  create(data: GamingTableCreateDTO): Promise<ServiceResult<GamingTableDTO>>;
  getById(id: string): Promise<ServiceResult<GamingTableDTO>>;
  update(
    id: string,
    data: GamingTableUpdateDTO,
  ): Promise<ServiceResult<GamingTableDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;
  listByCasino(casinoId: string): Promise<ServiceResult<GamingTableDTO[]>>;

  // Game Settings Operations
  applySettings(
    data: ApplySettingsDTO,
  ): Promise<ServiceResult<GamingTableSettingsDTO>>;
  getActiveSettings(
    gamingTableId: string,
  ): Promise<ServiceResult<ActiveSettingsDTO | null>>;
  getSettingsHistory(
    gamingTableId: string,
  ): Promise<ServiceResult<GamingTableSettingsDTO[]>>;
  deactivateSettings(gamingTableId: string): Promise<ServiceResult<void>>;
}

// ============================================================================
// Typed Factory with Explicit Interface Return
// ============================================================================

export function createTableContextService(
  supabase: SupabaseClient<Database>,
): TableContextService {
  const crudService = createTableContextCrudService(supabase);
  const settingsService = createTableContextSettingsService(supabase);

  return {
    // Gaming Table CRUD operations
    ...crudService,
    // Game Settings operations
    ...settingsService,
  };
}

// ============================================================================
// Export Explicit Type - NOT ReturnType
// ============================================================================

export type TableContextServiceType = TableContextService;

// Export DTOs for client usage
export type {
  GamingTableCreateDTO,
  GamingTableUpdateDTO,
  GamingTableDTO,
  ApplySettingsDTO,
  ActiveSettingsDTO,
  GamingTableSettingsDTO,
  GameSettingsDTO,
};
