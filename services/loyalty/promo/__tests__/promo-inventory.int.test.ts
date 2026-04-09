/** @jest-environment node */

/**
 * Promo Inventory Integration Tests (PRD-LOYALTY-ADMIN-CATALOG WS5)
 *
 * Tests promo coupon inventory queries via the PromoService layer.
 *
 * Mode C (ADR-024): Service-role client for fixture setup only.
 * Service under test is wired to an authenticated anon client (pitBossClient)
 * carrying JWT claims derived from createModeCSession.
 *
 * 1. Create a promo program and issue coupons (setup fixture via setupClient)
 * 2. Verify getCouponInventory returns correct status breakdowns (via pitBossClient)
 * 3. Verify empty inventory for programs with no coupons
 * 4. Verify program-filtered inventory
 *
 * @testEnvironment node
 * @see PRD-LOYALTY-ADMIN-CATALOG
 * @see ADR-033 Loyalty Reward Domain Model
 * @see ADR-044 Testing Governance
 */

import { randomUUID } from 'crypto';

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { createModeCSession } from '@/lib/testing/create-mode-c-session';
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
  setupClient: SupabaseClient<Database>;
  pitBossClient: SupabaseClient<Database>;
  programWithCoupons: {
    id: string;
    issuedCouponIds: string[];
    voidedCouponIds: string[];
  };
  programWithNoCoupons: { id: string };
  authCleanup: () => Promise<void>;
  cleanup: () => Promise<void>;
}

/**
 * Creates a staff user in the database for test RPC calls.
 * Returns the auth user_id (UUID) needed as staff reference.
 */
async function createTestStaff(
  setupClient: SupabaseClient<Database>,
  casinoId: string,
): Promise<string> {
  const staffId = randomUUID();

  // Insert a staff row directly (service-role bypasses RLS)
  const { error } = await setupClient.from('staff').insert({
    id: staffId,
    casino_id: casinoId,
    employee_id: `${TEST_PREFIX}-${Date.now()}`,
    first_name: 'Test',
    last_name: 'Staff',
    role: 'pit_boss',
    status: 'active',
  });

  if (error) {
    throw new Error(`Failed to create test staff: ${error.message}`);
  }

  return staffId;
}

async function createTestFixture(): Promise<TestFixture> {
  // Service-role client for fixture setup only (Mode C — ADR-024)
  const setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create company (ADR-043: company before casino)
  const { data: company, error: companyError } = await setupClient
    .from('company')
    .insert({ name: `${TEST_PREFIX} Company ${Date.now()}` })
    .select()
    .single();

  if (companyError || !company) {
    throw new Error(`Failed to create test company: ${companyError?.message}`);
  }

  // Create casino
  const { data: casino, error: casinoError } = await setupClient
    .from('casino')
    .insert({
      name: `${TEST_PREFIX} Casino ${Date.now()}`,
      status: 'active',
      company_id: company.id,
    })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create test casino: ${casinoError?.message}`);
  }

  const casinoId = casino.id;

  // Create test staff
  const staffId = await createTestStaff(setupClient, casinoId);

  // Mode C auth setup (ADR-024) — authenticated anon client with JWT claims
  const session = await createModeCSession(setupClient, {
    staffId,
    casinoId,
    staffRole: 'pit_boss',
  });
  const pitBossClient = session.client;

  // Link auth user to staff row
  await setupClient
    .from('staff')
    .update({ user_id: session.userId })
    .eq('id', staffId);

  // Wire service to authenticated client (Mode C)
  const service = createPromoService(pitBossClient);

  // Create program with coupons
  const { data: program1, error: p1Err } = await setupClient
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
  const { data: program2, error: p2Err } = await setupClient
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

  // Insert coupons directly (avoids RPC staff context complexity)
  const issuedCouponIds: string[] = [];
  const voidedCouponIds: string[] = [];

  // Insert 3 issued coupons
  for (let i = 0; i < 3; i++) {
    const couponId = randomUUID();
    const { error: insErr } = await setupClient.from('promo_coupon').insert({
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
    const { error: insErr } = await setupClient.from('promo_coupon').insert({
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
    // Delete coupons, programs, staff, casino, company (reverse dependency order)
    await setupClient.from('promo_coupon').delete().eq('casino_id', casinoId);
    await setupClient.from('promo_program').delete().eq('casino_id', casinoId);
    await setupClient.from('staff').delete().eq('id', staffId);
    await setupClient.from('casino').delete().eq('id', casinoId);
    await setupClient.from('company').delete().eq('id', company.id);
  };

  return {
    casinoId,
    staffId,
    service,
    setupClient,
    pitBossClient,
    programWithCoupons: {
      id: program1.id,
      issuedCouponIds,
      voidedCouponIds,
    },
    programWithNoCoupons: { id: program2.id },
    authCleanup: session.cleanup,
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
    // Auth cleanup (Mode C)
    await fixture?.authCleanup?.();
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
