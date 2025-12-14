/**
 * FloorLayoutService CRUD Operations
 *
 * Database operations for floor layout management.
 * Pattern B: Canonical CRUD with select projections and mappers.
 *
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section 1580-1719
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import type {
  FloorLayoutDTO,
  FloorLayoutListFilters,
  FloorLayoutVersionDTO,
  FloorLayoutVersionFilters,
  FloorLayoutVersionWithSlotsDTO,
} from "./dtos";
import {
  toFloorLayoutDTO,
  toFloorLayoutDTOList,
  toFloorLayoutVersionDTO,
  toFloorLayoutVersionDTOList,
  toFloorLayoutVersionWithSlotsDTO,
  toFloorPitDTOList,
  toFloorTableSlotDTOList,
} from "./mappers";

// === Layout CRUD ===

/**
 * List floor layouts with pagination.
 */
export async function listLayouts(
  supabase: SupabaseClient<Database>,
  filters: FloorLayoutListFilters,
): Promise<{ items: FloorLayoutDTO[]; cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from("floor_layout")
    .select("*")
    .eq("casino_id", filters.casino_id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.cursor) {
    query = query.lt("created_at", filters.cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  const items = toFloorLayoutDTOList(data);
  const nextCursor =
    items.length === limit ? items[items.length - 1]?.created_at : null;

  return { items, cursor: nextCursor ?? null };
}

/**
 * Get a floor layout by ID.
 */
export async function getLayoutById(
  supabase: SupabaseClient<Database>,
  layoutId: string,
): Promise<FloorLayoutDTO | null> {
  const { data, error } = await supabase
    .from("floor_layout")
    .select("*")
    .eq("id", layoutId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return toFloorLayoutDTO(data);
}

// === Version CRUD ===

/**
 * List versions for a layout.
 */
export async function listVersions(
  supabase: SupabaseClient<Database>,
  filters: FloorLayoutVersionFilters,
): Promise<{
  items: FloorLayoutVersionDTO[] | FloorLayoutVersionWithSlotsDTO[];
}> {
  let query = supabase
    .from("floor_layout_version")
    .select("*")
    .eq("layout_id", filters.layout_id)
    .order("version_no", { ascending: false });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;

  const versions = toFloorLayoutVersionDTOList(data);
  const includeSlots = filters.include_slots ?? false;

  if (!includeSlots || versions.length === 0) {
    return { items: versions };
  }

  // Fetch pits and slots for all versions
  const versionIds = versions.map((v) => v.id);

  const [pitsResult, slotsResult] = await Promise.all([
    supabase.from("floor_pit").select("*").in("layout_version_id", versionIds),
    supabase
      .from("floor_table_slot")
      .select("*")
      .in("layout_version_id", versionIds),
  ]);

  if (pitsResult.error) throw pitsResult.error;
  if (slotsResult.error) throw slotsResult.error;

  const pits = toFloorPitDTOList(pitsResult.data);
  const slots = toFloorTableSlotDTOList(slotsResult.data);

  // Group by version
  const pitsByVersion = new Map<string, typeof pits>();
  pits.forEach((pit) => {
    const list = pitsByVersion.get(pit.layout_version_id) ?? [];
    list.push(pit);
    pitsByVersion.set(pit.layout_version_id, list);
  });

  const slotsByVersion = new Map<string, typeof slots>();
  slots.forEach((slot) => {
    const list = slotsByVersion.get(slot.layout_version_id) ?? [];
    list.push(slot);
    slotsByVersion.set(slot.layout_version_id, list);
  });

  const enriched: FloorLayoutVersionWithSlotsDTO[] = versions.map((version) =>
    toFloorLayoutVersionWithSlotsDTO(
      version,
      pitsByVersion.get(version.id) ?? [],
      slotsByVersion.get(version.id) ?? [],
    ),
  );

  return { items: enriched };
}

/**
 * Get a version by ID.
 */
export async function getVersionById(
  supabase: SupabaseClient<Database>,
  versionId: string,
): Promise<FloorLayoutVersionDTO | null> {
  const { data, error } = await supabase
    .from("floor_layout_version")
    .select("*")
    .eq("id", versionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return toFloorLayoutVersionDTO(data);
}

// === Activation CRUD ===

/**
 * Get active floor layout for a casino.
 * Returns the currently activated layout.
 */
export async function getActiveLayout(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<import("./dtos").FloorLayoutActivationDTO | null> {
  const { data, error } = await supabase
    .from("floor_layout_activation")
    .select("*")
    .eq("casino_id", casinoId)
    .is("deactivated_at", null)
    .order("activated_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data;
}
