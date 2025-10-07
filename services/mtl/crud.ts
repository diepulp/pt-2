/**
 * MTL CRUD Module
 * Following PT-2 canonical service architecture
 *
 * Bounded Context: "What cash transactions require reporting?"
 * Owner: MTLService (Compliance Domain)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

export interface MTLEntryCreateDTO {
  casinoId: string;
  patronId?: string | null;
  personName?: string | null;
  personLastName?: string | null;
  personDescription?: string | null;
  direction: Database["public"]["Enums"]["MtlDirection"];
  area: Database["public"]["Enums"]["MtlArea"];
  tenderType: Database["public"]["Enums"]["TenderType"];
  amount: number;
  tableNumber?: string | null;
  locationNote?: string | null;
  eventTime: string;
  gamingDay: string;
  recordedByEmployeeId: string;
  recordedBySignature: string;
  notes?: string | null;
}

export interface MTLEntryUpdateDTO {
  patronId?: string | null;
  personName?: string | null;
  personLastName?: string | null;
  personDescription?: string | null;
  direction?: Database["public"]["Enums"]["MtlDirection"];
  area?: Database["public"]["Enums"]["MtlArea"];
  tenderType?: Database["public"]["Enums"]["TenderType"];
  amount?: number;
  tableNumber?: string | null;
  locationNote?: string | null;
  eventTime?: string;
  notes?: string | null;
}

export type MTLEntryDTO = Pick<
  Database["public"]["Tables"]["mtl_entry"]["Row"],
  | "id"
  | "casino_id"
  | "patron_id"
  | "person_name"
  | "person_last_name"
  | "person_description"
  | "direction"
  | "area"
  | "tender_type"
  | "amount"
  | "table_number"
  | "location_note"
  | "event_time"
  | "gaming_day"
  | "recorded_by_employee_id"
  | "recorded_by_signature"
  | "notes"
  | "created_at"
  | "updated_at"
>;

export function createMTLCrudService(supabase: SupabaseClient<Database>) {
  return {
    /**
     * Create new MTL entry
     * Maps validation errors and FK violations
     */
    create: async (
      data: MTLEntryCreateDTO,
    ): Promise<ServiceResult<MTLEntryDTO>> => {
      return executeOperation<MTLEntryDTO>("mtl_create", async () => {
        const { data: entry, error } = await supabase
          .from("mtl_entry")
          .insert({
            casino_id: data.casinoId,
            patron_id: data.patronId,
            person_name: data.personName,
            person_last_name: data.personLastName,
            person_description: data.personDescription,
            direction: data.direction,
            area: data.area,
            tender_type: data.tenderType,
            amount: data.amount,
            table_number: data.tableNumber,
            location_note: data.locationNote,
            event_time: data.eventTime,
            gaming_day: data.gamingDay,
            recorded_by_employee_id: data.recordedByEmployeeId,
            recorded_by_signature: data.recordedBySignature,
            notes: data.notes,
          })
          .select(
            `
            id,
            casino_id,
            patron_id,
            person_name,
            person_last_name,
            person_description,
            direction,
            area,
            tender_type,
            amount,
            table_number,
            location_note,
            event_time,
            gaming_day,
            recorded_by_employee_id,
            recorded_by_signature,
            notes,
            created_at,
            updated_at
          `,
          )
          .single();

        if (error) {
          // Foreign key violation - recorded_by_employee_id
          if (error.code === "23503") {
            throw {
              code: "FOREIGN_KEY_VIOLATION",
              message: "Invalid employee or casino reference",
              details: error,
            };
          }

          // Check constraint violations
          if (error.code === "23514") {
            throw {
              code: "VALIDATION_ERROR",
              message:
                "Invalid MTL entry data (check amount > 0, signature not empty)",
              details: error,
            };
          }

          throw error;
        }

        return entry;
      });
    },

    /**
     * Get MTL entry by ID
     */
    getById: async (id: number): Promise<ServiceResult<MTLEntryDTO>> => {
      return executeOperation<MTLEntryDTO>("mtl_getById", async () => {
        const { data: entry, error } = await supabase
          .from("mtl_entry")
          .select(
            `
            id,
            casino_id,
            patron_id,
            person_name,
            person_last_name,
            person_description,
            direction,
            area,
            tender_type,
            amount,
            table_number,
            location_note,
            event_time,
            gaming_day,
            recorded_by_employee_id,
            recorded_by_signature,
            notes,
            created_at,
            updated_at
          `,
          )
          .eq("id", id)
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            throw {
              code: "NOT_FOUND",
              message: `MTL entry ${id} not found`,
              details: error,
            };
          }
          throw error;
        }

        return entry;
      });
    },

    /**
     * Update existing MTL entry
     */
    update: async (
      id: number,
      data: MTLEntryUpdateDTO,
    ): Promise<ServiceResult<MTLEntryDTO>> => {
      return executeOperation<MTLEntryDTO>("mtl_update", async () => {
        const updateData: Record<string, unknown> = {};

        if (data.patronId !== undefined) updateData.patron_id = data.patronId;
        if (data.personName !== undefined)
          updateData.person_name = data.personName;
        if (data.personLastName !== undefined)
          updateData.person_last_name = data.personLastName;
        if (data.personDescription !== undefined)
          updateData.person_description = data.personDescription;
        if (data.direction !== undefined) updateData.direction = data.direction;
        if (data.area !== undefined) updateData.area = data.area;
        if (data.tenderType !== undefined)
          updateData.tender_type = data.tenderType;
        if (data.amount !== undefined) updateData.amount = data.amount;
        if (data.tableNumber !== undefined)
          updateData.table_number = data.tableNumber;
        if (data.locationNote !== undefined)
          updateData.location_note = data.locationNote;
        if (data.eventTime !== undefined)
          updateData.event_time = data.eventTime;
        if (data.notes !== undefined) updateData.notes = data.notes;

        const { data: entry, error } = await supabase
          .from("mtl_entry")
          .update(updateData)
          .eq("id", id)
          .select(
            `
            id,
            casino_id,
            patron_id,
            person_name,
            person_last_name,
            person_description,
            direction,
            area,
            tender_type,
            amount,
            table_number,
            location_note,
            event_time,
            gaming_day,
            recorded_by_employee_id,
            recorded_by_signature,
            notes,
            created_at,
            updated_at
          `,
          )
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            throw {
              code: "NOT_FOUND",
              message: `MTL entry ${id} not found`,
              details: error,
            };
          }
          if (error.code === "23514") {
            throw {
              code: "VALIDATION_ERROR",
              message: "Invalid MTL entry data (check amount > 0)",
              details: error,
            };
          }
          throw error;
        }

        return entry;
      });
    },

    /**
     * Delete MTL entry
     */
    delete: async (id: number): Promise<ServiceResult<void>> => {
      return executeOperation<void>("mtl_delete", async () => {
        const { error } = await supabase
          .from("mtl_entry")
          .delete()
          .eq("id", id);

        if (error) {
          if (error.code === "PGRST116") {
            throw {
              code: "NOT_FOUND",
              message: `MTL entry ${id} not found`,
              details: error,
            };
          }
          throw error;
        }

        return undefined;
      });
    },
  };
}
