/**
 * MTL Service Entry Point
 * Following PT-2 canonical service architecture
 *
 * Bounded Context: Compliance Domain
 * Responsibility: Track cash transactions requiring regulatory reporting (CTR/MTL)
 *
 * Regulatory Context:
 * - Multiple Transaction Log (MTL) for AML/BSA compliance
 * - Currency Transaction Report (CTR) threshold: $10,000
 * - Gaming day: Casino-specific calculation (typically 6am-6am)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type { ServiceResult } from "../shared/types";

import { createMTLCrudService } from "./crud";
import type { MTLEntryCreateDTO, MTLEntryUpdateDTO, MTLEntryDTO } from "./crud";
import { createMTLQueriesService } from "./queries";

// ✅ Explicit interface - NOT ReturnType inference
export interface MTLService {
  // CRUD operations
  create(data: MTLEntryCreateDTO): Promise<ServiceResult<MTLEntryDTO>>;
  getById(id: number): Promise<ServiceResult<MTLEntryDTO>>;
  update(
    id: number,
    data: MTLEntryUpdateDTO,
  ): Promise<ServiceResult<MTLEntryDTO>>;
  delete(id: number): Promise<ServiceResult<void>>;

  // Query operations
  listByGamingDay(
    gamingDay: string,
    casinoId?: string,
  ): Promise<ServiceResult<MTLEntryDTO[]>>;
  listByPatron(
    patronId: string,
    gamingDay?: string,
  ): Promise<ServiceResult<MTLEntryDTO[]>>;
  getPendingCTRReports(
    gamingDay: string,
    casinoId: string,
    threshold?: number,
  ): Promise<
    ServiceResult<
      Array<{
        patron_uuid: string;
        person_name: string | null;
        person_last_name: string | null;
        gaming_day: string;
        direction: Database["public"]["Enums"]["MtlDirection"];
        total_amount: number;
        transaction_count: number;
      }>
    >
  >;
  listByCTRThreshold(
    threshold?: number,
    gamingDay?: string,
  ): Promise<ServiceResult<MTLEntryDTO[]>>;
  listByArea(
    area: Database["public"]["Enums"]["MtlArea"],
    gamingDay?: string,
  ): Promise<ServiceResult<MTLEntryDTO[]>>;
}

// ✅ Typed factory with explicit interface return
export function createMTLService(
  supabase: SupabaseClient<Database>,
): MTLService {
  const crudService = createMTLCrudService(supabase);
  const queriesService = createMTLQueriesService(supabase);

  return {
    ...crudService,
    ...queriesService,
  };
}

// ✅ Export explicit type
export type MTLServiceType = MTLService;
export type { MTLEntryCreateDTO, MTLEntryUpdateDTO, MTLEntryDTO } from "./crud";
