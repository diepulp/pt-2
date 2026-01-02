/**
 * Loyalty Accrual API Tests (Simplified)
 *
 * Uses seed data from Casino 1 to test the loyalty accrual flow.
 * This avoids the complexity of creating test users and dealing with RLS.
 *
 * Prerequisites:
 * - Database seeded with seed.sql
 * - Dev server running
 *
 * @see ISSUE-47B1DFF1 Loyalty accrual never called on rating slip close
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Dev auth credentials from seed data
const DEV_USER_EMAIL = "pitboss@dev.local";
const DEV_USER_PASSWORD = "devpass123";

// Seed data IDs from supabase/seed.sql
const SEED_CASINO_ID = "ca000000-0000-0000-0000-000000000001";
const SEED_STAFF_ID = "5a000000-0000-0000-0000-000000000001"; // Marcus Thompson
const SEED_TABLE_ID = "6a000000-0000-0000-0000-000000000003"; // RL-01 (less likely to have active slips)

function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getDevAuthToken(): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: DEV_USER_EMAIL,
    password: DEV_USER_PASSWORD,
  });

  if (error || !data.session) {
    throw new Error(`Failed to get dev auth token: ${error?.message}`);
  }

  return data.session.access_token;
}

test.describe("Loyalty Accrual API (ISSUE-47B1DFF1)", () => {
  test("closing rating slip creates loyalty_ledger entry", async () => {
    const supabase = createServiceClient();
    const timestamp = Date.now();

    // === SETUP: Create test data using seed casino ===

    // 1. Create player
    const { data: player, error: playerError } = await supabase
      .from("player")
      .insert({ first_name: "Test", last_name: `Player_${timestamp}` })
      .select()
      .single();

    if (playerError) throw new Error(`Create player: ${playerError.message}`);

    // 2. Link player to casino
    await supabase.from("player_casino").insert({
      player_id: player.id,
      casino_id: SEED_CASINO_ID,
      status: "active",
    });

    // 3. Ensure player_loyalty record
    await supabase.from("player_loyalty").upsert(
      {
        player_id: player.id,
        casino_id: SEED_CASINO_ID,
        current_balance: 0,
        tier: "bronze",
      },
      { onConflict: "player_id,casino_id", ignoreDuplicates: true },
    );

    // 4. Create visit
    const visitId = crypto.randomUUID();
    const { data: visit, error: visitError } = await supabase
      .from("visit")
      .insert({
        id: visitId,
        casino_id: SEED_CASINO_ID,
        player_id: player.id,
        started_at: new Date().toISOString(),
        visit_kind: "gaming_identified_rated",
        visit_group_id: visitId,
      })
      .select()
      .single();

    if (visitError) throw new Error(`Create visit: ${visitError.message}`);

    // 5. Create rating slip (30 min duration for points)
    const thirtyMinutesAgo = new Date(
      Date.now() - 30 * 60 * 1000,
    ).toISOString();
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
        casino_id: SEED_CASINO_ID,
        visit_id: visit.id,
        table_id: SEED_TABLE_ID,
        seat_number: String(Math.floor(Math.random() * 9) + 1), // Random seat to avoid conflicts
        average_bet: 5000, // $50
        status: "open",
        start_time: thirtyMinutesAgo,
        policy_snapshot: policySnapshot,
        accrual_kind: "loyalty",
      })
      .select()
      .single();

    if (slipError) throw new Error(`Create rating slip: ${slipError.message}`);

    // Get initial ledger count
    const { data: initialLedger } = await supabase
      .from("loyalty_ledger")
      .select("id")
      .eq("player_id", player.id)
      .eq("casino_id", SEED_CASINO_ID);

    const initialCount = initialLedger?.length ?? 0;

    // === TEST: Close the rating slip via API ===
    console.log(`Closing slip ${ratingSlip.id}...`);

    // In dev mode, auth bypass is enabled so we don't need auth headers
    const closeResponse = await fetch(
      `http://localhost:3000/api/v1/rating-slips/${ratingSlip.id}/close`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `e2e_close_${timestamp}`,
        },
        body: JSON.stringify({ average_bet: 5000 }),
      },
    );

    // Log error if failed
    const responseBody = await closeResponse.text();
    console.log(`Response: ${closeResponse.status} - ${responseBody}`);

    if (!closeResponse.ok) {
      console.error(`Close failed: ${closeResponse.status} - ${responseBody}`);
    }

    expect(closeResponse.ok).toBeTruthy();

    // Wait for async accrual
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // === VERIFY: Loyalty ledger entry created ===
    const { data: finalLedger } = await supabase
      .from("loyalty_ledger")
      .select("id, points_delta, reason, metadata")
      .eq("player_id", player.id)
      .eq("casino_id", SEED_CASINO_ID)
      .order("created_at", { ascending: false });

    expect(finalLedger!.length).toBeGreaterThan(initialCount);

    const accrualEntry = finalLedger!.find((e) => e.reason === "base_accrual");
    expect(accrualEntry).toBeDefined();
    expect(accrualEntry!.points_delta).toBeGreaterThan(0);

    // === VERIFY: Balance increased ===
    const { data: balance } = await supabase
      .from("player_loyalty")
      .select("current_balance")
      .eq("player_id", player.id)
      .eq("casino_id", SEED_CASINO_ID)
      .single();

    expect(balance!.current_balance).toBeGreaterThan(0);

    // === CLEANUP ===
    await supabase.from("loyalty_ledger").delete().eq("player_id", player.id);
    await supabase.from("rating_slip").delete().eq("id", ratingSlip.id);
    await supabase.from("visit").delete().eq("id", visit.id);
    await supabase.from("player_loyalty").delete().eq("player_id", player.id);
    await supabase.from("player_casino").delete().eq("player_id", player.id);
    await supabase.from("player").delete().eq("id", player.id);
  });
});
