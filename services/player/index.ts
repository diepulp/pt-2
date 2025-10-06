/**
 * Player Service Factory
 * Following PT-2 canonical service architecture with explicit interfaces
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type { ServiceResult } from "../shared/types";

import { createPlayerCrudService } from "./crud";
import type { PlayerCreateDTO, PlayerUpdateDTO, PlayerDTO } from "./crud";

// ✅ Explicit interface - NOT ReturnType inference
export interface PlayerService {
  create(data: PlayerCreateDTO): Promise<ServiceResult<PlayerDTO>>;
  getById(id: string): Promise<ServiceResult<PlayerDTO>>;
  update(id: string, data: PlayerUpdateDTO): Promise<ServiceResult<PlayerDTO>>;
}

// ✅ Typed factory with explicit interface return
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerService {
  const crudService = createPlayerCrudService(supabase);

  return {
    ...crudService,
  };
}

// ✅ Export explicit type
export type PlayerServiceType = PlayerService;
export type { PlayerCreateDTO, PlayerUpdateDTO, PlayerDTO };
