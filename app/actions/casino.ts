"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

// DTOs using Pick/Omit from Database types (Pattern B requirement)
type CasinoRow = Database["public"]["Tables"]["casino"]["Row"];
type CasinoInsert = Database["public"]["Tables"]["casino"]["Insert"];
type CasinoUpdate = Database["public"]["Tables"]["casino"]["Update"];
type StaffRow = Database["public"]["Tables"]["staff"]["Row"];
type CasinoSettingsRow = Database["public"]["Tables"]["casino_settings"]["Row"];

export type CasinoDTO = Pick<
  CasinoRow,
  | "id"
  | "name"
  | "location"
  | "address"
  | "status"
  | "company_id"
  | "created_at"
>;
export type CasinoCreateDTO = Pick<
  CasinoInsert,
  "name" | "location" | "address" | "company_id" | "status"
>;
export type CasinoUpdateDTO = Partial<
  Pick<CasinoUpdate, "name" | "location" | "address" | "company_id" | "status">
>;
export type StaffDTO = Pick<
  StaffRow,
  | "id"
  | "employee_id"
  | "first_name"
  | "last_name"
  | "email"
  | "role"
  | "status"
  | "casino_id"
>;
export type CasinoSettingsDTO = Pick<
  CasinoSettingsRow,
  | "id"
  | "casino_id"
  | "gaming_day_start_time"
  | "timezone"
  | "watchlist_floor"
  | "ctr_threshold"
>;

// ============================================================================
// Casino CRUD Operations
// ============================================================================

export async function getCasinos(options?: {
  limit?: number;
  cursor?: string;
  status?: "active" | "inactive";
}): Promise<{ casinos: CasinoDTO[]; nextCursor?: string }> {
  const supabase = await createClient();
  const limit = options?.limit ?? 50;

  let query = supabase
    .from("casino")
    .select("id, name, location, address, status, company_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.cursor) {
    query = query.lt("created_at", options.cursor);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch casinos: ${error.message}`);

  const casinos = (data ?? []).slice(0, limit);
  const hasMore = (data?.length ?? 0) > limit;

  return {
    casinos,
    nextCursor: hasMore ? data?.[limit - 1]?.created_at : undefined,
  };
}

export async function getCasinoById(id: string): Promise<CasinoDTO | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("casino")
    .select("id, name, location, address, status, company_id, created_at")
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to fetch casino: ${error.message}`);
  }
  return data;
}

export async function createCasino(input: CasinoCreateDTO): Promise<CasinoDTO> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("casino")
    .insert({
      name: input.name,
      location: input.location,
      address: input.address,
      company_id: input.company_id,
      status: input.status ?? "active",
    })
    .select("id, name, location, address, status, company_id, created_at")
    .single();

  if (error) throw new Error(`Failed to create casino: ${error.message}`);

  revalidatePath("/casinos");
  return data;
}

export async function updateCasino(
  id: string,
  input: CasinoUpdateDTO,
): Promise<CasinoDTO> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("casino")
    .update(input)
    .eq("id", id)
    .select("id, name, location, address, status, company_id, created_at")
    .single();

  if (error) throw new Error(`Failed to update casino: ${error.message}`);

  revalidatePath("/casinos");
  revalidatePath(`/casinos/${id}`);
  return data;
}

export async function deleteCasino(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("casino").delete().eq("id", id);

  if (error) throw new Error(`Failed to delete casino: ${error.message}`);

  revalidatePath("/casinos");
}

// ============================================================================
// Staff Operations
// ============================================================================

export async function getStaffByCasino(casinoId: string): Promise<StaffDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .select(
      "id, employee_id, first_name, last_name, email, role, status, casino_id",
    )
    .eq("casino_id", casinoId)
    .eq("status", "active");

  if (error) throw new Error(`Failed to fetch staff: ${error.message}`);
  return data ?? [];
}

// ============================================================================
// Settings Operations
// ============================================================================

export async function getCasinoSettings(
  casinoId: string,
): Promise<CasinoSettingsDTO | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("casino_settings")
    .select(
      "id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold",
    )
    .eq("casino_id", casinoId)
    .single();

  if (error && error.code !== "PGRST116")
    throw new Error(`Failed to fetch settings: ${error.message}`);
  return data;
}

// ============================================================================
// Gaming Day Computation
// ============================================================================

export async function computeGamingDay(
  casinoId: string,
  timestamp?: Date,
): Promise<string> {
  const settings = await getCasinoSettings(casinoId);
  if (!settings)
    throw new Error(`Casino settings not found for casino ${casinoId}`);

  const targetTime = timestamp ?? new Date();
  const gamingDayStart = settings.gaming_day_start_time;
  const tz = settings.timezone;

  const localTime = new Date(
    targetTime.toLocaleString("en-US", { timeZone: tz }),
  );
  const [hours, minutes] = gamingDayStart.split(":").map(Number);
  const gamingDayStartMinutes = hours * 60 + minutes;
  const currentMinutes = localTime.getHours() * 60 + localTime.getMinutes();

  const gamingDay = new Date(localTime);
  if (currentMinutes < gamingDayStartMinutes) {
    gamingDay.setDate(gamingDay.getDate() - 1);
  }

  return gamingDay.toISOString().split("T")[0];
}
