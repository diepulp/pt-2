# Player Exclusion E2E Tests — QA-006 Exemplar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the exemplar E2E test workflow for QA-006 by implementing browser and system verification tests for the player exclusion lifecycle.

**Architecture:** Mode B (browser login) tests cover the compliance panel CRUD and role gating — the canonical E2E surface. One Mode C (authenticated client) test covers auto-close on hard_block as the system verification exemplar. Fixtures follow the admin-helpers.ts role-parameterized pattern extended with player + player_casino. No shared auth helper extraction (P1 backlog, out of scope).

**Tech Stack:** Playwright, Supabase (local), QA-006 auth modes B & C

**Gap Status:** GAP-EXCL-E2E-001 (P1) — **PARTIALLY RESOLVED.** Admin panel CRUD + role gating + system enforcement (auto-close) covered. Pit-path enforcement (new-slip-modal seating block) scaffolded only — gap remains open for that surface until implemented or explicitly de-scoped.

---

## File Structure

```
e2e/
├── fixtures/
│   └── exclusion-fixtures.ts          # NEW — Exclusion scenario factories
├── workflows/
│   └── player-exclusion.spec.ts       # NEW — Mode B browser tests (5 tests)
└── api/
    └── player-exclusion-enforcement.spec.ts  # NEW — Mode C system verification (1 test)
```

| File | Responsibility |
|------|---------------|
| `e2e/fixtures/exclusion-fixtures.ts` | Two factories: `createExclusionPanelScenario(role)` for browser tests, `createExclusionWithActiveSlip()` for Mode C auto-close test |
| `e2e/workflows/player-exclusion.spec.ts` | Mode B tests: admin CRUD lifecycle (serial), role gating for pit_boss/dealer (parallel) |
| `e2e/api/player-exclusion-enforcement.spec.ts` | Mode C test: auto-close visits/slips on hard_block exclusion via RPC |

---

## Task 1: Exclusion Fixture Factory

**Files:**
- Create: `e2e/fixtures/exclusion-fixtures.ts`

- [ ] **Step 1: Write the fixture factory file**

```typescript
/**
 * Player Exclusion E2E Fixtures
 *
 * Provides scenario factories for exclusion compliance panel tests (Mode B)
 * and auto-close verification tests (Mode C).
 *
 * Follows admin-helpers.ts pattern: role-parameterized, ADR-043 company-first,
 * ADR-024 app_metadata stamping with staff_id.
 *
 * @see QA-006 §3 — Fixture factory requirements
 * @see e2e/fixtures/admin-helpers.ts — Base pattern
 */

import { randomUUID } from 'crypto';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ExclusionPanelScenario {
  casinoId: string;
  staffId: string;
  staffUserId: string;
  playerId: string;
  testEmail: string;
  testPassword: string;
  staffRole: string;
  authToken: string;
  cleanup: () => Promise<void>;
}

export interface ExclusionEnforcementScenario extends ExclusionPanelScenario {
  tableId: string;
  visitId: string;
  slipId: string;
}

// ---------------------------------------------------------------------------
// Panel Scenario — for Mode B compliance panel tests
// ---------------------------------------------------------------------------

/**
 * Creates company → casino → auth user (role) → staff → player → player_casino.
 * Returns credentials for Mode B browser login and Mode C authenticated client.
 *
 * No gaming table, visit, or slip — minimal fixture per QA-006 §3.
 */
export async function createExclusionPanelScenario(
  role: 'admin' | 'pit_boss' | 'dealer',
): Promise<ExclusionPanelScenario> {
  const supabase = createServiceClient();
  const uniqueId = randomUUID().slice(0, 8);
  const testPrefix = `e2e_excl_${role}_${uniqueId}`;

  // ADR-043: company before casino
  const { data: company, error: companyError } = await supabase
    .from('company')
    .insert({ name: `${testPrefix}_company` })
    .select()
    .single();
  if (companyError || !company) {
    throw new Error(`Failed to create company: ${companyError?.message}`);
  }

  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({
      name: `${testPrefix}_casino`,
      status: 'active',
      company_id: company.id,
    })
    .select()
    .single();
  if (casinoError || !casino) {
    throw new Error(`Failed to create casino: ${casinoError?.message}`);
  }

  const testEmail = `${testPrefix}@test.com`;
  const testPassword = 'TestPassword123!';

  // Phase 1: create auth user with casino_id + staff_role
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: { casino_id: casino.id, staff_role: role },
    });
  if (authError || !authData.user) {
    throw new Error(`Failed to create auth user: ${authError?.message}`);
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      casino_id: casino.id,
      user_id: authData.user.id,
      first_name: 'Test',
      last_name: role,
      email: testEmail,
      role,
      status: 'active',
    })
    .select()
    .single();
  if (staffError || !staff) {
    throw new Error(`Failed to create staff: ${staffError?.message}`);
  }

  // Phase 2: stamp staff_id into app_metadata (ADR-024)
  await supabase.auth.admin.updateUserById(authData.user.id, {
    app_metadata: {
      casino_id: casino.id,
      staff_id: staff.id,
      staff_role: role,
    },
  });

  // Create player (global) + link to casino
  const { data: player, error: playerError } = await supabase
    .from('player')
    .insert({
      first_name: `${testPrefix}_player`,
      last_name: 'Exclusion',
    })
    .select()
    .single();
  if (playerError || !player) {
    throw new Error(`Failed to create player: ${playerError?.message}`);
  }

  const { error: linkError } = await supabase
    .from('player_casino')
    .insert({ player_id: player.id, casino_id: casino.id, status: 'active' });
  if (linkError) {
    throw new Error(`Failed to link player to casino: ${linkError.message}`);
  }

  // Sign in for auth token (Mode C fallback)
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in: ${signInError?.message}`);
  }

  const cleanup = async () => {
    const c = createServiceClient();
    // Reverse FK order — exclusions first (may be created during test)
    await c.from('player_exclusion').delete().eq('casino_id', casino.id);
    await c.from('player_casino').delete().eq('player_id', player.id);
    await c.from('player').delete().eq('id', player.id);
    await c.from('staff').delete().eq('id', staff.id);
    await c.from('casino').delete().eq('id', casino.id);
    await c.from('company').delete().eq('id', company.id);
    await c.auth.admin.deleteUser(authData.user.id);
  };

  return {
    casinoId: casino.id,
    staffId: staff.id,
    staffUserId: authData.user.id,
    playerId: player.id,
    testEmail,
    testPassword,
    staffRole: role,
    authToken: signInData.session.access_token,
    cleanup,
  };
}

// ---------------------------------------------------------------------------
// Enforcement Scenario — for Mode C auto-close tests
// ---------------------------------------------------------------------------

/**
 * Extends panel scenario with gaming_table + visit + open rating_slip.
 * Used for Mode C verification: create hard_block → verify auto-close.
 *
 * Always creates admin role (needs permission to create exclusions via RPC).
 */
export async function createExclusionWithActiveSlip(): Promise<ExclusionEnforcementScenario> {
  const base = await createExclusionPanelScenario('admin');
  const supabase = createServiceClient();

  // Gaming table
  const { data: table, error: tableError } = await supabase
    .from('gaming_table')
    .insert({
      casino_id: base.casinoId,
      label: `e2e_excl_table_${randomUUID().slice(0, 8)}`,
      type: 'blackjack',
      status: 'active',
    })
    .select()
    .single();
  if (tableError || !table) {
    throw new Error(`Failed to create gaming table: ${tableError?.message}`);
  }

  // Visit (gaming_day overwritten by trigger)
  const visitId = randomUUID();
  const { data: visit, error: visitError } = await supabase
    .from('visit')
    .insert({
      id: visitId,
      casino_id: base.casinoId,
      player_id: base.playerId,
      started_at: new Date().toISOString(),
      visit_kind: 'gaming_identified_rated',
      visit_group_id: visitId,
      gaming_day: '1970-01-01',
    })
    .select()
    .single();
  if (visitError || !visit) {
    throw new Error(`Failed to create visit: ${visitError?.message}`);
  }

  // Open rating slip at seat 1
  const { data: slip, error: slipError } = await supabase
    .from('rating_slip')
    .insert({
      casino_id: base.casinoId,
      visit_id: visit.id,
      gaming_table_id: table.id,
      player_id: base.playerId,
      staff_id: base.staffId,
      seat_number: '1',
      status: 'open',
      average_bet: 2500,
    })
    .select()
    .single();
  if (slipError || !slip) {
    throw new Error(`Failed to create rating slip: ${slipError?.message}`);
  }

  // Extend cleanup to cover new entities
  const originalCleanup = base.cleanup;
  const cleanup = async () => {
    const c = createServiceClient();
    await c.from('audit_log').delete().eq('casino_id', base.casinoId);
    await c.from('rating_slip').delete().eq('id', slip.id);
    await c.from('visit').delete().eq('id', visit.id);
    await c.from('gaming_table').delete().eq('id', table.id);
    await originalCleanup();
  };

  return {
    ...base,
    tableId: table.id,
    visitId: visit.id,
    slipId: slip.id,
    cleanup,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seeds an exclusion via service-role direct insert (bypasses RLS).
 * Use for pre-populating exclusions in role-gating tests where the
 * test user may not have permission to create exclusions via RPC.
 */
export async function seedExclusion(
  casinoId: string,
  playerId: string,
  staffId: string,
  enforcement: 'hard_block' | 'soft_alert' | 'monitor' = 'hard_block',
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('player_exclusion')
    .insert({
      casino_id: casinoId,
      player_id: playerId,
      exclusion_type: 'internal_ban',
      enforcement,
      reason: `E2E seed exclusion (${enforcement})`,
      effective_from: new Date().toISOString(),
      created_by: staffId,
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`Failed to seed exclusion: ${error?.message}`);
  }
  return data.id;
}

/**
 * Creates an authenticated Supabase client with a real JWT (Mode C).
 * Used for RPC calls in system verification tests.
 */
export function createAuthenticatedClient(authToken: string) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${authToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Browser login via /auth/login form (Mode B).
 * Replicates admin-helpers.ts authenticateAdmin pattern.
 */
export async function authenticateAndNavigate(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  targetUrl: string,
): Promise<void> {
  await page.goto('/auth/login', { waitUntil: 'networkidle' });
  await page
    .locator('button[type="submit"]:has-text("Login")')
    .waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await Promise.all([
    page.waitForResponse(
      (resp) => resp.url().includes('/auth/v1/token') && resp.status() === 200,
    ),
    page.locator('button[type="submit"]').click(),
  ]);
  // Hard navigate to target (avoids RSC stream interruption)
  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 15_000,
  });
  if (page.url().includes('/auth/login')) {
    throw new Error('Authentication failed: redirected back to login');
  }
}
```

- [ ] **Step 2: Verify the fixture compiles**

Run: `npx tsc --noEmit e2e/fixtures/exclusion-fixtures.ts 2>&1 | head -20`

If type errors, fix imports. Column names reconciled against `types/database.types.ts`: `average_bet` (not `_cents`), `computed_theo_cents`, `seat_number` is `string | null` (not number).

- [ ] **Step 3: Commit**

```bash
git add e2e/fixtures/exclusion-fixtures.ts
git commit -m "test(e2e): add exclusion fixture factory for QA-006 exemplar

Creates two factories:
- createExclusionPanelScenario(role) for Mode B compliance panel tests
- createExclusionWithActiveSlip() for Mode C auto-close verification

Follows admin-helpers.ts pattern with ADR-024 app_metadata stamping.
Closes fixture prerequisite for GAP-EXCL-E2E-001."
```

---

## Task 2: Mode B — Exclusion CRUD Lifecycle

**Files:**
- Create: `e2e/workflows/player-exclusion.spec.ts`

This task writes the serial CRUD lifecycle group: create exclusion → verify UI → lift → verify cleared.

- [ ] **Step 1: Write the CRUD lifecycle tests**

```typescript
/**
 * Player Exclusion — E2E — Mode B (browser login)
 *
 * Tests the exclusion compliance panel CRUD lifecycle and role gating
 * via the real browser/app surface.
 *
 * Auth: Mode B — Playwright navigates to /auth/login, real JWT via cookies.
 * Verification class: E2E (canonical browser surface under test).
 *
 * @see QA-006 §1 — Auth Mode B selection rationale
 * @see GAP-EXCL-E2E-001 — Gap being closed
 */

import { test, expect } from '@playwright/test';

import type { ExclusionPanelScenario } from '../fixtures/exclusion-fixtures';
import {
  authenticateAndNavigate,
  createExclusionPanelScenario,
  seedExclusion,
} from '../fixtures/exclusion-fixtures';

// ============================================================================
// CRUD Lifecycle — Admin creates and lifts an exclusion
// ============================================================================

test.describe('Player Exclusion CRUD — E2E — Mode B (browser login)', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: ExclusionPanelScenario;

  test.beforeAll(async () => {
    scenario = await createExclusionPanelScenario('admin');
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  /** Navigate to Player 360 → Compliance tab. Reused across serial tests. */
  async function navigateToComplianceTab(
    page: import('@playwright/test').Page,
  ) {
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      `/players/${scenario.playerId}`,
    );
    // Switch to Compliance tab in right rail (default is "collaboration")
    await page.getByRole('button', { name: 'Compliance' }).click();
    // Wait for ExclusionTile to render
    await page.getByText('Exclusions').waitFor({ state: 'visible' });
  }

  test('should show empty state before any exclusions', async ({ page }) => {
    await navigateToComplianceTab(page);
    await expect(page.getByText('No active exclusions')).toBeVisible();
  });

  test('should create a hard_block exclusion via dialog', async ({ page }) => {
    await navigateToComplianceTab(page);

    // Open create dialog
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(
      page.getByRole('heading', { name: 'Add Exclusion' }),
    ).toBeVisible();

    // Fill form fields
    // Type select (shadcn/radix Select — click trigger, then option)
    await page.locator('#exclusion_type').click();
    await page.getByRole('option', { name: 'Self Exclusion' }).click();

    // Enforcement select
    await page.locator('#enforcement').click();
    await page.getByRole('option', { name: 'Hard Block' }).click();

    // Reason (required textarea)
    await page.locator('#reason').fill('E2E test: self-exclusion hard block');

    // Submit and wait for API response
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/v1/players/') &&
          resp.url().includes('/exclusions') &&
          resp.request().method() === 'POST' &&
          resp.status() === 201,
      ),
      page.getByRole('button', { name: 'Create Exclusion' }).click(),
    ]);

    // Verify success toast
    await expect(page.getByText('Exclusion created')).toBeVisible();

    // Verify exclusion row appears in tile
    await expect(page.getByText('Self Exclusion')).toBeVisible();
    await expect(page.getByText('Hard Block')).toBeVisible();
    await expect(page.getByText('1 active')).toBeVisible();
  });

  test('should lift the exclusion via dialog', async ({ page }) => {
    await navigateToComplianceTab(page);

    // Wait for the active exclusion to render
    await expect(page.getByText('1 active')).toBeVisible();

    // Click Lift on the exclusion row
    await page.getByRole('button', { name: 'Lift' }).click();
    await expect(
      page.getByRole('heading', { name: 'Lift Exclusion' }),
    ).toBeVisible();

    // Verify summary shows the exclusion details
    await expect(page.getByText('Self Exclusion')).toBeVisible();
    await expect(page.getByText('Hard Block')).toBeVisible();

    // Verify submit button is disabled without reason
    await expect(
      page.getByRole('button', { name: 'Lift Exclusion' }),
    ).toBeDisabled();

    // Fill lift reason
    await page
      .locator('#lift_reason')
      .fill('E2E test: lifting self-exclusion for verification');

    // Submit and wait for API response
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes('/lift') &&
          resp.request().method() === 'POST' &&
          resp.status() === 200,
      ),
      page.getByRole('button', { name: 'Lift Exclusion' }).click(),
    ]);

    // Verify success toast
    await expect(page.getByText('Exclusion lifted')).toBeVisible();

    // Verify tile returns to empty state
    await expect(page.getByText('No active exclusions')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run tests to verify they execute (may fail on selector issues)**

Run: `npx playwright test e2e/workflows/player-exclusion.spec.ts --reporter=list 2>&1 | tail -30`

Expected: Tests either pass or fail with actionable selector errors. Fix any selector mismatches (trigger IDs, option text, toast text) by reading the actual component code.

- [ ] **Step 3: Fix any selector issues and re-run until passing**

Common fixes:
- Shadcn Select trigger: if `#exclusion_type` doesn't work, try `page.getByLabel('Type')` or `page.getByRole('combobox')`
- Toast text: verify exact strings in `create-exclusion-dialog.tsx` and `lift-exclusion-dialog.tsx`
- "1 active" badge: verify exact text in `exclusion-tile.tsx`

- [ ] **Step 4: Commit**

```bash
git add e2e/workflows/player-exclusion.spec.ts
git commit -m "test(e2e): add exclusion CRUD lifecycle tests (Mode B)

Serial group: empty state → create hard_block → verify tile → lift → verify cleared.
Admin role covers both create and lift permissions.
QA-006 §1 Mode B (browser login), verification class: E2E."
```

---

## Task 3: Mode B — Role Gating

**Files:**
- Modify: `e2e/workflows/player-exclusion.spec.ts` (append to file)

Parallel tests verifying button visibility per staff role.

- [ ] **Step 1: Append role gating tests to the spec file**

Add the following after the CRUD lifecycle describe block:

```typescript
// ============================================================================
// Role Gating — Button visibility per staff role
// ============================================================================

test.describe('Player Exclusion Role Gating — E2E — Mode B (browser login)', () => {
  // Parallel: each test uses its own scenario with a different role
  test.describe.configure({ mode: 'parallel' });

  test('pit_boss should see Add button but not Lift button', async ({
    page,
  }) => {
    const scenario = await createExclusionPanelScenario('pit_boss');
    try {
      // Seed an exclusion so Lift button would appear if permitted
      await seedExclusion(
        scenario.casinoId,
        scenario.playerId,
        scenario.staffId,
        'hard_block',
      );

      await authenticateAndNavigate(
        page,
        scenario.testEmail,
        scenario.testPassword,
        `/players/${scenario.playerId}`,
      );
      await page.getByRole('button', { name: 'Compliance' }).click();
      await page.getByText('Exclusions').waitFor({ state: 'visible' });

      // pit_boss CAN create exclusions
      await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();

      // pit_boss CANNOT lift exclusions — Lift button should not exist
      await expect(
        page.getByRole('button', { name: 'Lift' }),
      ).not.toBeVisible();
    } finally {
      await scenario.cleanup();
    }
  });

  test('dealer should see neither Add nor Lift button', async ({ page }) => {
    const scenario = await createExclusionPanelScenario('dealer');
    try {
      // Seed exclusion so buttons would appear if permitted
      await seedExclusion(
        scenario.casinoId,
        scenario.playerId,
        scenario.staffId,
        'hard_block',
      );

      await authenticateAndNavigate(
        page,
        scenario.testEmail,
        scenario.testPassword,
        `/players/${scenario.playerId}`,
      );
      await page.getByRole('button', { name: 'Compliance' }).click();
      await page.getByText('Exclusions').waitFor({ state: 'visible' });

      // dealer CANNOT create or lift
      await expect(
        page.getByRole('button', { name: 'Add' }),
      ).not.toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Lift' }),
      ).not.toBeVisible();
    } finally {
      await scenario.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run the full spec file**

Run: `npx playwright test e2e/workflows/player-exclusion.spec.ts --reporter=list 2>&1 | tail -30`

Expected: All 5 tests pass (3 serial CRUD + 2 parallel role gating).

- [ ] **Step 3: Fix issues and re-run until passing**

Note: The `not.toBeVisible()` assertions use Playwright's auto-waiting with a default timeout. If the element doesn't exist at all (not just hidden), this still passes. If the element is present but hidden, it also passes. Both are correct for role gating.

If the dealer test fails because the Compliance tab or ExclusionTile itself is role-gated (not just the buttons), adjust the assertion to verify the appropriate access level.

- [ ] **Step 4: Commit**

```bash
git add e2e/workflows/player-exclusion.spec.ts
git commit -m "test(e2e): add exclusion role gating tests (Mode B)

Parallel group: pit_boss sees Add not Lift, dealer sees neither.
Each test creates isolated scenario with role-specific auth user.
QA-006 §1 Mode B, §4 parallel with per-test cleanup."
```

---

## Task 4: Mode C — Auto-Close on Hard Block

**Files:**
- Create: `e2e/api/player-exclusion-enforcement.spec.ts`

System verification: creating a hard_block exclusion auto-closes active visits and slips.

- [ ] **Step 1: Write the Mode C auto-close test**

```typescript
/**
 * Player Exclusion Enforcement — System Verification — Mode C (authenticated client)
 *
 * Verifies that creating a hard_block exclusion via RPC auto-closes
 * active visits and open rating slips, with audit trail.
 *
 * Auth: Mode C — signInWithPassword → Bearer token → Supabase client.
 * Verification class: System Verification (real JWT/RPC/RLS, no browser surface).
 *
 * @see QA-006 §1 — Mode C for SECURITY DEFINER RPCs
 * @see QA-006 §5 — SECURITY DEFINER RPC testing pattern
 * @see EXEC-055 — Exclusion enforcement wiring spec
 */

import { test, expect } from '@playwright/test';

import type { ExclusionEnforcementScenario } from '../fixtures/exclusion-fixtures';
import {
  createAuthenticatedClient,
  createExclusionWithActiveSlip,
} from '../fixtures/exclusion-fixtures';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe(
  'Exclusion Auto-Close — System Verification — Mode C (authenticated client)',
  () => {
    let scenario: ExclusionEnforcementScenario;

    test.beforeAll(async () => {
      scenario = await createExclusionWithActiveSlip();
    });

    test.afterAll(async () => {
      await scenario?.cleanup();
    });

    test('hard_block exclusion should auto-close active visit and open slip', async () => {
      // Pre-condition: visit is open, slip is open
      const serviceClient = createServiceClient();

      const { data: visitBefore } = await serviceClient
        .from('visit')
        .select('ended_at')
        .eq('id', scenario.visitId)
        .single();
      expect(visitBefore?.ended_at).toBeNull();

      const { data: slipBefore } = await serviceClient
        .from('rating_slip')
        .select('status')
        .eq('id', scenario.slipId)
        .single();
      expect(slipBefore?.status).toBe('open');

      // Act: create hard_block exclusion via authenticated RPC
      const authedClient = createAuthenticatedClient(scenario.authToken);
      const { error: rpcError } = await authedClient.rpc(
        'rpc_create_player_exclusion',
        {
          p_player_id: scenario.playerId,
          p_exclusion_type: 'internal_ban',
          p_enforcement: 'hard_block',
          p_reason: 'E2E auto-close verification',
        },
      );
      expect(rpcError).toBeNull();

      // Assert: visit auto-closed (ended_at set)
      const { data: visitAfter } = await serviceClient
        .from('visit')
        .select('ended_at')
        .eq('id', scenario.visitId)
        .single();
      expect(visitAfter?.ended_at).not.toBeNull();

      // Assert: slip auto-closed with theo=0
      const { data: slipAfter } = await serviceClient
        .from('rating_slip')
        .select('status, computed_theo_cents')
        .eq('id', scenario.slipId)
        .single();
      expect(slipAfter?.status).toBe('closed');
      expect(slipAfter?.computed_theo_cents).toBe(0);

      // Assert: audit_log entry for auto-close
      const { data: auditEntries } = await serviceClient
        .from('audit_log')
        .select('action, domain, details')
        .eq('casino_id', scenario.casinoId)
        .eq('action', 'exclusion_auto_close')
        .order('created_at', { ascending: false })
        .limit(1);
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries![0].domain).toBe('player_exclusion');
    });
  },
);
```

- [ ] **Step 2: Run the Mode C test**

Run: `npx playwright test e2e/api/player-exclusion-enforcement.spec.ts --reporter=list 2>&1 | tail -20`

Expected: 1 test passes. If the RPC call fails, check:
1. Auth token is valid (not expired — tokens have limited TTL)
2. RPC parameter names match the migration (`p_player_id`, `p_exclusion_type`, etc.)

- [ ] **Step 3: Fix any runtime issues and re-run**

Schema reconciled against `types/database.types.ts`:
- `rating_slip.average_bet` (number, not `_cents` suffix) ✓
- `rating_slip.computed_theo_cents` (number) ✓
- `rating_slip.seat_number` (string, not number) ✓
- `audit_log` columns: `action`, `domain`, `details`, `casino_id`, `actor_id`, `created_at`, `id` — no `entity_id`/`entity_type` ✓

- [ ] **Step 4: Commit**

```bash
git add e2e/api/player-exclusion-enforcement.spec.ts
git commit -m "test(e2e): add exclusion auto-close system verification (Mode C)

Verifies hard_block exclusion auto-closes active visit + open slip via RPC.
Asserts visit.ended_at set, slip.status=closed, computed_theo=0, audit_log entry.
QA-006 §1 Mode C, §5 SECURITY DEFINER pattern. Verification class: System."
```

---

## Task 5: Mode B — Enforcement in New Slip Modal (Stretch)

**Files:**
- Modify: `e2e/workflows/player-exclusion.spec.ts` (append to file)

This test verifies the UI-level enforcement: hard_block prevents seating in the new-slip modal. This is more complex because it requires pit dashboard infrastructure (floor layout, table sessions).

**Prerequisite understanding:** The new-slip-modal is rendered on the `/pit` dashboard inside a table panel. Opening it requires an active table session. The `e2e/fixtures/rating-slip-fixtures.ts` provides this setup.

- [ ] **Step 1: Read the rating-slip-fixtures pattern**

Read: `e2e/fixtures/rating-slip-fixtures.ts` (full file)
Read: `e2e/workflows/rating-slip-modal.spec.ts` (lines 1-100 for setup pattern)

Identify:
- How `createRatingSlipTestScenario()` sets up the pit dashboard
- How the spec navigates to a table and opens the new-slip modal
- How player search works in the modal

- [ ] **Step 2: Design the enforcement test approach**

Two approaches (choose based on fixture complexity):

**Approach A — Extend rating-slip fixture:**
Create a wrapper that calls `createRatingSlipTestScenario()`, then adds a second player with a hard_block exclusion via `seedExclusion()`. Test searches for the excluded player in the new-slip modal.

**Approach B — API-level enforcement test (Mode C):**
Instead of testing through the modal UI (which requires complex pit dashboard setup), test the enforcement at the API level: call the exclusion status endpoint and verify the new-slip-modal's `getExclusionStatus()` would receive `blocked`. This is simpler but less canonical.

Recommend Approach A if rating-slip-fixtures work reliably. Approach B if the pit dashboard setup is flaky.

- [ ] **Step 3: Implement the chosen approach**

If Approach A, append to `player-exclusion.spec.ts`:

```typescript
// ============================================================================
// Enforcement — Hard Block Prevents Seating in New Slip Modal
// ============================================================================

test.describe('Exclusion Enforcement in New Slip Modal — E2E — Mode B (browser login)', () => {
  // This test requires pit dashboard infrastructure.
  // It builds on rating-slip-fixtures for table session setup.
  //
  // NOTE: This is a stretch test. If the pit dashboard fixture is
  // unreliable, replace with Mode C API-level enforcement verification.

  test.skip(true, 'TODO: implement after rating-slip fixture validation');

  // Implementation outline:
  // 1. Create rating-slip scenario (provides active table session)
  // 2. Create additional player linked to same casino
  // 3. Seed hard_block exclusion for that player
  // 4. Navigate to /pit, open table panel, click empty seat
  // 5. Search for excluded player in new-slip modal
  // 6. Select player, choose seat, click "Start Slip"
  // 7. Assert error: "This player has an active exclusion and cannot be seated."
  // 8. Verify no slip was created
});
```

- [ ] **Step 4: Commit (even if test.skip)**

```bash
git add e2e/workflows/player-exclusion.spec.ts
git commit -m "test(e2e): scaffold enforcement test in new-slip modal (Mode B)

Skipped pending pit dashboard fixture validation.
Implementation outline documented for follow-up."
```

---

## Task 6: Update Gap Doc

**Files:**
- Modify: `docs/issues/gaps/player-exclusion/EXCLUSION-SURFACE-ISSUES-GAPS-2026-03-27.md`

- [ ] **Step 1: Read the gap doc**

Read the file and locate `GAP-EXCL-E2E-001`.

- [ ] **Step 2: Update the gap status**

Change status from open/P1 to PARTIALLY RESOLVED. The pit-path enforcement surface (new-slip-modal seating block) is the most operationally canonical test and remains pending.

```markdown
**GAP-EXCL-E2E-001 (P1, PARTIALLY RESOLVED):** No E2E tests for exclusion workflow
→ Covered: `e2e/workflows/player-exclusion.spec.ts` (Mode B: CRUD lifecycle, role gating),
  `e2e/api/player-exclusion-enforcement.spec.ts` (Mode C: auto-close verification).
  QA-006 exemplar established.
→ **Still open:** Pit-path enforcement — new-slip-modal hard_block seating rejection.
  Scaffolded in player-exclusion.spec.ts (test.skip). Blocked on pit dashboard fixture
  complexity. Gap remains open until this test is implemented or the surface is
  explicitly de-scoped from the gap definition.
```

- [ ] **Step 3: Commit**

```bash
git add docs/issues/gaps/player-exclusion/EXCLUSION-SURFACE-ISSUES-GAPS-2026-03-27.md
git commit -m "docs: mark GAP-EXCL-E2E-001 as partially resolved

Covered:
- Mode B: CRUD lifecycle (create/lift), role gating (pit_boss/dealer)
- Mode C: auto-close on hard_block system verification
Still open: pit-path enforcement (new-slip-modal seating block)"
```

---

## Test Summary

| Test | Mode | Class | Serial/Parallel | File |
|------|------|-------|-----------------|------|
| Empty state before exclusions | B | E2E | Serial | `player-exclusion.spec.ts` |
| Create hard_block via dialog | B | E2E | Serial | `player-exclusion.spec.ts` |
| Lift exclusion via dialog | B | E2E | Serial | `player-exclusion.spec.ts` |
| pit_boss: Add visible, Lift hidden | B | E2E | Parallel | `player-exclusion.spec.ts` |
| dealer: Add hidden, Lift hidden | B | E2E | Parallel | `player-exclusion.spec.ts` |
| Auto-close visit+slip on hard_block | C | System | N/A | `player-exclusion-enforcement.spec.ts` |
| New-slip-modal enforcement | B | E2E | **Skipped — gap open** | `player-exclusion.spec.ts` |

## Honest Coverage Assessment

**What this plan delivers:** Admin-panel CRUD, role gating, and Mode C system enforcement. These prove the fixture pattern, QA-006 compliance mechanics, and auth mode selection — the exemplar goal.

**What remains open:** The pit-path enforcement test (new-slip-modal hard_block rejection) is the most operationally important E2E surface — it's where a real pit boss would encounter the block. It's scaffolded but skipped because it depends on the full pit dashboard fixture (floor layout, table sessions, seat selection). The gap is not dead until this is implemented or explicitly de-scoped.

## QA-006 Compliance Checklist

- [x] Auth mode selected per §1 decision matrix (Mode B for browser, Mode C for RPC)
- [x] Verification class declared in describe blocks
- [x] Fixture factories use collision-resistant identifiers (randomUUID)
- [x] Fixture factories return cleanup functions
- [x] Cleanup scoped to created IDs (casino_id from per-test casino)
- [x] Serial mode for stateful CRUD lifecycle
- [x] Parallel mode for independent role gating tests
- [x] Browser login pattern (Mode B) follows admin-helpers.ts
- [x] SECURITY DEFINER RPCs tested via Mode C (§5)
- [x] No hard waits — uses Playwright auto-waiting
- [x] Schema columns reconciled against `types/database.types.ts` (average_bet, computed_theo_cents, seat_number as string, audit_log columns)
- [ ] Pit-path enforcement test (new-slip-modal) — scaffolded, not implemented
- [ ] Shared auth helper extraction (P1 backlog — not in scope, uses inline helper)
- [ ] CI promotion path (advisory tier — Playwright not yet wired to CI)
