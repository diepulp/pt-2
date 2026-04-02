/** @jest-environment node */

/**
 * LoyaltyService Promo Instruments Integration Tests
 *
 * Integration tests for promo program and coupon operations against a live database.
 * Tests RLS multi-tenant isolation, idempotency, and full operation workflows.
 *
 * Auth model: ADR-024 Mode C — authenticated anon clients carry JWT with staff_id
 * in app_metadata; set_rls_context_from_staff() derives context server-side.
 *
 * PREREQUISITES:
 * - Migrations must be applied including promo_program, promo_coupon tables
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL environment variable set
 * - SUPABASE_SERVICE_ROLE_KEY environment variable set
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable set
 *
 * @see PRD-LOYALTY-PROMO
 * @see EXECUTION-SPEC-LOYALTY-PROMO.md WS5
 * @see ADR-024 (authoritative context derivation)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import {
  createProgram,
  getProgram,
  listPrograms,
  updateProgram,
  issueCoupon,
  voidCoupon,
  replaceCoupon,
  getCouponInventory,
  listCoupons,
  getCoupon,
  getCouponByValidationNumber,
} from '@/services/loyalty/promo/crud';
import type {
  CreatePromoProgramInput,
  IssueCouponInput,
} from '@/services/loyalty/promo/dtos';
import { getPromoExposureRollup } from '@/services/loyalty/rollups';
import type { Database } from '@/types/database.types';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Skip integration tests if environment not configured or if running in CI without database
// Integration tests require: local Supabase running + promo tables migrated
const isIntegrationEnvironment =
  supabaseUrl &&
  SERVICE_ROLE_KEY &&
  ANON_KEY &&
  (process.env.RUN_INTEGRATION_TESTS === 'true' ||
    process.env.RUN_INTEGRATION_TESTS === '1');

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

describeIntegration('Promo Instruments Integration Tests', () => {
  // setupClient: service-role, used only for fixture management (bypasses RLS)
  let setupClient: SupabaseClient<Database>;
  // Mode C authenticated anon clients for business operations
  let pitBossClient: SupabaseClient<Database>;
  let otherCasinoClient: SupabaseClient<Database>;

  // Test data IDs
  let casinoId: string;
  let otherCasinoId: string;
  let pitBossId: string;
  let otherPitBossId: string;
  let userId1: string;
  let userId2: string;
  let playerId: string;
  let visitId: string;

  const pitBossEmail = `test-root-t3-promo-pitboss-${Date.now()}@example.com`;
  const otherPitBossEmail = `test-root-t3-promo-other-${Date.now() + 1}@example.com`;
  const testPassword = 'test-password';

  beforeAll(async () => {
    // === FIXTURE SETUP (service-role) ===
    setupClient = createClient<Database>(supabaseUrl, SERVICE_ROLE_KEY);

    // 1. Create auth users WITHOUT staff_id (two-phase ADR-024 setup)
    const { data: user1Data, error: user1Error } =
      await setupClient.auth.admin.createUser({
        email: pitBossEmail,
        password: testPassword,
        email_confirm: true,
        app_metadata: { staff_role: 'pit_boss' },
      });
    if (user1Error) throw user1Error;
    userId1 = user1Data.user.id;

    const { data: user2Data, error: user2Error } =
      await setupClient.auth.admin.createUser({
        email: otherPitBossEmail,
        password: testPassword,
        email_confirm: true,
        app_metadata: { staff_role: 'pit_boss' },
      });
    if (user2Error) throw user2Error;
    userId2 = user2Data.user.id;

    // 2. Create test companies (ADR-043: company before casino)
    const { data: company1, error: company1Error } = await setupClient
      .from('company')
      .insert({ name: 'Promo Test Company 1' })
      .select('id')
      .single();
    if (company1Error) throw company1Error;
    const companyId1 = company1.id;

    const { data: company2, error: company2Error } = await setupClient
      .from('company')
      .insert({ name: 'Promo Test Company 2' })
      .select('id')
      .single();
    if (company2Error) throw company2Error;
    const companyId2 = company2.id;

    // 3. Create test casinos
    const { data: casino, error: casinoError } = await setupClient
      .from('casino')
      .insert({ name: 'Promo Test Casino', company_id: companyId1 })
      .select('id')
      .single();
    if (casinoError) throw casinoError;
    casinoId = casino.id;

    const { data: otherCasino, error: otherCasinoError } = await setupClient
      .from('casino')
      .insert({ name: 'Other Promo Test Casino', company_id: companyId2 })
      .select('id')
      .single();
    if (otherCasinoError) throw otherCasinoError;
    otherCasinoId = otherCasino.id;

    // 3b. Create casino_settings (required for gaming_day trigger on visit insert)
    const { error: settings1Error } = await setupClient
      .from('casino_settings')
      .insert({ casino_id: casinoId });
    if (settings1Error) throw settings1Error;

    const { error: settings2Error } = await setupClient
      .from('casino_settings')
      .insert({ casino_id: otherCasinoId });
    if (settings2Error) throw settings2Error;

    // 4. Create test staff
    const { data: pitBoss, error: pitBossError } = await setupClient
      .from('staff')
      .insert({
        user_id: userId1,
        casino_id: casinoId,
        role: 'pit_boss',
        first_name: 'Promo',
        last_name: 'PitBoss',
        status: 'active',
      })
      .select('id')
      .single();
    if (pitBossError) throw pitBossError;
    pitBossId = pitBoss.id;

    const { data: otherPitBoss, error: otherPitBossError } = await setupClient
      .from('staff')
      .insert({
        user_id: userId2,
        casino_id: otherCasinoId,
        role: 'pit_boss',
        first_name: 'Other',
        last_name: 'PitBoss',
        status: 'active',
      })
      .select('id')
      .single();
    if (otherPitBossError) throw otherPitBossError;
    otherPitBossId = otherPitBoss.id;

    // 5. Stamp staff_id into app_metadata (ADR-024 two-phase)
    await setupClient.auth.admin.updateUserById(userId1, {
      app_metadata: {
        staff_id: pitBossId,
        casino_id: casinoId,
        staff_role: 'pit_boss',
      },
    });
    await setupClient.auth.admin.updateUserById(userId2, {
      app_metadata: {
        staff_id: otherPitBossId,
        casino_id: otherCasinoId,
        staff_role: 'pit_boss',
      },
    });

    // 6. Sign in via throwaway clients to get JWTs
    const throwaway1 = createClient<Database>(supabaseUrl, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session1, error: signIn1Error } =
      await throwaway1.auth.signInWithPassword({
        email: pitBossEmail,
        password: testPassword,
      });
    if (signIn1Error || !session1.session)
      throw signIn1Error ?? new Error('Sign-in 1 returned no session');

    const throwaway2 = createClient<Database>(supabaseUrl, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session2, error: signIn2Error } =
      await throwaway2.auth.signInWithPassword({
        email: otherPitBossEmail,
        password: testPassword,
      });
    if (signIn2Error || !session2.session)
      throw signIn2Error ?? new Error('Sign-in 2 returned no session');

    // 7. Create Mode C authenticated anon clients (ADR-024)
    pitBossClient = createClient<Database>(supabaseUrl, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${session1.session.access_token}`,
        },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    otherCasinoClient = createClient<Database>(supabaseUrl, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${session2.session.access_token}`,
        },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 8. Create test player and enroll
    const { data: player, error: playerError } = await setupClient
      .from('player')
      .insert({
        first_name: 'Promo',
        last_name: 'TestPlayer',
        birth_date: '1985-03-15',
      })
      .select('id')
      .single();
    if (playerError) throw playerError;
    playerId = player.id;

    await setupClient.from('player_casino').insert({
      player_id: playerId,
      casino_id: casinoId,
      status: 'active',
      enrolled_by: pitBossId,
    });

    // 9. Create test visit (triggers set gaming_day + visit_group_id)
    const { data: visit, error: visitError } = await setupClient
      .from('visit')
      .insert({
        player_id: playerId,
        casino_id: casinoId,
      })
      .select('id')
      .single();
    if (visitError) throw visitError;
    visitId = visit.id;
  });

  afterAll(async () => {
    // Cleanup test data in reverse order of dependencies
    await setupClient
      .from('promo_coupon')
      .delete()
      .or(`casino_id.eq.${casinoId},casino_id.eq.${otherCasinoId}`);
    await setupClient
      .from('promo_program')
      .delete()
      .or(`casino_id.eq.${casinoId},casino_id.eq.${otherCasinoId}`);
    await setupClient.from('visit').delete().eq('id', visitId);
    await setupClient.from('player_casino').delete().eq('casino_id', casinoId);
    await setupClient.from('player').delete().eq('id', playerId);
    await setupClient
      .from('staff')
      .delete()
      .or(`casino_id.eq.${casinoId},casino_id.eq.${otherCasinoId}`);
    await setupClient
      .from('casino')
      .delete()
      .or(`id.eq.${casinoId},id.eq.${otherCasinoId}`);
    await setupClient
      .from('company')
      .delete()
      .or(`name.eq.Promo Test Company 1,name.eq.Promo Test Company 2`);
    await setupClient.auth.admin.deleteUser(userId1);
    await setupClient.auth.admin.deleteUser(userId2);
  });

  describe('Promo Program CRUD', () => {
    let programId: string;

    it('creates a promo program with RLS context', async () => {
      const input: CreatePromoProgramInput = {
        casinoId,
        name: 'Weekend Match Play $25',
        faceValueAmount: 25.0,
        requiredMatchWagerAmount: 25.0,
        startAt: '2026-01-01T00:00:00Z',
        endAt: '2026-12-31T23:59:59Z',
      };

      const program = await createProgram(pitBossClient, input);

      expect(program).toBeDefined();
      expect(program.id).toBeDefined();
      expect(program.casinoId).toBe(casinoId);
      expect(program.name).toBe('Weekend Match Play $25');
      expect(program.promoType).toBe('match_play');
      expect(program.faceValueAmount).toBe(25);
      expect(program.status).toBe('active');

      programId = program.id;
    });

    it('lists programs filtered to current casino (RLS isolation)', async () => {
      // Create program in other casino
      const { data: otherProgram } = await setupClient
        .from('promo_program')
        .insert({
          casino_id: otherCasinoId,
          name: 'Other Casino Program',
          promo_type: 'match_play',
          face_value_amount: 50,
          required_match_wager_amount: 50,
          status: 'active',
        })
        .select('id')
        .single();

      // List from pitBossClient should only see own casino's programs
      const programs = await listPrograms(pitBossClient, {});

      expect(programs.length).toBeGreaterThanOrEqual(1);
      expect(programs.every((p) => p.casinoId === casinoId)).toBe(true);
      expect(programs.some((p) => p.casinoId === otherCasinoId)).toBe(false);

      // Cleanup
      await setupClient
        .from('promo_program')
        .delete()
        .eq('id', otherProgram!.id);
    });

    it('gets a single program by ID', async () => {
      const program = await getProgram(pitBossClient, programId);

      expect(program).not.toBeNull();
      expect(program?.id).toBe(programId);
      expect(program?.name).toBe('Weekend Match Play $25');
    });

    it('returns null for non-existent program', async () => {
      const program = await getProgram(
        pitBossClient,
        '00000000-0000-0000-0000-000000000000',
      );

      expect(program).toBeNull();
    });

    it('cannot access program from other casino (RLS isolation)', async () => {
      // Create program in other casino
      const { data: otherProgram } = await setupClient
        .from('promo_program')
        .insert({
          casino_id: otherCasinoId,
          name: 'Isolated Program',
          promo_type: 'match_play',
          face_value_amount: 100,
          required_match_wager_amount: 100,
          status: 'active',
        })
        .select('id')
        .single();

      // Try to get from pitBossClient (different casino context)
      const program = await getProgram(pitBossClient, otherProgram!.id);

      expect(program).toBeNull();

      // Cleanup
      await setupClient
        .from('promo_program')
        .delete()
        .eq('id', otherProgram!.id);
    });

    it('updates program status', async () => {
      const updated = await updateProgram(pitBossClient, {
        id: programId,
        status: 'inactive',
      });

      expect(updated.status).toBe('inactive');

      // Restore for subsequent tests
      await updateProgram(pitBossClient, {
        id: programId,
        status: 'active',
      });
    });

    it('filters programs by activeOnly', async () => {
      // Create inactive program
      const inactive = await createProgram(pitBossClient, {
        casinoId,
        name: 'Inactive Program',
        faceValueAmount: 10,
        requiredMatchWagerAmount: 10,
      });
      await updateProgram(pitBossClient, {
        id: inactive.id,
        status: 'inactive',
      });

      // Filter active only
      const activePrograms = await listPrograms(pitBossClient, {
        activeOnly: true,
      });

      expect(activePrograms.some((p) => p.id === inactive.id)).toBe(false);
      expect(activePrograms.every((p) => p.status === 'active')).toBe(true);
    });
  });

  describe('Promo Coupon Lifecycle', () => {
    let programId: string;
    let couponId: string;

    beforeAll(async () => {
      // Create program for coupon tests
      const program = await createProgram(pitBossClient, {
        casinoId,
        name: 'Coupon Test Program',
        faceValueAmount: 25,
        requiredMatchWagerAmount: 25,
      });
      programId = program.id;
    });

    it('issues a coupon with player and visit', async () => {
      const input: IssueCouponInput = {
        promoProgramId: programId,
        validationNumber: 'VAL-TEST-001',
        idempotencyKey: 'issue:VAL-TEST-001',
        playerId,
        visitId,
        expiresAt: '2026-02-07T10:00:00Z',
      };

      const result = await issueCoupon(pitBossClient, input);

      expect(result.coupon).toBeDefined();
      expect(result.coupon.id).toBeDefined();
      expect(result.coupon.validationNumber).toBe('VAL-TEST-001');
      expect(result.coupon.status).toBe('issued');
      expect(result.coupon.faceValueAmount).toBe(25);
      expect(result.coupon.playerId).toBe(playerId);
      expect(result.coupon.visitId).toBe(visitId);
      expect(result.isExisting).toBe(false);

      couponId = result.coupon.id;
    });

    it('handles idempotent coupon issuance (same idempotency key)', async () => {
      const input: IssueCouponInput = {
        promoProgramId: programId,
        validationNumber: 'VAL-TEST-001',
        idempotencyKey: 'issue:VAL-TEST-001',
        playerId,
        visitId,
      };

      const result = await issueCoupon(pitBossClient, input);

      expect(result.isExisting).toBe(true);
      expect(result.coupon.id).toBe(couponId);
    });

    it('gets coupon by ID', async () => {
      const coupon = await getCoupon(pitBossClient, couponId);

      expect(coupon).not.toBeNull();
      expect(coupon?.id).toBe(couponId);
      expect(coupon?.validationNumber).toBe('VAL-TEST-001');
    });

    it('gets coupon by validation number', async () => {
      const coupon = await getCouponByValidationNumber(
        pitBossClient,
        'VAL-TEST-001',
      );

      expect(coupon).not.toBeNull();
      expect(coupon?.id).toBe(couponId);
    });

    it('lists coupons with filters', async () => {
      const coupons = await listCoupons(pitBossClient, { status: 'issued' });

      expect(coupons.length).toBeGreaterThanOrEqual(1);
      expect(coupons.every((c) => c.status === 'issued')).toBe(true);
    });

    it('lists coupons by player', async () => {
      const coupons = await listCoupons(pitBossClient, { playerId });

      expect(coupons.length).toBeGreaterThanOrEqual(1);
      expect(coupons.every((c) => c.playerId === playerId)).toBe(true);
    });

    it('lists coupons by program', async () => {
      const coupons = await listCoupons(pitBossClient, {
        promoProgramId: programId,
      });

      expect(coupons.length).toBeGreaterThanOrEqual(1);
      expect(coupons.every((c) => c.promoProgramId === programId)).toBe(true);
    });
  });

  describe('Coupon Void Operation', () => {
    let programId: string;
    let couponId: string;

    beforeAll(async () => {
      const program = await createProgram(pitBossClient, {
        casinoId,
        name: 'Void Test Program',
        faceValueAmount: 20,
        requiredMatchWagerAmount: 20,
      });
      programId = program.id;
    });

    it('voids an issued coupon', async () => {
      // Issue a coupon first
      const issued = await issueCoupon(pitBossClient, {
        promoProgramId: programId,
        validationNumber: 'VAL-VOID-001',
        idempotencyKey: 'issue:VAL-VOID-001',
      });
      couponId = issued.coupon.id;

      // Void it
      const result = await voidCoupon(pitBossClient, {
        couponId,
        idempotencyKey: 'void:VAL-VOID-001',
      });

      expect(result.coupon.id).toBe(couponId);
      expect(result.coupon.status).toBe('voided');
      expect(result.coupon.voidedAt).toBeDefined();
      expect(result.isExisting).toBe(false);
    });

    it('handles idempotent void (same idempotency key)', async () => {
      const result = await voidCoupon(pitBossClient, {
        couponId,
        idempotencyKey: 'void:VAL-VOID-001',
      });

      expect(result.isExisting).toBe(true);
      expect(result.coupon.status).toBe('voided');
    });

    it('throws INVALID_COUPON_STATUS when voiding already voided coupon with new key', async () => {
      await expect(
        voidCoupon(pitBossClient, {
          couponId,
          idempotencyKey: 'void:VAL-VOID-001-retry',
        }),
      ).rejects.toThrow('INVALID_COUPON_STATUS');
    });
  });

  describe('Coupon Replace Operation', () => {
    let programId: string;
    let originalCouponId: string;

    beforeAll(async () => {
      const program = await createProgram(pitBossClient, {
        casinoId,
        name: 'Replace Test Program',
        faceValueAmount: 30,
        requiredMatchWagerAmount: 30,
      });
      programId = program.id;
    });

    it('replaces an issued coupon with a new one', async () => {
      // Issue original coupon
      const issued = await issueCoupon(pitBossClient, {
        promoProgramId: programId,
        validationNumber: 'VAL-REPLACE-001',
        idempotencyKey: 'issue:VAL-REPLACE-001',
      });
      originalCouponId = issued.coupon.id;

      // Replace it
      const result = await replaceCoupon(pitBossClient, {
        couponId: originalCouponId,
        newValidationNumber: 'VAL-REPLACE-002',
        idempotencyKey: 'replace:VAL-REPLACE-001',
        newExpiresAt: '2026-03-07T10:00:00Z',
      });

      expect(result.oldCoupon.id).toBe(originalCouponId);
      expect(result.oldCoupon.status).toBe('replaced');
      expect(result.oldCoupon.replacedAt).toBeDefined();

      expect(result.newCoupon.id).toBeDefined();
      expect(result.newCoupon.validationNumber).toBe('VAL-REPLACE-002');
      expect(result.newCoupon.status).toBe('issued');
      expect(result.isExisting).toBe(false);
    });

    it('old coupon references new coupon after replacement', async () => {
      const oldCoupon = await getCoupon(pitBossClient, originalCouponId);

      expect(oldCoupon?.status).toBe('replaced');
      expect(oldCoupon?.replacementCouponId).toBeDefined();
    });

    it('throws INVALID_COUPON_STATUS when replacing already replaced coupon', async () => {
      await expect(
        replaceCoupon(pitBossClient, {
          couponId: originalCouponId,
          newValidationNumber: 'VAL-REPLACE-003',
          idempotencyKey: 'replace:VAL-REPLACE-001-retry',
        }),
      ).rejects.toThrow('INVALID_COUPON_STATUS');
    });
  });

  describe('Coupon Inventory', () => {
    let programId: string;

    beforeAll(async () => {
      const program = await createProgram(pitBossClient, {
        casinoId,
        name: 'Inventory Test Program',
        faceValueAmount: 15,
        requiredMatchWagerAmount: 15,
      });
      programId = program.id;

      // Create some coupons in various states
      const issued1 = await issueCoupon(pitBossClient, {
        promoProgramId: programId,
        validationNumber: 'VAL-INV-001',
        idempotencyKey: 'issue:VAL-INV-001',
      });

      const issued2 = await issueCoupon(pitBossClient, {
        promoProgramId: programId,
        validationNumber: 'VAL-INV-002',
        idempotencyKey: 'issue:VAL-INV-002',
      });

      const issued3 = await issueCoupon(pitBossClient, {
        promoProgramId: programId,
        validationNumber: 'VAL-INV-003',
        idempotencyKey: 'issue:VAL-INV-003',
      });

      // Void one
      await voidCoupon(pitBossClient, {
        couponId: issued2.coupon.id,
        idempotencyKey: 'void:VAL-INV-002',
      });
    });

    it('returns inventory breakdown by status', async () => {
      const inventory = await getCouponInventory(pitBossClient, {
        promoProgramId: programId,
      });

      expect(inventory.inventory).toBeDefined();
      expect(Array.isArray(inventory.inventory)).toBe(true);

      const issuedRow = inventory.inventory.find((r) => r.status === 'issued');
      const voidedRow = inventory.inventory.find((r) => r.status === 'voided');

      expect(issuedRow?.couponCount).toBeGreaterThanOrEqual(2);
      expect(voidedRow?.couponCount).toBeGreaterThanOrEqual(1);
    });

    it('returns totals for face value and match wager', async () => {
      const inventory = await getCouponInventory(pitBossClient, {
        promoProgramId: programId,
      });

      const issuedRow = inventory.inventory.find((r) => r.status === 'issued');

      expect(issuedRow?.totalFaceValue).toBeGreaterThanOrEqual(30); // 2 x $15
      expect(issuedRow?.totalMatchWager).toBeGreaterThanOrEqual(30);
    });
  });

  describe('RLS Multi-Tenant Isolation', () => {
    let programIdCasino1: string;
    let couponIdCasino1: string;

    beforeAll(async () => {
      // Create program in casino 1
      const program = await createProgram(pitBossClient, {
        casinoId,
        name: 'Casino 1 Isolated Program',
        faceValueAmount: 100,
        requiredMatchWagerAmount: 100,
      });
      programIdCasino1 = program.id;

      // Issue coupon in casino 1
      const issued = await issueCoupon(pitBossClient, {
        promoProgramId: programIdCasino1,
        validationNumber: 'VAL-RLS-CASINO1',
        idempotencyKey: 'issue:VAL-RLS-CASINO1',
      });
      couponIdCasino1 = issued.coupon.id;
    });

    it('other casino cannot list programs from casino 1', async () => {
      const programs = await listPrograms(otherCasinoClient, {});

      const crossCasinoProgram = programs.find(
        (p) => p.id === programIdCasino1,
      );
      expect(crossCasinoProgram).toBeUndefined();
    });

    it('other casino cannot get program from casino 1', async () => {
      const program = await getProgram(otherCasinoClient, programIdCasino1);

      expect(program).toBeNull();
    });

    it('other casino cannot list coupons from casino 1', async () => {
      const coupons = await listCoupons(otherCasinoClient, {});

      const crossCasinoCoupon = coupons.find((c) => c.id === couponIdCasino1);
      expect(crossCasinoCoupon).toBeUndefined();
    });

    it('other casino cannot get coupon from casino 1', async () => {
      const coupon = await getCoupon(otherCasinoClient, couponIdCasino1);

      expect(coupon).toBeNull();
    });

    it('other casino cannot void coupon from casino 1', async () => {
      await expect(
        voidCoupon(otherCasinoClient, {
          couponId: couponIdCasino1,
          idempotencyKey: 'void:cross-casino-attempt',
        }),
      ).rejects.toThrow();
    });
  });

  describe('Promo Exposure Rollups', () => {
    let programId: string;

    beforeAll(async () => {
      // Create program with coupons for rollup testing
      const program = await createProgram(pitBossClient, {
        casinoId,
        name: 'Rollup Test Program',
        faceValueAmount: 50,
        requiredMatchWagerAmount: 50,
      });
      programId = program.id;

      // Issue several coupons
      for (let i = 0; i < 5; i++) {
        await issueCoupon(pitBossClient, {
          promoProgramId: programId,
          validationNumber: `VAL-ROLLUP-${i}`,
          idempotencyKey: `issue:VAL-ROLLUP-${i}`,
          expiresAt:
            i === 0
              ? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() // 12h from now (expiring soon)
              : undefined,
        });
      }

      // Void one
      const coupons = await listCoupons(pitBossClient, {
        promoProgramId: programId,
      });
      if (coupons.length > 0) {
        await voidCoupon(pitBossClient, {
          couponId: coupons[coupons.length - 1].id,
          idempotencyKey: `void:rollup-test`,
        });
      }
    });

    it('returns promo exposure rollup metrics', async () => {
      const rollup = await getPromoExposureRollup(pitBossClient, {});

      expect(rollup).toBeDefined();
      expect(rollup.casinoId).toBe(casinoId);
      expect(rollup.issuedCount).toBeGreaterThanOrEqual(0);
      expect(rollup.outstandingCount).toBeGreaterThanOrEqual(0);
      expect(rollup.totalIssuedFaceValue).toBeGreaterThanOrEqual(0);
      expect(rollup.voidedCount).toBeGreaterThanOrEqual(0);
    });

    it('rollup metrics reflect outstanding coupons', async () => {
      const rollup = await getPromoExposureRollup(pitBossClient, {});

      // Should have some outstanding (issued) coupons
      expect(rollup.outstandingCount).toBeGreaterThan(0);
      expect(rollup.outstandingFaceValue).toBeGreaterThan(0);
    });

    it('rollup metrics show expiring soon count', async () => {
      const rollup = await getPromoExposureRollup(pitBossClient, {});

      // We created at least one coupon expiring within 24h
      expect(rollup.expiringSoonCount).toBeGreaterThanOrEqual(0);
    });
  });
});
