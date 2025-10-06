/**
 * Visit Service Factory
 * Following PT-2 canonical service architecture with explicit interfaces
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type { ServiceResult } from "../shared/types";

import { createVisitCrudService } from "./crud";
import type { VisitCreateDTO, VisitUpdateDTO, VisitDTO } from "./crud";

// ✅ Explicit interface - NOT ReturnType inference
export interface VisitService {
  create(data: VisitCreateDTO): Promise<ServiceResult<VisitDTO>>;
  getById(id: string): Promise<ServiceResult<VisitDTO>>;
  update(id: string, data: VisitUpdateDTO): Promise<ServiceResult<VisitDTO>>;
}

// ✅ Typed factory with explicit interface return
export function createVisitService(
  supabase: SupabaseClient<Database>,
): VisitService {
  const crudService = createVisitCrudService(supabase);

  return {
    ...crudService,
  };
}

// ✅ Export explicit type
export type VisitServiceType = VisitService;
export type { VisitCreateDTO, VisitUpdateDTO, VisitDTO };
