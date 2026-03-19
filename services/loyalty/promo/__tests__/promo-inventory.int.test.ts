/**
 * Promo Inventory Integration Tests (PRD-LOYALTY-ADMIN-CATALOG WS5)
 *
 * Tests promo coupon inventory queries via the PromoService layer.
 *
 * These tests use a Supabase service-role client to:
 * 1. Create a promo program and issue coupons (setup fixture)
 * 2. Verify getCouponInventory returns correct status breakdowns
 * 3. Verify empty inventory for programs with no coupons
 * 4. Verify program-filtered inventory
 *
 * NOTE: Coupon issuance uses the rpc_issue_promo_coupon RPC which requires
 * a staff context. In service-role mode, RPCs bypass RLS but still need
 * the staff context injection function. If the RPC requires active staff,
 * tests fall back to direct table inserts as a pragmatic alternative.
 *
 * @testEnvironment node
 * @see PRD-LOYALTY-ADMIN-CATALOG
 * @see ADR-033 Loyalty Reward Domain Model
 * @see ADR-044 Testing Governance
 */

import { randomUUID } from 'crypto';

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import type { CouponInventoryOutput } from '../dtos';
import { createPromoService } from '../index';
import type { PromoService } from '../index';

// ============================================================================
// Test Configuration
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEST_PREFIX = 'test-piint'; // promo-inventory integration

// ============================================================================
// Test Fixture
// ============================================================================

interface TestFixture {
  casinoId: string;
  staffId: string;
  service: PromoService;
  supabase: SupabaseClient<Database>;
  programWithCoupons: {
    id: string;
    issuedCouponIds: string[];
    voidedCouponIds: string[];
  };
  programWithNoCoupons: { id: string };
  cleanup: () => Promise<void>;
}

/**
 * Creates a staff user in the database for test RPC calls.
 * Returns the auth user_id (UUID) needed as staff reference.
 */
async function createTestStaff(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<string> {
  const staffId = randomUUID();

  // Insert a staff row directly (service-role bypasses RLS)
  const { error } = await supabase.from('staff').insert({
    id: staffId,
    casino_id: casinoId,
    display_name: `${TEST_PREFIX} Staff`,
    role: 'pit_boss',
    status: 'active',
  });

  if (error) {
    throw new Error(`Failed to create test staff: ${error.message}`);
  }

  return staffId;
}

async function createTestFixture(): Promise<TestFixture> {
  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create casino
  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({ name: `${TEST_PREFIX} Casino ${Date.now()}`, status: 'active' })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create test casino: ${casinoError?.message}`);
  }

  const casinoId = casino.id;

  // Create test staff
  const staffId = await createTestStaff(supabase, casinoId);

  const service = createPromoService(supabase);

  // Create program with coupons
  const { data: program1, error: p1Err } = await supabase
    .from('promo_program')
    .insert({
      casino_id: casinoId,
      name: `${TEST_PREFIX} Program With Coupons`,
      promo_type: 'match_play',
      face_value_amount: 25,
      required_match_wager_amount: 25,
      status: 'active',
      created_by_staff_id: staffId,
    })
    .select()
    .single();

  if (p1Err || !program1) {
    throw new Error(`Failed to create test program: ${p1Err?.message}`);
  }

  // Create program with no coupons
  const { data: program2, error: p2Err } = await supabase
    .from('promo_program')
    .insert({
      casino_id: casinoId,
      name: `${TEST_PREFIX} Program Empty`,
      promo_type: 'match_play',
      face_value_amount: 50,
      required_match_wager_amount: 50,
      status: 'active',
      created_by_staff_id: staffId,
    })
    .select()
    .single();

  if (p2Err || !program2) {
    throw new Error(`Failed to create empty program: ${p2Err?.message}`);
  }

  // Insert coupons directly (avoids RPC staff context complexity in service-role mode)
  const issuedCouponIds: string[] = [];
  const voidedCouponIds: string[] = [];

  // Insert 3 issued coupons
  for (let i = 0; i < 3; i++) {
    const couponId = randomUUID();
    const { error: insErr } = await supabase.from('promo_coupon').insert({
      id: couponId,
      casino_id: casinoId,
      promo_program_id: program1.id,
      validation_number: `${TEST_PREFIX}-ISS-${Date.now()}-${i}`,
      status: 'issued',
      face_value_amount: 25,
      required_match_wager_amount: 25,
      issued_at: new Date().toISOString(),
      issued_by_staff_id: staffId,
      idempotency_key: randomUUID(),
    });
    if (insErr) {
      throw new Error(`Failed to insert issued coupon: ${insErr.message}`);
    }
    issuedCouponIds.push(couponId);
  }

  // Insert 2 voided coupons
  for (let i = 0; i < 2; i++) {
    const couponId = randomUUID();
    const { error: insErr } = await supabase.from('promo_coupon').insert({
      id: couponId,
      casino_id: casinoId,
      promo_program_id: program1.id,
      validation_number: `${TEST_PREFIX}-VOID-${Date.now()}-${i}`,
      status: 'voided',
      face_value_amount: 25,
      required_match_wager_amount: 25,
      issued_at: new Date().toISOString(),
      voided_at: new Date().toISOString(),
      issued_by_staff_id: staffId,
      voided_by_staff_id: staffId,
      idempotency_key: randomUUID(),
    });
    if (insErr) {
      throw new Error(`Failed to insert voided coupon: ${insErr.message}`);
    }
    voidedCouponIds.push(couponId);
  }

  const cleanup = async () => {
    // Delete coupons, programs, staff, casino
    await supabase.from('promo_coupon').delete().eq('casino_id', casinoId);
    await supabase.from('promo_program').delete().eq('casino_id', casinoId);
    await supabase.from('staff').delete().eq('id', staffId);
    await supabase.from('casino').delete().eq('id', casinoId);
  };

  return {
    casinoId,
    staffId,
    service,
    supabase,
    programWithCoupons: {
      id: program1.id,
      issuedCouponIds,
      voidedCouponIds,
    },
    programWithNoCoupons: { id: program2.id },
    cleanup,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Promo Inventory Integration (service layer)', () => {
  let fixture: TestFixture;

  beforeAll(async () => {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
      );
    }
    fixture = await createTestFixture();
  }, 30_000);

  afterAll(async () => {
    if (fixture?.cleanup) {
      await fixture.cleanup();
    }
  }, 15_000);

  // ==========================================================================
  // SCENARIO 1: Fetch inventory for program with issued coupons
  // ==========================================================================
  it('returns CouponInventoryOutput with correct status breakdown for program with coupons', async () => {
    const result: CouponInventoryOutput =
      await fixture.service.getCouponInventory({
        promoProgramId: fixture.programWithCoupons.id,
      });

    expect(result).toBeDefined();
    expect(result.inventory).toBeDefined();
    expect(Array.isArray(result.inventory)).toBe(true);

    // Should have entries for 'issued' and 'voided' statuses
    const issuedRow = result.inventory.find((r) => r.status === 'issued');
    const voidedRow = result.inventory.find((r) => r.status === 'voided');

    expect(issuedRow).toBeDefined();
    expect(issuedRow!.couponCount).toBe(3);
    expect(issuedRow!.totalFaceValue).toBe(75); // 3 * 25

    expect(voidedRow).toBeDefined();
    expect(voidedRow!.couponCount).toBe(2);
    expect(voidedRow!.totalFaceValue).toBe(50); // 2 * 25
  });

  // ==========================================================================
  // SCENARIO 2: Fetch inventory for program with no coupons
  // ==========================================================================
  it('returns empty inventory array for program with no coupons', async () => {
    const result: CouponInventoryOutput =
      await fixture.service.getCouponInventory({
        promoProgramId: fixture.programWithNoCoupons.id,
      });

    expect(result).toBeDefined();
    expect(result.inventory).toBeDefined();
    expect(result.inventory).toHaveLength(0);
  });

  // ==========================================================================
  // SCENARIO 3: Fetch inventory filtered by program ID returns only that program's coupons
  // ==========================================================================
  it('returns only the filtered program coupons when filtered by program ID', async () => {
    // Fetch inventory for program with coupons
    const filteredResult = await fixture.service.getCouponInventory({
      promoProgramId: fixture.programWithCoupons.id,
    });

    // Fetch inventory for empty program
    const emptyResult = await fixture.service.getCouponInventory({
      promoProgramId: fixture.programWithNoCoupons.id,
    });

    // Filtered should have data
    const totalFiltered = filteredResult.inventory.reduce(
      (sum, row) => sum + row.couponCount,
      0,
    );
    expect(totalFiltered).toBe(5); // 3 issued + 2 voided

    // Empty program should have no data
    const totalEmpty = emptyResult.inventory.reduce(
      (sum, row) => sum + row.couponCount,
      0,
    );
    expect(totalEmpty).toBe(0);

    // Verify the filtered result does not include coupons from other programs
    // by checking that every status row has expected counts from our fixture
    for (const row of filteredResult.inventory) {
      if (row.status === 'issued') {
        expect(row.couponCount).toBe(3);
      } else if (row.status === 'voided') {
        expect(row.couponCount).toBe(2);
      }
    }
  });
});
