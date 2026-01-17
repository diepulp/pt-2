/**
 * Rating Slip Modal E2E Test Fixtures
 *
 * Extended fixtures for testing the rating slip modal workflows (PRD-008).
 * Builds on the base test-data.ts with rating slip specific data.
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see e2e/workflows/rating-slip-modal.spec.ts
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/** Game type enum from database */
type GameType = Database["public"]["Enums"]["game_type"];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

/**
 * Creates a service role client for test data setup/teardown
 * WARNING: Bypasses RLS - use only in tests
 */
function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Extended test scenario with rating slip data for modal testing
 */
export interface RatingSlipTestScenario {
  // Base entities
  casinoId: string;
  staffId: string;
  staffUserId: string;
  playerId: string;
  tableId: string;
  visitId: string;
  authToken: string;

  // Rating slip specific
  ratingSlipId: string;
  seatNumber: string;

  // Secondary table for move tests
  secondaryTableId: string;

  // Test credentials for browser auth
  testEmail: string;
  testPassword: string;

  // Cleanup function
  cleanup: () => Promise<void>;
}

/**
 * Creates a complete test scenario for rating slip modal testing.
 *
 * Includes:
 * - Casino with gaming day settings
 * - Staff user with admin role
 * - Player with loyalty account
 * - Primary table (active)
 * - Secondary table (active, for move tests)
 * - Active visit
 * - Open rating slip at seat 1
 */
export async function createRatingSlipTestScenario(): Promise<RatingSlipTestScenario> {
  const supabase = createServiceClient();
  const timestamp = Date.now();
  const testPrefix = `e2e_modal_${timestamp}`;

  // Create test casino
  const { data: casino, error: casinoError } = await supabase
    .from("casino")
    .insert({
      name: `${testPrefix}_casino`,
      status: "active",
    })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create test casino: ${casinoError?.message}`);
  }

  // Create casino settings for gaming day
  const { error: settingsError } = await supabase
    .from("casino_settings")
    .insert({
      casino_id: casino.id,
      gaming_day_start_time: "06:00:00",
      timezone: "America/Los_Angeles",
    });

  if (settingsError) {
    throw new Error(
      `Failed to create casino settings: ${settingsError.message}`,
    );
  }

  // Create test auth user with app_metadata for RLS (ADR-015 Pattern C)
  const testEmail = `${testPrefix}_staff@test.com`;
  const testPassword = "TestPassword123!";

  const { data: authData, error: authCreateError } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: {
        casino_id: casino.id,
        staff_role: "admin",
      },
    });

  if (authCreateError || !authData.user) {
    throw new Error(
      `Failed to create test auth user: ${authCreateError?.message}`,
    );
  }

  // Create test staff user (admin role for full access)
  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .insert({
      casino_id: casino.id,
      user_id: authData.user.id,
      first_name: "Test",
      last_name: "PitBoss",
      email: testEmail,
      role: "admin",
      status: "active",
    })
    .select()
    .single();

  if (staffError || !staff) {
    throw new Error(`Failed to create test staff: ${staffError?.message}`);
  }

  // Update user's app_metadata with staff_id (for RLS context)
  const { error: updateMetadataError } =
    await supabase.auth.admin.updateUserById(authData.user.id, {
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

  // Sign in to get auth token (use separate client to preserve service role)
  const authClient = createClient<Database>(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const { data: signInData, error: signInError } =
    await authClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  }

  // Create test player (global entity, no casino_id)
  // Continue using service role client for data setup
  const { data: player, error: playerError } = await supabase
    .from("player")
    .insert({
      first_name: "John",
      last_name: "TestPlayer",
    })
    .select()
    .single();

  if (playerError || !player) {
    throw new Error(`Failed to create test player: ${playerError?.message}`);
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

  // Create player loyalty account
  const { error: loyaltyError } = await supabase.from("player_loyalty").insert({
    player_id: player.id,
    casino_id: casino.id,
    current_balance: 500, // Start with some points
    tier: "gold",
  });

  if (loyaltyError) {
    // Loyalty table may not exist yet, non-blocking for basic tests
    console.warn(`Could not create loyalty account: ${loyaltyError.message}`);
  }

  // Create primary test table (active)
  // Note: min_bet/max_bet are in table_settings, not gaming_table
  const { data: table, error: tableError } = await supabase
    .from("gaming_table")
    .insert({
      casino_id: casino.id,
      label: "BJ-01",
      type: "blackjack",
      status: "active",
    })
    .select()
    .single();

  if (tableError || !table) {
    throw new Error(`Failed to create test table: ${tableError?.message}`);
  }

  // Create secondary table (active, for move tests)
  const { data: secondaryTable, error: secondaryTableError } = await supabase
    .from("gaming_table")
    .insert({
      casino_id: casino.id,
      label: "BJ-02",
      type: "blackjack",
      status: "active",
    })
    .select()
    .single();

  if (secondaryTableError || !secondaryTable) {
    throw new Error(
      `Failed to create secondary table: ${secondaryTableError?.message}`,
    );
  }

  // Create test visit (active)
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
    throw new Error(`Failed to create test visit: ${visitError?.message}`);
  }

  // Create rating slip (open status, at seat 1)
  // Include policy_snapshot with loyalty for accrual_kind='loyalty' constraint
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
      average_bet: 2500, // $25.00 in cents
      status: "open",
      start_time: new Date().toISOString(),
      policy_snapshot: policySnapshot,
      accrual_kind: "loyalty", // Enable loyalty accrual
    })
    .select()
    .single();

  if (slipError || !ratingSlip) {
    throw new Error(`Failed to create test rating slip: ${slipError?.message}`);
  }

  // Cleanup function to remove all test data
  const cleanup = async () => {
    const cleanupClient = createServiceClient();

    // Delete in reverse dependency order
    await cleanupClient
      .from("rating_slip_pause")
      .delete()
      .eq("slip_id", ratingSlip.id);
    await cleanupClient.from("rating_slip").delete().eq("casino_id", casino.id);
    await cleanupClient
      .from("player_financial_transaction")
      .delete()
      .eq("casino_id", casino.id);
    await cleanupClient
      .from("loyalty_ledger")
      .delete()
      .eq("casino_id", casino.id);
    await cleanupClient
      .from("player_loyalty")
      .delete()
      .eq("casino_id", casino.id);
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
    await cleanupClient.from("staff").delete().eq("id", staff.id);
    await cleanupClient
      .from("casino_settings")
      .delete()
      .eq("casino_id", casino.id);
    await cleanupClient.from("casino").delete().eq("id", casino.id);

    // Delete auth user
    await cleanupClient.auth.admin.deleteUser(authData.user.id);
  };

  return {
    casinoId: casino.id,
    staffId: staff.id,
    staffUserId: authData.user.id,
    playerId: player.id,
    tableId: table.id,
    visitId: visit.id,
    authToken: signInData.session.access_token,
    ratingSlipId: ratingSlip.id,
    seatNumber,
    secondaryTableId: secondaryTable.id,
    testEmail,
    testPassword,
    cleanup,
  };
}

/**
 * Creates a financial transaction for testing financial summary display.
 */
export async function createTestTransaction(
  casinoId: string,
  visitId: string,
  playerId: string,
  staffId: string,
  direction: "in" | "out",
  amount: number, // in cents
  tenderType: "cash" | "chips" | "marker" = "cash",
) {
  const supabase = createServiceClient();
  const timestamp = Date.now();

  const { data, error } = await supabase
    .from("player_financial_transaction")
    .insert({
      casino_id: casinoId,
      visit_id: visitId,
      player_id: playerId,
      created_by_staff_id: staffId,
      direction,
      amount,
      tender_type: tenderType,
      source: "pit",
      idempotency_key: `e2e_txn_${timestamp}`,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test transaction: ${error.message}`);
  }

  return data;
}

/**
 * Gets the current status of a rating slip.
 */
export async function getRatingSlipStatus(slipId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("rating_slip")
    .select("id, status, average_bet, seat_number, table_id, visit_id")
    .eq("id", slipId)
    .single();

  if (error) {
    throw new Error(`Failed to get rating slip: ${error.message}`);
  }

  return data;
}

/**
 * Gets all rating slips for a visit (for move tests).
 */
export async function getRatingSlipsForVisit(visitId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("rating_slip")
    .select("id, status, average_bet, seat_number, table_id, visit_id")
    .eq("visit_id", visitId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get rating slips: ${error.message}`);
  }

  return data;
}

/**
 * Gets financial transactions for a visit (for verification).
 */
export async function getTransactionsForVisit(visitId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("player_financial_transaction")
    .select("id, direction, amount, tender_type, source")
    .eq("visit_id", visitId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get transactions: ${error.message}`);
  }

  return data;
}

// === Loyalty Verification Helpers (ISSUE-47B1DFF1) ===

/**
 * Gets loyalty ledger entries for a player.
 * Used to verify accrual occurred after rating slip close.
 *
 * @see ISSUE-47B1DFF1 Loyalty accrual integration
 */
export async function getLoyaltyLedgerForPlayer(
  playerId: string,
  casinoId: string,
) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("loyalty_ledger")
    .select(
      "id, player_id, casino_id, rating_slip_id, visit_id, points_delta, reason, metadata, created_at",
    )
    .eq("player_id", playerId)
    .eq("casino_id", casinoId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get loyalty ledger: ${error.message}`);
  }

  // Extract theo from metadata for convenience
  return data.map((entry) => ({
    ...entry,
    theo: (entry.metadata as Record<string, unknown>)?.theo as
      | number
      | undefined,
  }));
}

/**
 * Gets loyalty ledger entries for a specific rating slip.
 * Used to verify accrual is linked to the correct slip.
 */
export async function getLoyaltyLedgerForSlip(ratingSlipId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("loyalty_ledger")
    .select(
      "id, player_id, casino_id, rating_slip_id, visit_id, points_delta, reason, metadata, created_at",
    )
    .eq("rating_slip_id", ratingSlipId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get loyalty ledger for slip: ${error.message}`);
  }

  // Extract theo from metadata for convenience
  return data.map((entry) => ({
    ...entry,
    theo: (entry.metadata as Record<string, unknown>)?.theo as
      | number
      | undefined,
  }));
}

/**
 * Gets player loyalty balance and tier.
 * Used to verify balance increased after accrual.
 */
export async function getPlayerLoyaltyBalance(
  playerId: string,
  casinoId: string,
) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("player_loyalty")
    .select("player_id, casino_id, current_balance, tier, updated_at")
    .eq("player_id", playerId)
    .eq("casino_id", casinoId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows (player may not have loyalty record yet)
    throw new Error(`Failed to get player loyalty: ${error.message}`);
  }

  return data;
}

/**
 * Creates or ensures player_loyalty record exists.
 * Required for accrual to work (rpc_accrue_on_close requires existing record).
 */
export async function ensurePlayerLoyaltyRecord(
  playerId: string,
  casinoId: string,
  initialBalance: number = 0,
) {
  const supabase = createServiceClient();

  // Try to insert, ignore if already exists (upsert pattern)
  const { error } = await supabase.from("player_loyalty").upsert(
    {
      player_id: playerId,
      casino_id: casinoId,
      current_balance: initialBalance,
      tier: "bronze",
    },
    {
      onConflict: "player_id,casino_id",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    throw new Error(`Failed to ensure player loyalty record: ${error.message}`);
  }
}

/**
 * Creates game_settings for a casino (required for policy_snapshot).
 * The rating slip needs policy_snapshot.loyalty to be populated for accrual to work.
 */
export async function ensureGameSettings(
  casinoId: string,
  gameType: GameType = "blackjack",
) {
  const supabase = createServiceClient();

  const { error } = await supabase.from("game_settings").upsert(
    {
      casino_id: casinoId,
      game_type: gameType,
      name: `${gameType} Standard`, // Required field
      house_edge: 1.5, // 1.5%
      decisions_per_hour: 70,
      points_conversion_rate: 10.0,
      point_multiplier: 1.0,
      seats_available: 7,
    },
    {
      onConflict: "casino_id,game_type",
      ignoreDuplicates: false, // Always update if exists
    },
  );

  if (error) {
    throw new Error(`Failed to ensure game settings: ${error.message}`);
  }
}

/**
 * Creates a policy_snapshot object for rating slip creation.
 * Required when accrual_kind = 'loyalty' per chk_policy_snapshot_if_loyalty constraint.
 */
export function createPolicySnapshot(gameType: GameType = "blackjack") {
  return {
    loyalty: {
      house_edge: 1.5,
      decisions_per_hour: 70,
      points_conversion_rate: 10.0,
      point_multiplier: 1.0,
    },
    game_type: gameType,
    captured_at: new Date().toISOString(),
  };
}
