/**
 * Casino Service Factory
 * Following PT-2 canonical service architecture with explicit interfaces
 * Bounded Context: "Where is this happening?" (Location Domain)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type { ServiceResult } from "../shared/types";

import { createCasinoCrudService } from "./crud";
import type { CasinoCreateDTO, CasinoUpdateDTO, CasinoDTO } from "./crud";

// ✅ Explicit interface - NOT ReturnType inference
export interface CasinoService {
  create(data: CasinoCreateDTO): Promise<ServiceResult<CasinoDTO>>;
  getById(id: string): Promise<ServiceResult<CasinoDTO>>;
  update(id: string, data: CasinoUpdateDTO): Promise<ServiceResult<CasinoDTO>>;
  delete(id: string): Promise<ServiceResult<void>>;
  list(): Promise<ServiceResult<CasinoDTO[]>>;
  listByCompany(companyId: string): Promise<ServiceResult<CasinoDTO[]>>;
}

// ✅ Typed factory with explicit interface return
export function createCasinoService(
  supabase: SupabaseClient<Database>,
): CasinoService {
  const crudService = createCasinoCrudService(supabase);

  return {
    ...crudService,
  };
}

// ✅ Export explicit type
export type CasinoServiceType = CasinoService;
export type { CasinoCreateDTO, CasinoUpdateDTO, CasinoDTO };
