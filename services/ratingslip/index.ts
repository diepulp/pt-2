/**
 * RatingSlip Service Factory
 * Following PT-2 canonical service architecture with explicit interfaces
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type { ServiceResult } from "../shared/types";

import { createRatingSlipCrudService } from "./crud";
import type {
  RatingSlipCreateDTO,
  RatingSlipUpdateDTO,
  RatingSlipDTO,
} from "./crud";

// ✅ Explicit interface - NOT ReturnType inference
export interface RatingSlipService {
  create(data: RatingSlipCreateDTO): Promise<ServiceResult<RatingSlipDTO>>;
  getById(id: string): Promise<ServiceResult<RatingSlipDTO>>;
  update(
    id: string,
    data: RatingSlipUpdateDTO,
  ): Promise<ServiceResult<RatingSlipDTO>>;
}

// ✅ Typed factory with explicit interface return
export function createRatingSlipService(
  supabase: SupabaseClient<Database>,
): RatingSlipService {
  const crudService = createRatingSlipCrudService(supabase);

  return {
    ...crudService,
  };
}

// ✅ Export explicit type
export type RatingSlipServiceType = RatingSlipService;
export type { RatingSlipCreateDTO, RatingSlipUpdateDTO, RatingSlipDTO };
