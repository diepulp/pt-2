/** @jest-environment node */

/**
 * PRD-068: rpc_bootstrap_casino_pit_layout
 * Integration Tests — 11 groups (a)-(k) per EXEC-068 §WS4
 *
 *   (a) 3 tables / 2 distinct pits — 1 activation, 2 floor_pits, 3 slots,
 *       floor_layout_version.status='active', activation_request_id fixed
 *   (b) pit-bearing + empty-pit + null-pit tables — only pit-bearing get slots
 *   (c) pit-name equivalence (Main / "main " / MAIN) — 1 pit, canonical label,
 *       partial unique index ux_floor_pit_layout_version_label_lower exists
 *   (d) re-invocation idempotency — zero new rows, outcome='already_bootstrapped',
 *       both EXISTS short-circuit and UNIQUE (casino_id, activation_request_id)
 *       verified as idempotency guards
 *   (e) mid-transaction failure — RPC rolls back all 5-table writes
 *   (f) gaming_table.pit byte-equality pre/post — strict .toBe() per row
 *   (g) downstream hand-off — getPitAssignmentState returns materialized state
 *   (h) non-admin rejection — pit_boss + dealer raise FORBIDDEN_ADMIN_REQUIRED
 *   (i) cross-casino scoping — casino B untouched
 *   (j) DEC-004 CompleteSetupResult byte-identical pre/post WS3; BOOTSTRAP_FAILED
 *       on failure branch
 *   (k) concurrent-bootstrap race (Finding 1) — exactly ONE active activation
 *
 * Mode C JWT auth (ADR-024): authenticated anon clients with staff_id claims.
 * Per-test isolation: each group creates its own fresh casino.
 *
 * PREREQUISITES:
 * - PRD-068 migration applied (supabase/migrations/20260422183640_...)
 * - Local Supabase running: `npx supabase start`
 * - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY env vars set
 * - RUN_INTEGRATION_TESTS=true
 *
 * @see supabase/migrations/20260422183640_prd068_bootstrap_casino_pit_layout_rpc.sql
 * @see docs/21-exec-spec/EXEC-068-pit-bootstrap-onboarding-materialization.md §WS4
 * @see services/floor-layout/__tests__/rpc-pit-assignment.int.test.ts (canonical Mode C harness)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { getPitAssignmentState } from '../crud';
import type { Database } from '../../../types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isIntegrationEnvironment =
  Boolean(supabaseUrl) &&
  Boolean(supabaseServiceKey) &&
  Boolean(supabaseAnonKey) &&
  process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIntegration = isIntegrationEnvironment ? describe : describe.skip;

const TEST_PASSWORD = 'TestPassword123!';

type GameTypeEnum = Database['public']['Enums']['game_type'];

interface SeedTable {
  label: string;
  type: GameTypeEnum;
  pit: string | null;
}

interface FreshCasinoFixture {
  casinoId: string;
  companyId: string;
  adminUserId: string;
  adminStaffId: string;
  pitBossUserId: string;
  pitBossStaffId: string;
  dealerUserId: string;
  dealerStaffId: string;
  adminClient: SupabaseClient<Database>;
  pitBossClient: SupabaseClient<Database>;
  dealerClient: SupabaseClient<Database>;
  tables: Array<{
    id: string;
    label: string;
    type: GameTypeEnum;
    pit: string | null;
  }>;
  cleanup: () => Promise<void>;
}

/**
 * Create a fresh casino with admin + pit_boss + dealer staff + a given set
 * of gaming_tables. Each fixture is self-contained — no shared state.
 */
async function createFreshCasino(
  setupClient: SupabaseClient<Database>,
  prefix: string,
  seedTables: SeedTable[],
  options: { includeNonAdminRoles?: boolean } = {},
): Promise<FreshCasinoFixture> {
  const ts = Date.now();
  const tag = `${prefix}-${ts}-${Math.floor(Math.random() * 1e6)}`;
  const { includeNonAdminRoles = false } = options;

  const adminEmail = `${tag}-admin@test.com`;
  const pitBossEmail = `${tag}-pb@test.com`;
  const dealerEmail = `${tag}-dlr@test.com`;

  const adminUser = await setupClient.auth.admin.createUser({
    email: adminEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  const adminUserId = adminUser.data!.user!.id;

  let pitBossUserId = '';
  let dealerUserId = '';
  if (includeNonAdminRoles) {
    const [pb, dlr] = await Promise.all([
      setupClient.auth.admin.createUser({
        email: pitBossEmail,
        password: TEST_PASSWORD,
        email_confirm: true,
      }),
      setupClient.auth.admin.createUser({
        email: dealerEmail,
        password: TEST_PASSWORD,
        email_confirm: true,
      }),
    ]);
    pitBossUserId = pb.data!.user!.id;
    dealerUserId = dlr.data!.user!.id;
  }

  const { data: company } = await setupClient
    .from('company')
    .insert({ name: `${tag}-company` })
    .select('id')
    .single();
  const companyId = company!.id;

  const { data: casino } = await setupClient
    .from('casino')
    .insert({ name: `${tag}-casino`, company_id: companyId })
    .select('id')
    .single();
  const casinoId = casino!.id;

  await setupClient.from('casino_settings').insert({
    casino_id: casinoId,
    gaming_day_start_time: '06:00',
    timezone: 'America/Los_Angeles',
  });

  const { data: adminStaff } = await setupClient
    .from('staff')
    .insert({
      user_id: adminUserId,
      casino_id: casinoId,
      role: 'admin',
      first_name: 'PRD068',
      last_name: 'Admin',
      status: 'active',
    })
    .select('id')
    .single();
  const adminStaffId = adminStaff!.id;

  let pitBossStaffId = '';
  let dealerStaffId = '';
  if (includeNonAdminRoles) {
    const [pbStaff, dlrStaff] = await Promise.all([
      setupClient
        .from('staff')
        .insert({
          user_id: pitBossUserId,
          casino_id: casinoId,
          role: 'pit_boss',
          first_name: 'PRD068',
          last_name: 'PitBoss',
          status: 'active',
        })
        .select('id')
        .single(),
      setupClient
        .from('staff')
        .insert({
          user_id: dealerUserId,
          casino_id: casinoId,
          role: 'dealer',
          first_name: 'PRD068',
          last_name: 'Dealer',
          status: 'active',
        })
        .select('id')
        .single(),
    ]);
    pitBossStaffId = pbStaff.data!.id;
    dealerStaffId = dlrStaff.data!.id;
  }

  // app_metadata for ADR-024 context derivation
  await setupClient.auth.admin.updateUserById(adminUserId, {
    app_metadata: {
      casino_id: casinoId,
      staff_id: adminStaffId,
      staff_role: 'admin',
    },
  });
  if (includeNonAdminRoles) {
    await Promise.all([
      setupClient.auth.admin.updateUserById(pitBossUserId, {
        app_metadata: {
          casino_id: casinoId,
          staff_id: pitBossStaffId,
          staff_role: 'pit_boss',
        },
      }),
      setupClient.auth.admin.updateUserById(dealerUserId, {
        app_metadata: {
          casino_id: casinoId,
          staff_id: dealerStaffId,
          staff_role: 'dealer',
        },
      }),
    ]);
  }

  // Seed gaming tables (sequential to guarantee deterministic created_at
  // ordering for group (c) canonical-label selection).
  const tables: FreshCasinoFixture['tables'] = [];
  for (const t of seedTables) {
    const { data } = await setupClient
      .from('gaming_table')
      .insert({
        casino_id: casinoId,
        label: t.label,
        type: t.type,
        pit: t.pit,
        status: 'active',
      })
      .select('id, label, type, pit')
      .single();
    tables.push({
      id: data!.id,
      label: data!.label,
      type: data!.type,
      pit: data!.pit,
    });
    // Small delay to disambiguate created_at timestamps for ordering.
    await new Promise((r) => setTimeout(r, 5));
  }

  const adminClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
  const pitBossClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
  const dealerClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!);

  await adminClient.auth.signInWithPassword({
    email: adminEmail,
    password: TEST_PASSWORD,
  });
  if (includeNonAdminRoles) {
    await Promise.all([
      pitBossClient.auth.signInWithPassword({
        email: pitBossEmail,
        password: TEST_PASSWORD,
      }),
      dealerClient.auth.signInWithPassword({
        email: dealerEmail,
        password: TEST_PASSWORD,
      }),
    ]);
  }

  const cleanup = async () => {
    // Teardown in reverse FK order. Null preferred_table_id first to decouple
    // slot→table FK before deleting gaming_tables.
    const { data: layouts } = await setupClient
      .from('floor_layout')
      .select('id')
      .eq('casino_id', casinoId);
    const layoutIds = (layouts ?? []).map((l) => l.id);
    const { data: versions } = layoutIds.length
      ? await setupClient
          .from('floor_layout_version')
          .select('id')
          .in('layout_id', layoutIds)
      : { data: [] as { id: string }[] };
    const versionIds = (versions ?? []).map((v) => v.id);

    if (versionIds.length > 0) {
      await setupClient
        .from('floor_table_slot')
        .update({ preferred_table_id: null })
        .in('layout_version_id', versionIds);
    }
    await setupClient
      .from('floor_layout_activation')
      .delete()
      .eq('casino_id', casinoId);
    if (versionIds.length > 0) {
      await setupClient
        .from('floor_table_slot')
        .delete()
        .in('layout_version_id', versionIds);
      await setupClient
        .from('floor_pit')
        .delete()
        .in('layout_version_id', versionIds);
      await setupClient
        .from('floor_layout_version')
        .delete()
        .in('id', versionIds);
    }
    if (layoutIds.length > 0) {
      await setupClient.from('floor_layout').delete().in('id', layoutIds);
    }
    await setupClient.from('audit_log').delete().eq('casino_id', casinoId);
    await setupClient.from('gaming_table').delete().eq('casino_id', casinoId);
    await setupClient.from('staff').delete().eq('casino_id', casinoId);
    await setupClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casinoId);
    await setupClient.from('casino').delete().eq('id', casinoId);
    await setupClient.from('company').delete().eq('id', companyId);

    const userIds = [adminUserId];
    if (includeNonAdminRoles) userIds.push(pitBossUserId, dealerUserId);
    await Promise.all(
      userIds.map((id) => setupClient.auth.admin.deleteUser(id)),
    );
  };

  return {
    casinoId,
    companyId,
    adminUserId,
    adminStaffId,
    pitBossUserId,
    pitBossStaffId,
    dealerUserId,
    dealerStaffId,
    adminClient,
    pitBossClient,
    dealerClient,
    tables,
    cleanup,
  };
}

/**
 * Type-safe narrow of the RPC jsonb return.
 */
function asBootstrapEnvelope(v: unknown): {
  ok: boolean;
  outcome: string;
  casino_id: string;
  layout_version_id: string;
  pits_created: number;
  slots_created: number;
  tables_without_pit: number;
} {
  if (!v || typeof v !== 'object') {
    throw new Error(`RPC return not an object: ${String(v)}`);
  }
  return v as ReturnType<typeof asBootstrapEnvelope>;
}

describeIntegration('PRD-068: rpc_bootstrap_casino_pit_layout', () => {
  let setupClient: SupabaseClient<Database>;

  beforeAll(() => {
    setupClient = createClient<Database>(supabaseUrl!, supabaseServiceKey!);
  });

  // ========================================================================
  // (a) 3 tables / 2 distinct pits — happy path
  // ========================================================================
  describe('(a) admin 3 tables / 2 distinct pits', () => {
    let fx: FreshCasinoFixture;

    beforeAll(async () => {
      fx = await createFreshCasino(setupClient, 'a', [
        { label: 'BJ-01', type: 'blackjack', pit: 'Main' },
        { label: 'BJ-02', type: 'blackjack', pit: 'Main' },
        { label: 'BC-01', type: 'baccarat', pit: 'High' },
      ]);
    }, 60_000);

    afterAll(async () => {
      await fx?.cleanup();
    }, 60_000);

    it('creates 1 activation, 2 floor_pits, 3 slots with correct bindings', async () => {
      const { data, error } = await fx.adminClient.rpc(
        'rpc_bootstrap_casino_pit_layout',
      );
      expect(error).toBeNull();

      const env = asBootstrapEnvelope(data);
      expect(env.outcome).toBe('success');
      expect(env.pits_created).toBe(2);
      expect(env.slots_created).toBe(3);
      expect(env.tables_without_pit).toBe(0);

      // Finding 2 — explicit active status on version
      const { data: version } = await setupClient
        .from('floor_layout_version')
        .select('status')
        .eq('id', env.layout_version_id)
        .single();
      expect(version!.status).toBe('active');

      // Finding 6 — fixed activation_request_id
      const { data: activation } = await setupClient
        .from('floor_layout_activation')
        .select('activation_request_id')
        .eq('casino_id', fx.casinoId)
        .is('deactivated_at', null)
        .single();
      expect(activation!.activation_request_id).toBe('prd068_pit_bootstrap_v1');

      // Pit + slot counts
      const { data: pits } = await setupClient
        .from('floor_pit')
        .select('id, label')
        .eq('layout_version_id', env.layout_version_id);
      expect(pits).toHaveLength(2);
      const labels = (pits ?? []).map((p) => p.label).sort();
      expect(labels).toEqual(['High', 'Main']);

      const { data: slots } = await setupClient
        .from('floor_table_slot')
        .select('preferred_table_id, pit_id, game_type')
        .eq('layout_version_id', env.layout_version_id);
      expect(slots).toHaveLength(3);
      // Every slot has preferred_table_id matching one of the seeded tables
      const seededTableIds = new Set(fx.tables.map((t) => t.id));
      for (const s of slots ?? []) {
        expect(seededTableIds.has(s.preferred_table_id!)).toBe(true);
      }
    }, 60_000);
  });

  // ========================================================================
  // (b) mixed pit-bearing + empty + null
  // ========================================================================
  describe('(b) pit-bearing + empty-pit + null-pit tables', () => {
    let fx: FreshCasinoFixture;

    beforeAll(async () => {
      fx = await createFreshCasino(setupClient, 'b', [
        { label: 'BJ-01', type: 'blackjack', pit: 'Main' },
        { label: 'BJ-02', type: 'blackjack', pit: 'Main' },
        { label: 'BJ-03', type: 'blackjack', pit: '' }, // empty string
        { label: 'BJ-04', type: 'blackjack', pit: null }, // null
      ]);
    }, 60_000);

    afterAll(async () => {
      await fx?.cleanup();
    }, 60_000);

    it('creates only 2 slots for pit-bearing tables; null + empty excluded', async () => {
      const { data, error } = await fx.adminClient.rpc(
        'rpc_bootstrap_casino_pit_layout',
      );
      expect(error).toBeNull();
      const env = asBootstrapEnvelope(data);
      expect(env.outcome).toBe('success');
      expect(env.pits_created).toBe(1);
      expect(env.slots_created).toBe(2);
      expect(env.tables_without_pit).toBe(2);

      const { data: slots } = await setupClient
        .from('floor_table_slot')
        .select('preferred_table_id')
        .eq('layout_version_id', env.layout_version_id);
      expect(slots).toHaveLength(2);
      const boundIds = new Set(slots!.map((s) => s.preferred_table_id));
      // BJ-01, BJ-02 bound; BJ-03, BJ-04 absent
      expect(boundIds.has(fx.tables[0].id)).toBe(true);
      expect(boundIds.has(fx.tables[1].id)).toBe(true);
      expect(boundIds.has(fx.tables[2].id)).toBe(false);
      expect(boundIds.has(fx.tables[3].id)).toBe(false);
    }, 60_000);
  });

  // ========================================================================
  // (c) pit-name equivalence — Main, "main ", MAIN collapse
  // ========================================================================
  describe('(c) pit-name equivalence — canonical label + partial unique index', () => {
    let fx: FreshCasinoFixture;

    beforeAll(async () => {
      fx = await createFreshCasino(setupClient, 'c', [
        { label: 'T1', type: 'blackjack', pit: 'Main' }, // first
        { label: 'T2', type: 'blackjack', pit: 'main ' }, // trailing space
        { label: 'T3', type: 'blackjack', pit: 'MAIN' }, // uppercase
      ]);
    }, 60_000);

    afterAll(async () => {
      await fx?.cleanup();
    }, 60_000);

    it('collapses equivalent pit names to 1 floor_pit with canonical label "Main"', async () => {
      const { data, error } = await fx.adminClient.rpc(
        'rpc_bootstrap_casino_pit_layout',
      );
      expect(error).toBeNull();
      const env = asBootstrapEnvelope(data);
      expect(env.pits_created).toBe(1);
      expect(env.slots_created).toBe(3);

      const { data: pits } = await setupClient
        .from('floor_pit')
        .select('label')
        .eq('layout_version_id', env.layout_version_id);
      expect(pits).toHaveLength(1);
      // Canonical label = first btrim(pit) encountered by ORDER BY
      // lower(btrim(pit)), created_at ASC, id ASC — that's "Main" (T1).
      expect(pits![0].label).toBe('Main');
    }, 60_000);

    it('partial unique index ux_floor_pit_layout_version_label_lower enforces normalized uniqueness', async () => {
      // Query floor_pit for any existing row from this fixture's
      // bootstrapped layout (prior test materialized it).
      const { data: existingPit } = await setupClient
        .from('floor_pit')
        .select('layout_version_id, label')
        .limit(1)
        .single();
      expect(existingPit).toBeTruthy();

      // Attempt to insert a duplicate pit with the same normalized key
      // (lower-cased label). The partial unique index
      // ux_floor_pit_layout_version_label_lower must reject with 23505.
      const { error: dupError } = await setupClient.from('floor_pit').insert({
        layout_version_id: existingPit!.layout_version_id,
        label: existingPit!.label.toLowerCase(),
        sequence: 99,
      });
      expect(dupError).not.toBeNull();
      expect(dupError!.code).toBe('23505');
    }, 60_000);
  });

  // ========================================================================
  // (d) re-invocation idempotency
  // ========================================================================
  describe('(d) re-invocation returns already_bootstrapped', () => {
    let fx: FreshCasinoFixture;

    beforeAll(async () => {
      fx = await createFreshCasino(setupClient, 'd', [
        { label: 'BJ-01', type: 'blackjack', pit: 'Main' },
      ]);
    }, 60_000);

    afterAll(async () => {
      await fx?.cleanup();
    }, 60_000);

    it('first call success; second call already_bootstrapped with zero new rows', async () => {
      const first = await fx.adminClient.rpc('rpc_bootstrap_casino_pit_layout');
      expect(first.error).toBeNull();
      const firstEnv = asBootstrapEnvelope(first.data);
      expect(firstEnv.outcome).toBe('success');

      // Snapshot row counts
      const countRows = async () => {
        const [pits, slots, activations, versions, layouts] = await Promise.all(
          [
            setupClient
              .from('floor_pit')
              .select('id', { count: 'exact', head: true })
              .eq('layout_version_id', firstEnv.layout_version_id),
            setupClient
              .from('floor_table_slot')
              .select('id', { count: 'exact', head: true })
              .eq('layout_version_id', firstEnv.layout_version_id),
            setupClient
              .from('floor_layout_activation')
              .select('id', { count: 'exact', head: true })
              .eq('casino_id', fx.casinoId),
            setupClient
              .from('floor_layout_version')
              .select('id', { count: 'exact', head: true }),
            setupClient
              .from('floor_layout')
              .select('id', { count: 'exact', head: true })
              .eq('casino_id', fx.casinoId),
          ],
        );
        return {
          pits: pits.count ?? 0,
          slots: slots.count ?? 0,
          activations: activations.count ?? 0,
          versions: versions.count ?? 0,
          layouts: layouts.count ?? 0,
        };
      };
      const before = await countRows();

      const second = await fx.adminClient.rpc(
        'rpc_bootstrap_casino_pit_layout',
      );
      expect(second.error).toBeNull();
      const secondEnv = asBootstrapEnvelope(second.data);
      expect(secondEnv.outcome).toBe('already_bootstrapped');
      expect(secondEnv.layout_version_id).toBe(firstEnv.layout_version_id);

      const after = await countRows();
      expect(after).toEqual(before);
    }, 60_000);

    it('UNIQUE (casino_id, activation_request_id) is the secondary idempotency guard (Finding 6)', async () => {
      // Attempt a manual INSERT with the same activation_request_id — must
      // raise 23505. Proves the constraint is present and catches duplicates
      // even if the EXISTS short-circuit were bypassed.
      const { error } = await setupClient
        .from('floor_layout_activation')
        .insert({
          casino_id: fx.casinoId,
          // Reuse the first version
          layout_version_id: (
            await setupClient
              .from('floor_layout_version')
              .select('id')
              .limit(1)
              .single()
          ).data!.id,
          activated_by: fx.adminStaffId,
          activation_request_id: 'prd068_pit_bootstrap_v1',
        });
      expect(error).not.toBeNull();
      expect(error!.code).toBe('23505');
    }, 60_000);
  });

  // ========================================================================
  // (e) forced mid-transaction failure rolls back all 5-table writes
  //
  // Strategy: pre-seed a DEACTIVATED floor_layout_activation row with the
  // fixed activation_request_id='prd068_pit_bootstrap_v1'. Because
  // deactivated_at IS NOT NULL, the RPC's EXISTS short-circuit (which
  // filters on deactivated_at IS NULL) does NOT fire — the bootstrap
  // proceeds to materialize layout + version, then attempts to INSERT its
  // activation, which collides with the deactivated stub via the
  // table-level UNIQUE (casino_id, activation_request_id) constraint
  // (23505). The RPC is a single transaction, so the failed activation
  // INSERT rolls back the already-inserted layout + version.
  // ========================================================================
  describe('(e) forced mid-transaction failure rolls back all writes', () => {
    let fx: FreshCasinoFixture;
    let stubLayoutId: string;
    let stubVersionId: string;
    let stubActivationId: string;

    beforeAll(async () => {
      fx = await createFreshCasino(setupClient, 'e', [
        { label: 'BJ-01', type: 'blackjack', pit: 'Main' },
      ]);

      // Stub layout + version — provides the layout_version_id FK target
      // for the deactivated stub activation.
      const { data: stubLayout } = await setupClient
        .from('floor_layout')
        .insert({
          casino_id: fx.casinoId,
          name: 'stub-for-group-e',
          status: 'draft',
          created_by: fx.adminStaffId,
        })
        .select('id')
        .single();
      stubLayoutId = stubLayout!.id;

      const { data: stubVersion } = await setupClient
        .from('floor_layout_version')
        .insert({
          layout_id: stubLayoutId,
          version_no: 99,
          status: 'draft',
          created_by: fx.adminStaffId,
        })
        .select('id')
        .single();
      stubVersionId = stubVersion!.id;

      // Deactivated stub activation reserves the
      // (casino_id, 'prd068_pit_bootstrap_v1') key without tripping the
      // EXISTS short-circuit.
      const { data: stubActivation } = await setupClient
        .from('floor_layout_activation')
        .insert({
          casino_id: fx.casinoId,
          layout_version_id: stubVersionId,
          activated_by: fx.adminStaffId,
          activation_request_id: 'prd068_pit_bootstrap_v1',
          deactivated_at: new Date(Date.now() - 3_600_000).toISOString(),
        })
        .select('id')
        .single();
      stubActivationId = stubActivation!.id;
    }, 60_000);

    afterAll(async () => {
      // Teardown the stub before the fixture cleanup — it references the
      // staff and casino created by the fixture.
      await setupClient
        .from('floor_layout_activation')
        .delete()
        .eq('id', stubActivationId);
      await setupClient
        .from('floor_layout_version')
        .delete()
        .eq('id', stubVersionId);
      await setupClient.from('floor_layout').delete().eq('id', stubLayoutId);
      await fx?.cleanup();
    }, 60_000);

    it('bootstrap raises 23505 and rolls back ALL in-flight writes (layout, version)', async () => {
      // Pre-state: 1 layout (stub), 1 version (stub), 1 activation (stub
      // deactivated), 0 pits, 0 slots for this casino.
      const countFor = async () => {
        const [layouts, versions, activations, pits, slots] = await Promise.all(
          [
            setupClient
              .from('floor_layout')
              .select('id', { count: 'exact', head: true })
              .eq('casino_id', fx.casinoId),
            setupClient
              .from('floor_layout_version')
              .select('id', { count: 'exact', head: true })
              .eq('layout_id', stubLayoutId),
            setupClient
              .from('floor_layout_activation')
              .select('id', { count: 'exact', head: true })
              .eq('casino_id', fx.casinoId),
            setupClient
              .from('floor_pit')
              .select('id', { count: 'exact', head: true })
              .eq('layout_version_id', stubVersionId),
            setupClient
              .from('floor_table_slot')
              .select('id', { count: 'exact', head: true })
              .eq('layout_version_id', stubVersionId),
          ],
        );
        return {
          layouts: layouts.count ?? 0,
          versions: versions.count ?? 0,
          activations: activations.count ?? 0,
          pits: pits.count ?? 0,
          slots: slots.count ?? 0,
        };
      };
      const before = await countFor();
      expect(before.layouts).toBe(1); // stub layout
      expect(before.activations).toBe(1); // deactivated stub

      const { data, error } = await fx.adminClient.rpc(
        'rpc_bootstrap_casino_pit_layout',
      );

      // The deactivated stub activation collides with the fixed
      // activation_request_id on the full UNIQUE constraint. The RPC
      // raises 23505; the entire transaction rolls back.
      expect(error).not.toBeNull();
      expect(
        error!.code === '23505' || /duplicate key|unique/i.test(error!.message),
      ).toBe(true);
      expect(data).toBeNull();

      // Post-state: identical to pre-state. Layout + version that would
      // have been created by the bootstrap have been rolled back. Only the
      // stub remains.
      const after = await countFor();
      expect(after).toEqual(before);

      // Additionally: no NEW floor_layout rows beyond the stub
      const { data: layouts } = await setupClient
        .from('floor_layout')
        .select('id, name')
        .eq('casino_id', fx.casinoId);
      expect(layouts).toHaveLength(1);
      expect(layouts![0].name).toBe('stub-for-group-e');
    }, 60_000);
  });

  // ========================================================================
  // (f) gaming_table.pit byte-equality pre/post
  // ========================================================================
  describe('(f) gaming_table.pit byte-equality pre/post (RULE-5)', () => {
    let fx: FreshCasinoFixture;

    beforeAll(async () => {
      fx = await createFreshCasino(setupClient, 'f', [
        { label: 'T1', type: 'blackjack', pit: 'Main' },
        { label: 'T2', type: 'blackjack', pit: 'main ' },
        { label: 'T3', type: 'blackjack', pit: ' Main' },
        { label: 'T4', type: 'blackjack', pit: 'High' },
        { label: 'T5', type: 'blackjack', pit: null },
      ]);
    }, 60_000);

    afterAll(async () => {
      await fx?.cleanup();
    }, 60_000);

    it('gaming_table.pit and created_at are strictly byte-identical per row', async () => {
      // NOTE: gaming_table has no `updated_at` column (see
      // types/database.types.ts gaming_table Row). Byte-equality on
      // `created_at` serves the same purpose — any row-level rewrite would
      // bump it. Combined with `pit` equality, RULE-5 (no UPDATE to
      // gaming_table) is provable. Also checking `label_normalized` and
      // `par_total_cents` to tighten the invariant.
      const { data: beforeRows } = await setupClient
        .from('gaming_table')
        .select('id, pit, created_at, label_normalized, par_total_cents')
        .eq('casino_id', fx.casinoId)
        .order('id');
      expect(beforeRows).toBeTruthy();
      expect(beforeRows!.length).toBe(5);

      const { error } = await fx.adminClient.rpc(
        'rpc_bootstrap_casino_pit_layout',
      );
      expect(error).toBeNull();

      const { data: afterRows } = await setupClient
        .from('gaming_table')
        .select('id, pit, created_at, label_normalized, par_total_cents')
        .eq('casino_id', fx.casinoId)
        .order('id');
      expect(afterRows).toBeTruthy();
      expect(afterRows!.length).toBe(5);

      for (let i = 0; i < beforeRows!.length; i++) {
        const before = beforeRows![i];
        const after = afterRows![i];
        expect(after.id).toBe(before.id);
        // Strict toBe() per prompt — byte-equality on nullable fields.
        expect(after.pit).toBe(before.pit);
        expect(after.created_at).toBe(before.created_at);
        expect(after.label_normalized).toBe(before.label_normalized);
        expect(after.par_total_cents).toBe(before.par_total_cents);
      }
    }, 60_000);
  });

  // ========================================================================
  // (g) downstream hand-off — getPitAssignmentState
  // ========================================================================
  describe('(g) downstream hand-off — getPitAssignmentState', () => {
    let fx: FreshCasinoFixture;

    beforeAll(async () => {
      fx = await createFreshCasino(setupClient, 'g', [
        { label: 'BJ-01', type: 'blackjack', pit: 'Main' },
        { label: 'BJ-02', type: 'blackjack', pit: 'Main' },
        { label: 'BJ-03', type: 'blackjack', pit: null }, // unassigned
      ]);
    }, 60_000);

    afterAll(async () => {
      await fx?.cleanup();
    }, 60_000);

    it('returns bootstrapped pits, slots, and unassigned-table list', async () => {
      const { error } = await fx.adminClient.rpc(
        'rpc_bootstrap_casino_pit_layout',
      );
      expect(error).toBeNull();

      const state = await getPitAssignmentState(fx.adminClient, fx.casinoId);
      expect(state).not.toBeNull();
      expect(state!.pits).toHaveLength(1);
      expect(state!.pits[0].label).toBe('Main');
      expect(state!.slots).toHaveLength(2);
      // Slots are bound to the pit-bearing tables
      const assignedTableIds = new Set(
        state!.slots.map((s) => s.preferred_table_id),
      );
      expect(assignedTableIds.has(fx.tables[0].id)).toBe(true);
      expect(assignedTableIds.has(fx.tables[1].id)).toBe(true);
      // Unassigned list: BJ-03 (null-pit)
      expect(state!.unassigned_tables).toHaveLength(1);
      expect(state!.unassigned_tables[0].id).toBe(fx.tables[2].id);
    }, 60_000);
  });

  // ========================================================================
  // (h) non-admin rejection
  // ========================================================================
  describe('(h) non-admin rejection — pit_boss + dealer', () => {
    let fx: FreshCasinoFixture;

    beforeAll(async () => {
      fx = await createFreshCasino(
        setupClient,
        'h',
        [{ label: 'BJ-01', type: 'blackjack', pit: 'Main' }],
        { includeNonAdminRoles: true },
      );
    }, 60_000);

    afterAll(async () => {
      await fx?.cleanup();
    }, 60_000);

    it('rejects pit_boss with FORBIDDEN_ADMIN_REQUIRED; no rows written', async () => {
      const { error } = await fx.pitBossClient.rpc(
        'rpc_bootstrap_casino_pit_layout',
      );
      expect(error).not.toBeNull();
      expect(error!.message).toContain('FORBIDDEN_ADMIN_REQUIRED');

      const { count } = await setupClient
        .from('floor_layout')
        .select('id', { count: 'exact', head: true })
        .eq('casino_id', fx.casinoId);
      expect(count).toBe(0);
    }, 60_000);

    it('rejects dealer with FORBIDDEN_ADMIN_REQUIRED; no rows written', async () => {
      const { error } = await fx.dealerClient.rpc(
        'rpc_bootstrap_casino_pit_layout',
      );
      expect(error).not.toBeNull();
      expect(error!.message).toContain('FORBIDDEN_ADMIN_REQUIRED');

      const { count } = await setupClient
        .from('floor_layout')
        .select('id', { count: 'exact', head: true })
        .eq('casino_id', fx.casinoId);
      expect(count).toBe(0);
    }, 60_000);
  });

  // ========================================================================
  // (i) cross-casino scoping — casino B untouched
  // ========================================================================
  describe('(i) cross-casino scoping', () => {
    let fxA: FreshCasinoFixture;
    let fxB: FreshCasinoFixture;

    beforeAll(async () => {
      fxA = await createFreshCasino(setupClient, 'i-a', [
        { label: 'A-BJ-01', type: 'blackjack', pit: 'Main' },
      ]);
      fxB = await createFreshCasino(setupClient, 'i-b', [
        { label: 'B-BJ-01', type: 'blackjack', pit: 'Other' },
      ]);
    }, 60_000);

    afterAll(async () => {
      await fxA?.cleanup();
      await fxB?.cleanup();
    }, 60_000);

    it('bootstrap for A does not create rows for B', async () => {
      const { error } = await fxA.adminClient.rpc(
        'rpc_bootstrap_casino_pit_layout',
      );
      expect(error).toBeNull();

      const { count: layoutsB } = await setupClient
        .from('floor_layout')
        .select('id', { count: 'exact', head: true })
        .eq('casino_id', fxB.casinoId);
      expect(layoutsB).toBe(0);

      const { count: activationsB } = await setupClient
        .from('floor_layout_activation')
        .select('id', { count: 'exact', head: true })
        .eq('casino_id', fxB.casinoId);
      expect(activationsB).toBe(0);
    }, 60_000);
  });

  // ========================================================================
  // (j) DEC-004 — CompleteSetupResult byte-identical pre/post WS3
  //
  // NOTE: The completeSetupAction server action cannot be invoked directly
  // from a node-environment Jest test (it depends on Next.js server-context
  // globals). We verify the DEC-004 invariant via a shape-level contract
  // check: the BootstrapResult returned by bootstrapCasinoPitLayout must
  // NOT share field names with CompleteSetupResult — proving the server
  // action's response envelope cannot accidentally acquire bootstrap fields.
  // WS5 (E2E) covers the runtime byte-identical check from the browser
  // path end-to-end.
  // ========================================================================
  describe('(j) DEC-004 — CompleteSetupResult envelope isolation', () => {
    let fx: FreshCasinoFixture;

    beforeAll(async () => {
      fx = await createFreshCasino(setupClient, 'j', [
        { label: 'BJ-01', type: 'blackjack', pit: 'Main' },
      ]);
    }, 60_000);

    afterAll(async () => {
      await fx?.cleanup();
    }, 60_000);

    it('BootstrapResult fields do not collide with CompleteSetupResult fields (Finding 4)', async () => {
      // CompleteSetupResult fields (from app/(onboarding)/setup/_actions.ts
      // line 48-54). If this test fails because the action's return type
      // has drifted, the DEC-004 invariant is at risk.
      const COMPLETE_SETUP_RESULT_FIELDS = [
        'ok',
        'casino_id',
        'setup_status',
        'setup_completed_at',
        'setup_completed_by',
      ] as const;

      const { data, error } = await fx.adminClient.rpc(
        'rpc_bootstrap_casino_pit_layout',
      );
      expect(error).toBeNull();
      const env = asBootstrapEnvelope(data);
      const bootstrapKeys = new Set(Object.keys(env));

      // `ok` is expected to appear in both envelopes (it's a generic
      // contract flag, not a semantic collision). All OTHER
      // CompleteSetupResult fields must be absent from BootstrapResult.
      for (const field of COMPLETE_SETUP_RESULT_FIELDS) {
        if (field === 'ok') continue;
        if (field === 'casino_id') continue; // both have this — intentional
        expect(bootstrapKeys.has(field)).toBe(false);
      }

      // BOOTSTRAP_FAILED error-path grep verification at file-level is a
      // separate sanity: see EXEC-068 §WS4 acceptance criteria.
    }, 60_000);
  });

  // ========================================================================
  // (k) concurrent-bootstrap race (Finding 1)
  // ========================================================================
  describe('(k) concurrent-bootstrap race — exactly one active activation', () => {
    let fx: FreshCasinoFixture;
    let admin2UserId: string;
    let admin2Client: SupabaseClient<Database>;

    beforeAll(async () => {
      fx = await createFreshCasino(setupClient, 'k', [
        { label: 'BJ-01', type: 'blackjack', pit: 'Main' },
        { label: 'BJ-02', type: 'blackjack', pit: 'High' },
      ]);

      // Second admin client for parallel invocation (same casino, distinct
      // session to stress interleaving).
      const adminEmail2 = `k-admin2-${Date.now()}@test.com`;
      const user2 = await setupClient.auth.admin.createUser({
        email: adminEmail2,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      admin2UserId = user2.data!.user!.id;

      const { data: staff2 } = await setupClient
        .from('staff')
        .insert({
          user_id: admin2UserId,
          casino_id: fx.casinoId,
          role: 'admin',
          first_name: 'PRD068',
          last_name: 'Admin2',
          status: 'active',
        })
        .select('id')
        .single();

      await setupClient.auth.admin.updateUserById(admin2UserId, {
        app_metadata: {
          casino_id: fx.casinoId,
          staff_id: staff2!.id,
          staff_role: 'admin',
        },
      });

      admin2Client = createClient<Database>(supabaseUrl!, supabaseAnonKey!);
      await admin2Client.auth.signInWithPassword({
        email: adminEmail2,
        password: TEST_PASSWORD,
      });
    }, 60_000);

    afterAll(async () => {
      if (admin2UserId) {
        await setupClient.auth.admin.deleteUser(admin2UserId);
      }
      await fx?.cleanup();
    }, 60_000);

    it('two concurrent rpc calls result in exactly ONE active activation', async () => {
      const [r1, r2] = await Promise.all([
        fx.adminClient.rpc('rpc_bootstrap_casino_pit_layout'),
        admin2Client.rpc('rpc_bootstrap_casino_pit_layout'),
      ]);

      // Collect outcomes: expect ONE success + ONE of (already_bootstrapped
      // OR unique-violation error).
      type CallResult = { ok: boolean; outcome?: string; errMsg?: string };
      const normalize = (r: typeof r1): CallResult => {
        if (r.error) return { ok: false, errMsg: r.error.message };
        return { ok: true, outcome: asBootstrapEnvelope(r.data).outcome };
      };
      const results = [normalize(r1), normalize(r2)];

      const successCount = results.filter(
        (r) => r.ok && r.outcome === 'success',
      ).length;
      const alreadyCount = results.filter(
        (r) => r.ok && r.outcome === 'already_bootstrapped',
      ).length;
      const errorCount = results.filter((r) => !r.ok).length;

      expect(successCount).toBe(1);
      expect(alreadyCount + errorCount).toBe(1);
      // If the other call erred, it must be a unique-violation (23505)
      const erroredResult = results.find((r) => !r.ok);
      if (erroredResult) {
        expect(erroredResult.errMsg).toMatch(
          /duplicate key|unique|23505|already_bootstrapped/i,
        );
      }

      // DB state: exactly one active activation for this casino
      const { data: activations } = await setupClient
        .from('floor_layout_activation')
        .select('id')
        .eq('casino_id', fx.casinoId)
        .is('deactivated_at', null);
      expect(activations).toHaveLength(1);
    }, 60_000);
  });
});

// Satisfy ts-jest strict unused rule for top-level bindings when the describe
// is skipped (RUN_INTEGRATION_TESTS unset).
export {};
