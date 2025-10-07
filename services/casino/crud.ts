/**
 * Casino CRUD Module
 * Following PT-2 canonical service architecture
 * Bounded Context: "Where is this happening?" (Location Domain)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

// ✅ DTOs using Pick from Database types (single source of truth)
export interface CasinoCreateDTO {
  name: string;
  location: string;
  company_id?: string | null;
}

export interface CasinoUpdateDTO {
  name?: string;
  location?: string;
  company_id?: string | null;
}

export type CasinoDTO = Pick<
  Database["public"]["Tables"]["casino"]["Row"],
  "id" | "name" | "location" | "company_id"
>;

export function createCasinoCrudService(supabase: SupabaseClient<Database>) {
  return {
    create: async (
      data: CasinoCreateDTO,
    ): Promise<ServiceResult<CasinoDTO>> => {
      return executeOperation<CasinoDTO>("create_casino", async () => {
        const { data: casino, error } = await supabase
          .from("casino")
          .insert({
            name: data.name,
            location: data.location,
            company_id: data.company_id,
          })
          .select("id, name, location, company_id")
          .single();

        if (error) {
          // Foreign key violation - invalid company_id
          if (error.code === "23503") {
            throw {
              code: "FOREIGN_KEY_VIOLATION",
              message: "Invalid company_id: company does not exist",
              details: error,
            };
          }
          // Unique constraint violation - duplicate name/location
          if (error.code === "23505") {
            throw {
              code: "DUPLICATE_CASINO",
              message: "A casino with this name and location already exists",
              details: error,
            };
          }
          throw error;
        }

        return casino;
      });
    },

    getById: async (id: string): Promise<ServiceResult<CasinoDTO>> => {
      return executeOperation<CasinoDTO>("get_casino_by_id", async () => {
        const { data: casino, error } = await supabase
          .from("casino")
          .select("id, name, location, company_id")
          .eq("id", id)
          .single();

        if (error) {
          // Not found error
          if (error.code === "PGRST116") {
            throw {
              code: "NOT_FOUND",
              message: "Casino not found",
              details: error,
            };
          }
          throw error;
        }

        return casino;
      });
    },

    update: async (
      id: string,
      data: CasinoUpdateDTO,
    ): Promise<ServiceResult<CasinoDTO>> => {
      return executeOperation<CasinoDTO>("update_casino", async () => {
        const updateData: Partial<CasinoUpdateDTO> = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.location !== undefined) updateData.location = data.location;
        if (data.company_id !== undefined)
          updateData.company_id = data.company_id;

        const { data: casino, error } = await supabase
          .from("casino")
          .update(updateData)
          .eq("id", id)
          .select("id, name, location, company_id")
          .single();

        if (error) {
          // Not found error
          if (error.code === "PGRST116") {
            throw {
              code: "NOT_FOUND",
              message: "Casino not found",
              details: error,
            };
          }
          // Foreign key violation - invalid company_id
          if (error.code === "23503") {
            throw {
              code: "FOREIGN_KEY_VIOLATION",
              message: "Invalid company_id: company does not exist",
              details: error,
            };
          }
          // Unique constraint violation
          if (error.code === "23505") {
            throw {
              code: "DUPLICATE_CASINO",
              message: "A casino with this name and location already exists",
              details: error,
            };
          }
          throw error;
        }

        return casino;
      });
    },

    delete: async (id: string): Promise<ServiceResult<void>> => {
      return executeOperation<void>("delete_casino", async () => {
        const { error } = await supabase.from("casino").delete().eq("id", id);

        if (error) {
          // Foreign key constraint - casino referenced by other tables
          if (error.code === "23503") {
            throw {
              code: "FOREIGN_KEY_VIOLATION",
              message:
                "Cannot delete casino: referenced by visits, gaming tables, or other entities",
              details: error,
            };
          }
          throw error;
        }

        return undefined;
      });
    },

    list: async (): Promise<ServiceResult<CasinoDTO[]>> => {
      return executeOperation<CasinoDTO[]>("list_casinos", async () => {
        const { data: casinos, error } = await supabase
          .from("casino")
          .select("id, name, location, company_id")
          .order("name");

        if (error) {
          throw error;
        }

        return casinos || [];
      });
    },

    listByCompany: async (
      companyId: string,
    ): Promise<ServiceResult<CasinoDTO[]>> => {
      return executeOperation<CasinoDTO[]>(
        "list_casinos_by_company",
        async () => {
          const { data: casinos, error } = await supabase
            .from("casino")
            .select("id, name, location, company_id")
            .eq("company_id", companyId)
            .order("name");

          if (error) {
            throw error;
          }

          return casinos || [];
        },
      );
    },
  };
}
