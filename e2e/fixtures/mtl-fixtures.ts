/**
 * MTL E2E Test Fixtures
 *
 * Test data factories for MTL threshold notification E2E tests.
 * Creates casino, staff, player, visit, and rating slip for testing.
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS10
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

// ============================================================================
// Service Client
// ============================================================================

/**
 * Create Supabase service role client for test setup
 * (bypasses RLS for test data creation)
 */
export function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================================================
// Types
// ============================================================================

export interface MtlTestScenario {
  /** Casino UUID */
  casinoId: string;
  /** Staff UUID */
  staffId: string;
  /** Staff auth user UUID */
  staffUserId: string;
  /** Player/Patron UUID */
  playerId: string;
  /** Table UUID */
  tableId: string;
  /** Visit UUID */
  visitId: string;
  /** Rating slip UUID */
  ratingSlipId: string;
  /** Seat number at table */
  seatNumber: string;
  /** Test user email for authentication */
  testEmail: string;
  /** Test user password */
  testPassword: string;
  /** Auth token for API calls */
  authToken: string;
  /** Gaming day in YYYY-MM-DD format */
  gamingDay: string;
  /** Cleanup function to remove test data */
  cleanup: () => Promise<void>;
}

export interface TestMtlEntry {
  id: string;
  patronUuid: string;
  casinoId: string;
  amount: number;
  direction: string;
  txnType: string;
}

// ============================================================================
// Test Scenario Factory
// ============================================================================

/**
 * Create complete MTL test scenario with all required entities.
 *
 * Creates:
 * - Casino with MTL thresholds
 * - Staff member with admin role
 * - Player/patron
 * - Gaming table
 * - Active visit
 * - Open rating slip at table
 *
 * @returns MtlTestScenario with cleanup function
 */
export async function createMtlTestScenario(): Promise<MtlTestScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();
  const testPrefix = `e2e_mtl_${timestamp}`;
  const gamingDay = new Date().toISOString().split("T")[0];

  // Create casino
  const { data: casino, error: casinoError } = await supabase
    .from("casino")
    .insert({
      name: `${testPrefix}_casino`,
      status: "active",
    })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create casino: ${casinoError?.message}`);
  }

  // Create casino settings for gaming day and MTL thresholds
  const { error: settingsError } = await supabase
    .from("casino_settings")
    .insert({
      casino_id: casino.id,
      gaming_day_start_time: "06:00:00",
      timezone: "America/Los_Angeles",
      watchlist_floor: 3000, // $3,000 watchlist threshold
      ctr_threshold: 10000, // $10,000 CTR threshold
    });

  if (settingsError) {
    throw new Error(
      `Failed to create casino settings: ${settingsError.message}`,
    );
  }

  // Create test user for authentication with app_metadata for RLS
  const testEmail = `${testPrefix}_staff@test.local`;
  const testPassword = `TestPass123!${timestamp}`;

  const { data: authUser, error: authError } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: {
        casino_id: casino.id,
        staff_role: "admin",
      },
    });

  if (authError || !authUser.user) {
    // Cleanup casino
    await supabase.from("casino_settings").delete().eq("casino_id", casino.id);
    await supabase.from("casino").delete().eq("id", casino.id);
    throw new Error(`Failed to create auth user: ${authError?.message}`);
  }

  // Create staff member
  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .insert({
      user_id: authUser.user.id,
      casino_id: casino.id,
      first_name: "MTL",
      last_name: `Test ${timestamp}`,
      email: testEmail,
      role: "admin",
      status: "active",
    })
    .select()
    .single();

  if (staffError || !staff) {
    // Cleanup
    await supabase.auth.admin.deleteUser(authUser.user.id);
    await supabase.from("casino_settings").delete().eq("casino_id", casino.id);
    await supabase.from("casino").delete().eq("id", casino.id);
    throw new Error(`Failed to create staff: ${staffError?.message}`);
  }

  // Update user's app_metadata with staff_id (for RLS context)
  const { error: updateMetadataError } =
    await supabase.auth.admin.updateUserById(authUser.user.id, {
      app_metadata: {
        casino_id: casino.id,
        staff_id: staff.id,
        staff_role: "admin",
      },
    });

  if (updateMetadataError) {
    throw new Error(
      `Failed to update user metadata: ${updateMetadataError.message}`,
    );
  }

  // Create player (global entity, no casino_id)
  const { data: player, error: playerError } = await supabase
    .from("player")
    .insert({
      first_name: "MTL",
      last_name: `Player ${timestamp}`,
    })
    .select()
    .single();

  if (playerError || !player) {
    // Cleanup
    await supabase.from("staff").delete().eq("id", staff.id);
    await supabase.auth.admin.deleteUser(authUser.user.id);
    await supabase.from("casino_settings").delete().eq("casino_id", casino.id);
    await supabase.from("casino").delete().eq("id", casino.id);
    throw new Error(`Failed to create player: ${playerError?.message}`);
  }

  // Link player to casino via player_casino junction table
  const { error: playerCasinoError } = await supabase
    .from("player_casino")
    .insert({
      player_id: player.id,
      casino_id: casino.id,
      status: "active",
    });

  if (playerCasinoError) {
    throw new Error(
      `Failed to link player to casino: ${playerCasinoError.message}`,
    );
  }

  // Create gaming table
  const { data: table, error: tableError } = await supabase
    .from("gaming_table")
    .insert({
      casino_id: casino.id,
      label: `MTL-TEST-${timestamp}`,
      type: "blackjack",
      status: "active",
    })
    .select()
    .single();

  if (tableError || !table) {
    // Cleanup
    await supabase.from("player_casino").delete().eq("player_id", player.id);
    await supabase.from("player").delete().eq("id", player.id);
    await supabase.from("staff").delete().eq("id", staff.id);
    await supabase.auth.admin.deleteUser(authUser.user.id);
    await supabase.from("casino_settings").delete().eq("casino_id", casino.id);
    await supabase.from("casino").delete().eq("id", casino.id);
    throw new Error(`Failed to create table: ${tableError?.message}`);
  }

  // Create visit (visit_group_id is self-reference for new visit group)
  // gaming_day placeholder: trigger trg_visit_gaming_day overwrites this on INSERT
  const visitId = crypto.randomUUID();
  const { data: visit, error: visitError } = await supabase
    .from("visit")
    .insert({
      id: visitId,
      casino_id: casino.id,
      player_id: player.id,
      started_at: new Date().toISOString(),
      visit_kind: "gaming_identified_rated",
      visit_group_id: visitId, // Self-reference for new visit group
      gaming_day: "1970-01-01", // Overwritten by trigger
    })
    .select()
    .single();

  if (visitError || !visit) {
    // Cleanup
    await supabase.from("gaming_table").delete().eq("id", table.id);
    await supabase.from("player_casino").delete().eq("player_id", player.id);
    await supabase.from("player").delete().eq("id", player.id);
    await supabase.from("staff").delete().eq("id", staff.id);
    await supabase.auth.admin.deleteUser(authUser.user.id);
    await supabase.from("casino_settings").delete().eq("casino_id", casino.id);
    await supabase.from("casino").delete().eq("id", casino.id);
    throw new Error(`Failed to create visit: ${visitError?.message}`);
  }

  // Create rating slip with policy_snapshot for loyalty accrual
  const seatNumber = "1";
  const policySnapshot = {
    loyalty: {
      house_edge: 1.5,
      decisions_per_hour: 70,
      points_conversion_rate: 10.0,
      point_multiplier: 1.0,
    },
    game_type: "blackjack",
    captured_at: new Date().toISOString(),
  };

  const { data: ratingSlip, error: slipError } = await supabase
    .from("rating_slip")
    .insert({
      casino_id: casino.id,
      visit_id: visit.id,
      table_id: table.id,
      seat_number: seatNumber,
      start_time: new Date().toISOString(),
      status: "open",
      average_bet: 2500, // $25.00 in cents
      policy_snapshot: policySnapshot,
      accrual_kind: "loyalty",
    })
    .select()
    .single();

  if (slipError || !ratingSlip) {
    // Cleanup
    await supabase.from("visit").delete().eq("id", visit.id);
    await supabase.from("gaming_table").delete().eq("id", table.id);
    await supabase.from("player_casino").delete().eq("player_id", player.id);
    await supabase.from("player").delete().eq("id", player.id);
    await supabase.from("staff").delete().eq("id", staff.id);
    await supabase.auth.admin.deleteUser(authUser.user.id);
    await supabase.from("casino_settings").delete().eq("casino_id", casino.id);
    await supabase.from("casino").delete().eq("id", casino.id);
    throw new Error(`Failed to create rating slip: ${slipError?.message}`);
  }

  // Sign in to get auth token
  const authClient = createClient<Database>(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const { data: session, error: sessionError } =
    await authClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

  if (sessionError || !session.session) {
    throw new Error(`Failed to get auth token: ${sessionError?.message}`);
  }

  const authToken = session.session.access_token;

  // Cleanup function
  const cleanup = async () => {
    const cleanupClient = createServiceClient();

    // Delete in reverse dependency order
    await cleanupClient.from("mtl_entry").delete().eq("casino_id", casino.id);
    await cleanupClient.from("rating_slip").delete().eq("casino_id", casino.id);
    await cleanupClient.from("visit").delete().eq("id", visit.id);
    await cleanupClient
      .from("gaming_table")
      .delete()
      .eq("casino_id", casino.id);
    await cleanupClient
      .from("player_casino")
      .delete()
      .eq("player_id", player.id);
    await cleanupClient.from("player").delete().eq("id", player.id);
    await cleanupClient.from("staff").delete().eq("casino_id", casino.id);
    await cleanupClient
      .from("casino_settings")
      .delete()
      .eq("casino_id", casino.id);
    await cleanupClient.from("casino").delete().eq("id", casino.id);
    await cleanupClient.auth.admin.deleteUser(authUser.user.id);
  };

  return {
    casinoId: casino.id,
    staffId: staff.id,
    staffUserId: authUser.user.id,
    playerId: player.id,
    tableId: table.id,
    visitId: visit.id,
    ratingSlipId: ratingSlip.id,
    seatNumber,
    testEmail,
    testPassword,
    authToken,
    gamingDay,
    cleanup,
  };
}

// ============================================================================
// MTL Entry Factory
// ============================================================================

/**
 * Create test MTL entry for threshold testing.
 *
 * @param scenario - Test scenario with IDs
 * @param amount - Transaction amount (in dollars, not cents)
 * @param direction - 'in' for cash-in, 'out' for cash-out
 * @param txnType - MTL transaction type (default: buy_in)
 * @returns Created MTL entry
 */
export async function createTestMtlEntry(
  scenario: MtlTestScenario,
  amount: number,
  direction: "in" | "out" = "in",
  txnType:
    | "buy_in"
    | "cash_out"
    | "front_money"
    | "marker"
    | "chip_fill" = "buy_in",
): Promise<TestMtlEntry> {
  const supabase = createServiceClient();

  const { data: entry, error } = await supabase
    .from("mtl_entry")
    .insert({
      casino_id: scenario.casinoId,
      patron_uuid: scenario.playerId,
      staff_id: scenario.staffId,
      visit_id: scenario.visitId,
      rating_slip_id: scenario.ratingSlipId,
      amount,
      direction,
      txn_type: txnType,
      source: "table",
      gaming_day: scenario.gamingDay,
      idempotency_key: `test-${Date.now()}-${Math.random()}`,
    })
    .select()
    .single();

  if (error || !entry) {
    throw new Error(`Failed to create MTL entry: ${error?.message}`);
  }

  return {
    id: entry.id,
    patronUuid: entry.patron_uuid,
    casinoId: entry.casino_id,
    amount: entry.amount,
    direction: entry.direction,
    txnType: entry.txn_type,
  };
}

/**
 * Get patron's current daily total from mtl_gaming_day_summary view.
 *
 * @param scenario - Test scenario
 * @returns Object with totalIn and totalOut
 */
export async function getPatronDailyTotal(
  scenario: MtlTestScenario,
): Promise<{ totalIn: number; totalOut: number }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("mtl_gaming_day_summary")
    .select("total_in, total_out")
    .eq("casino_id", scenario.casinoId)
    .eq("patron_uuid", scenario.playerId)
    .eq("gaming_day", scenario.gamingDay)
    .single();

  if (error) {
    // No entries yet
    return { totalIn: 0, totalOut: 0 };
  }

  return {
    totalIn: data?.total_in ?? 0,
    totalOut: data?.total_out ?? 0,
  };
}

/**
 * Get all MTL entries for a patron on gaming day.
 *
 * @param scenario - Test scenario
 * @returns Array of MTL entries
 */
export async function getMtlEntriesForPatron(
  scenario: MtlTestScenario,
): Promise<TestMtlEntry[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("mtl_entry")
    .select("id, patron_uuid, casino_id, amount, direction, txn_type")
    .eq("casino_id", scenario.casinoId)
    .eq("patron_uuid", scenario.playerId)
    .eq("gaming_day", scenario.gamingDay)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get MTL entries: ${error?.message}`);
  }

  return (data ?? []).map((entry) => ({
    id: entry.id,
    patronUuid: entry.patron_uuid,
    casinoId: entry.casino_id,
    amount: entry.amount,
    direction: entry.direction,
    txnType: entry.txn_type,
  }));
}
