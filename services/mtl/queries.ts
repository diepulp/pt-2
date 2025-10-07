/**
 * MTL Queries Module
 * Following PT-2 canonical service architecture
 *
 * Bounded Context: "What cash transactions require reporting?"
 * Owner: MTLService (Compliance Domain)
 *
 * Regulatory Context:
 * - CTR (Currency Transaction Report) threshold: $10,000
 * - Gaming day: Casino-specific (typically 6am-6am)
 * - Aggregation: By patron per gaming day
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

import type { MTLEntryDTO } from "./crud";

export function createMTLQueriesService(supabase: SupabaseClient<Database>) {
  return {
    /**
     * List MTL entries by gaming day
     * Gaming day calculation is handled by DB migration
     */
    listByGamingDay: async (
      gamingDay: string,
      casinoId?: string,
    ): Promise<ServiceResult<MTLEntryDTO[]>> => {
      return executeOperation<MTLEntryDTO[]>(
        "mtl_listByGamingDay",
        async () => {
          let query = supabase
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
            .eq("gaming_day", gamingDay)
            .order("event_time", { ascending: true });

          if (casinoId) {
            query = query.eq("casino_id", casinoId);
          }

          const { data: entries, error } = await query;

          if (error) {
            throw error;
          }

          return entries || [];
        },
      );
    },

    /**
     * List MTL entries by patron
     * Used for patron transaction history and CTR aggregation
     */
    listByPatron: async (
      patronId: string,
      gamingDay?: string,
    ): Promise<ServiceResult<MTLEntryDTO[]>> => {
      return executeOperation<MTLEntryDTO[]>("mtl_listByPatron", async () => {
        let query = supabase
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
          .eq("patron_id", patronId)
          .order("event_time", { ascending: true });

        if (gamingDay) {
          query = query.eq("gaming_day", gamingDay);
        }

        const { data: entries, error } = await query;

        if (error) {
          throw error;
        }

        return entries || [];
      });
    },

    /**
     * Get pending CTR reports
     * Returns entries where patron's daily total meets or exceeds threshold
     *
     * CTR Threshold: $10,000 in cash in or cash out per gaming day
     * Aggregation: By patron per gaming day per direction
     */
    getPendingCTRReports: async (
      gamingDay: string,
      casinoId: string,
      threshold: number = 10000,
    ): Promise<
      ServiceResult<
        Array<{
          patron_id: string;
          person_name: string | null;
          person_last_name: string | null;
          gaming_day: string;
          direction: Database["public"]["Enums"]["MtlDirection"];
          total_amount: number;
          transaction_count: number;
        }>
      >
    > => {
      return executeOperation("mtl_getPendingCTRReports", async () => {
        // Aggregate by patron, gaming day, and direction
        const { data, error } = await supabase
          .from("mtl_entry")
          .select(
            `
            patron_id,
            person_name,
            person_last_name,
            gaming_day,
            direction,
            amount
          `,
          )
          .eq("gaming_day", gamingDay)
          .eq("casino_id", casinoId)
          .not("patron_id", "is", null);

        if (error) {
          throw error;
        }

        // Group by patron + direction and sum amounts
        const aggregated = new Map<
          string,
          {
            patron_id: string;
            person_name: string | null;
            person_last_name: string | null;
            gaming_day: string;
            direction: Database["public"]["Enums"]["MtlDirection"];
            total_amount: number;
            transaction_count: number;
          }
        >();

        for (const entry of data || []) {
          const key = `${entry.patron_id}-${entry.direction}`;
          const existing = aggregated.get(key);

          if (existing) {
            existing.total_amount += Number(entry.amount);
            existing.transaction_count += 1;
          } else {
            aggregated.set(key, {
              patron_id: entry.patron_id!,
              person_name: entry.person_name,
              person_last_name: entry.person_last_name,
              gaming_day: entry.gaming_day,
              direction: entry.direction,
              total_amount: Number(entry.amount),
              transaction_count: 1,
            });
          }
        }

        // Filter by threshold
        const pendingCTRs = Array.from(aggregated.values()).filter(
          (item) => item.total_amount >= threshold,
        );

        return pendingCTRs;
      });
    },

    /**
     * List MTL entries by CTR threshold
     * Returns individual entries that meet or exceed threshold
     */
    listByCTRThreshold: async (
      threshold: number = 10000,
      gamingDay?: string,
    ): Promise<ServiceResult<MTLEntryDTO[]>> => {
      return executeOperation<MTLEntryDTO[]>(
        "mtl_listByCTRThreshold",
        async () => {
          let query = supabase
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
            .gte("amount", threshold)
            .order("event_time", { ascending: true });

          if (gamingDay) {
            query = query.eq("gaming_day", gamingDay);
          }

          const { data: entries, error } = await query;

          if (error) {
            throw error;
          }

          return entries || [];
        },
      );
    },

    /**
     * List MTL entries by area
     * Used for area-specific compliance reporting
     */
    listByArea: async (
      area: Database["public"]["Enums"]["MtlArea"],
      gamingDay?: string,
    ): Promise<ServiceResult<MTLEntryDTO[]>> => {
      return executeOperation<MTLEntryDTO[]>("mtl_listByArea", async () => {
        let query = supabase
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
          .eq("area", area)
          .order("event_time", { ascending: true });

        if (gamingDay) {
          query = query.eq("gaming_day", gamingDay);
        }

        const { data: entries, error } = await query;

        if (error) {
          throw error;
        }

        return entries || [];
      });
    },
  };
}
