/**
 * EXEC-084 WS_E2E — Demo Staff Auto-Binding — E2E Write-Path Tests
 *
 * Coverage: /start gateway auto-binding write path (E2E mandate — staff INSERT detected).
 * Verification class: E2E — Mode B (browser login via /auth/login password form).
 *
 * Note on auth mode: production flow uses magic-link OTP; these tests use
 * password auth because test users are created via admin.createUser with a
 * password. The session established via /auth/login is cookie-equivalent to
 * an OTP session — /start's server component sees the same getUser() result.
 *
 * RLS note: /start does NOT call set_rls_context_from_staff, so app.casino_id
 * is unset when the user-auth-client staff query runs. staff_read policy
 * requires casino_id = current_setting('app.casino_id'), so that query always
 * returns null. The critical paths (idempotency check + INSERT) use the
 * service-role client and are not affected by RLS.
 *
 * Three scenarios:
 *   S1 — Happy path: approved evaluator with no prior staff binding
 *          → DEMO- INSERT → /pit (DB-verified)
 *   S2 — Idempotency: approved evaluator with existing DEMO- binding
 *          → serviceClient idempotency check → /pit, no duplicate INSERT
 *   S3 — Regression: approved evaluator with existing non-DEMO staff binding
 *          at DEMO_CASINO_ID → idempotency check prevents new DEMO- INSERT
 *
 * @see EXEC-084 WS_E2E
 * @see app/(public)/start/page.tsx — auto-binding implementation
 * @see QA-006 §1 — E2E verification taxonomy
 */

import { randomUUID } from 'crypto';

import { expect, test } from '@playwright/test';

import { authenticateAndNavigate, createServiceClient } from '../fixtures/auth';

const DEMO_CASINO_ID = 'ca000000-0000-0000-0000-000000000001';

// ─────────────────────────────────────────────────────────────────────────────
// Inline fixture factory
// ─────────────────────────────────────────────────────────────────────────────

interface PilotScenario {
  userId: string;
  email: string;
  password: string;
  cleanup: () => Promise<void>;
}

async function createApprovedEvaluatorScenario(): Promise<PilotScenario> {
  const svc = createServiceClient();
  const uniqueId = randomUUID().slice(0, 8);
  const email = `e2e-pilot-${uniqueId}@example.com`;
  const password = 'test-password-123!';

  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }

  const userId = data.user.id;

  const { error: allowlistError } = await svc
    .from('approved_email_allowlist')
    .insert({ email, status: 'approved' });

  if (allowlistError) {
    await svc.auth.admin.deleteUser(userId);
    throw new Error(
      `Failed to add to approved_email_allowlist: ${allowlistError.message}`,
    );
  }

  return {
    userId,
    email,
    password,
    cleanup: async () => {
      const s = createServiceClient();
      // Scoped deletes — user_id ties all rows to this test (QA-006 §4)
      await s.from('staff').delete().eq('user_id', userId);
      await s.from('approved_email_allowlist').delete().eq('email', email);
      await s.auth.admin.deleteUser(userId);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// S1: Happy path — fresh approved evaluator auto-binds to Casino 1
// ─────────────────────────────────────────────────────────────────────────────

test.describe('S1: Demo Staff Auto-Binding Happy Path — E2E — Mode B (browser login)', () => {
  let scenario: PilotScenario;

  test.beforeAll(async () => {
    scenario = await createApprovedEvaluatorScenario();
  });

  test.afterAll(async () => {
    await scenario.cleanup();
  });

  test('should create DEMO- staff binding and redirect to /pit', async ({
    page,
  }) => {
    await authenticateAndNavigate(
      page,
      scenario.email,
      scenario.password,
      '/start',
    );

    await page.waitForURL(/\/pit/, { timeout: 15_000 });
    expect(page.url()).toContain('/pit');

    // Verify DEMO- row in DB (service-role client bypasses RLS)
    const svc = createServiceClient();
    const { data: rows } = await svc
      .from('staff')
      .select('id, employee_id, role, first_name, last_name')
      .eq('user_id', scenario.userId)
      .eq('casino_id', DEMO_CASINO_ID);

    expect(rows).toHaveLength(1);
    expect(rows![0].employee_id).toMatch(/^DEMO-[A-Z0-9]{6}$/);
    expect(rows![0].role).toBe('pit_boss');
    expect(rows![0].last_name).toBe('Demo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S2: Idempotency — pre-existing DEMO- binding prevents duplicate INSERT
// ─────────────────────────────────────────────────────────────────────────────

test.describe('S2: Idempotency — No Duplicate DEMO- INSERT — E2E — Mode B (browser login)', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: PilotScenario;
  let preInsertedStaffId: string;

  test.beforeAll(async () => {
    scenario = await createApprovedEvaluatorScenario();

    // Pre-insert a DEMO- staff binding (simulates a returning evaluator)
    const svc = createServiceClient();
    const emailUsername = scenario.email.split('@')[0] ?? 'demo';
    const { data: row, error } = await svc
      .from('staff')
      .insert({
        casino_id: DEMO_CASINO_ID,
        role: 'pit_boss',
        employee_id: `DEMO-${randomUUID().substring(0, 6).toUpperCase()}`,
        user_id: scenario.userId,
        email: scenario.email,
        first_name: emailUsername,
        last_name: 'Demo',
      })
      .select('id')
      .single();

    if (error || !row) {
      throw new Error(
        `Failed to pre-insert DEMO- staff binding: ${error?.message}`,
      );
    }

    preInsertedStaffId = row.id;
  });

  test.afterAll(async () => {
    await scenario.cleanup();
  });

  test('should land on /pit without creating a new staff binding', async ({
    page,
  }) => {
    await authenticateAndNavigate(
      page,
      scenario.email,
      scenario.password,
      '/start',
    );

    await page.waitForURL(/\/pit/, { timeout: 15_000 });
    expect(page.url()).toContain('/pit');

    // Exactly 1 DEMO- row — idempotency check prevented a second INSERT
    const svc = createServiceClient();
    const { data: rows } = await svc
      .from('staff')
      .select('id, employee_id')
      .eq('user_id', scenario.userId)
      .eq('casino_id', DEMO_CASINO_ID);

    expect(rows).toHaveLength(1);
    expect(rows![0].id).toBe(preInsertedStaffId);
  });

  test('should still land on /pit on a third visit (idempotency is stable)', async ({
    page,
  }) => {
    await authenticateAndNavigate(
      page,
      scenario.email,
      scenario.password,
      '/start',
    );

    await page.waitForURL(/\/pit/, { timeout: 15_000 });
    expect(page.url()).toContain('/pit');

    // Row count must not grow on repeated visits
    const svc = createServiceClient();
    const { data: rows } = await svc
      .from('staff')
      .select('id')
      .eq('user_id', scenario.userId)
      .eq('casino_id', DEMO_CASINO_ID);

    expect(rows).toHaveLength(1);
    expect(rows![0].id).toBe(preInsertedStaffId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S3: Regression — existing non-DEMO staff binding at DEMO_CASINO_ID
//     The idempotency check (serviceClient) catches any existing row at
//     DEMO_CASINO_ID, regardless of employee_id prefix. No DEMO- INSERT.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('S3: Regression — Existing Active Staff Binding — E2E — Mode B (browser login)', () => {
  let scenario: PilotScenario;
  let preInsertedEmployeeId: string;

  test.beforeAll(async () => {
    scenario = await createApprovedEvaluatorScenario();

    // Pre-insert a non-DEMO staff binding (simulates manual provisioning)
    const svc = createServiceClient();
    const uniqueId = randomUUID().slice(0, 6).toUpperCase();
    preInsertedEmployeeId = `REG-${uniqueId}`;

    const { error } = await svc.from('staff').insert({
      casino_id: DEMO_CASINO_ID,
      role: 'pit_boss',
      employee_id: preInsertedEmployeeId,
      user_id: scenario.userId,
      email: scenario.email,
      first_name: 'RegPilot',
      last_name: 'User',
    });

    if (error) {
      throw new Error(
        `Failed to pre-insert non-DEMO staff binding: ${error.message}`,
      );
    }
  });

  test.afterAll(async () => {
    await scenario.cleanup();
  });

  test('should redirect to /pit without creating a DEMO- staff binding', async ({
    page,
  }) => {
    await authenticateAndNavigate(
      page,
      scenario.email,
      scenario.password,
      '/start',
    );

    await page.waitForURL(/\/pit/, { timeout: 15_000 });
    expect(page.url()).toContain('/pit');

    // Exactly 1 staff row at DEMO_CASINO_ID — no DEMO- INSERT triggered
    const svc = createServiceClient();
    const { data: rows } = await svc
      .from('staff')
      .select('id, employee_id')
      .eq('user_id', scenario.userId)
      .eq('casino_id', DEMO_CASINO_ID);

    expect(rows).toHaveLength(1);
    expect(rows![0].employee_id).toBe(preInsertedEmployeeId);
    expect(rows![0].employee_id).not.toMatch(/^DEMO-/);
  });
});
