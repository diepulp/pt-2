/**
 * Controlled loyalty-instrument print — happy path (PRD-092 WS9)
 *
 * Verification class: E2E — Mode B (browser login)
 * ────────────────────────────────────────────────────────────────────────────
 * Proves the ONLY sanctioned physical-print write path end to end:
 *
 *   operator authenticates (real session cookies) → controlled Print action
 *   POST /api/v1/loyalty/printing → outcome resolves `submitted` →
 *   a `print_attempt` audit row is persisted with full correlation.
 *
 * Auth (QA-006 §1): Mode B. The controlled-print route's server client is
 * cookie-based (`@supabase/ssr`), so a Bearer-token request (Mode C) does NOT
 * authenticate it — only a real browser session does. We log in via the dev
 * password form at `/signin` (the magic-link `/auth/login` surface cannot
 * password-login), then drive the controlled-print POST through the
 * authenticated browser request context (`page.request`), which shares the
 * session cookie jar. This exercises the genuine chain — middleware auth +
 * RLS context derivation (ADR-024) → orchestrator → WS2 RPCs → WS5 cups adapter
 * → loopback agent → DB — without depending on the heavier issuance UI to mint a
 * coupon. The seed operator is `admin` on the seed casino, satisfying both the
 * route role gate (pit_boss|admin) and same-casino instrument resolution (P0003).
 *
 * DEC-004 (manual-first): nothing prints without an explicit operator action;
 * here the POST IS that explicit action (no auto-print).
 *
 * Correlation asserted on the persisted row: casino_id (context-derived, =seed
 * casino), instrument_kind=`promo_coupon`, instrument_ref=coupon id,
 * result_status=`submitted`, failure_domain NULL (§7a — never `device`),
 * idempotency_key + receipt_document_hash present.
 *
 * ── RUNTIME PREREQUISITES (see e2e/loyalty-printing/README.md) ──────────────
 * This is a WRITE-PATH test against the LOCAL stack — it CANNOT run against the
 * default playwright.config.ts (which force-loads the REMOTE .env.local, where
 * the print_attempt migration is absent → PGRST202). Run it with:
 *   1. local Supabase up + print_attempt migrations applied,
 *   2. the loopback print-agent server running (support/loopback-print-agent-server.ts),
 *   3. a dev server started with LOCAL Supabase env + LOYALTY_PRINT_AGENT_URL set,
 *   4. the local-pointed config from the README.
 * Without the agent URL the route fails closed (503) by design — the test then
 * fails loudly rather than skipping (no coverage theatre).
 *
 * @see PRD-092 / EXEC-092 WS9 · DEC-002/003/004/005/006/007 · ADR-024
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Seed operator (admin ∈ {pit_boss, admin}) + casino — supabase/seed.sql.
const DEV_USER_EMAIL = 'pitboss@dev.local';
const DEV_USER_PASSWORD = 'devpass123';
const SEED_CASINO_ID = 'ca000000-0000-0000-0000-000000000001';
const SEED_STAFF_ID = '5a000000-0000-0000-0000-000000000001';

type PrintAttemptRow = Database['public']['Tables']['print_attempt']['Row'];

function createServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Mode B dev password login (`/signin` → `DevLoginForm`, dev-only). Signs in via
 * `signInWithPassword` in the browser, which persists the session to cookies that
 * the controlled-print route's `@supabase/ssr` server client reads. The stale
 * shared `authenticateAndNavigate` helper targets the magic-link `/auth/login`
 * surface and cannot password-login — hence this inline helper.
 */
async function signInDev(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // `/signin` hosts three forms (request-access, magic-link, dev). Scope to the
  // dev form: its email input is uniquely identified by placeholder, and only it
  // has a password field + "Sign in (dev)" submit.
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  const devEmail = page.locator(
    'input[name="email"][placeholder="pitboss@dev.local"]',
  );
  const devPassword = page.locator('input[name="password"]');
  await devPassword.waitFor({ state: 'visible', timeout: 30_000 });
  // Wait for Next client hydration before clicking — otherwise the submit beats
  // React and the browser does a native GET (leaking creds to the URL, no login).
  await page.waitForFunction(
    () => Boolean((window as unknown as { next?: unknown }).next),
    undefined,
    { timeout: 30_000 },
  );
  await devEmail.fill(email);
  await devPassword.fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/signin'), {
      timeout: 30_000,
    }),
    page.locator('button[type="submit"]:has-text("Sign in (dev)")').click(),
  ]);
  await page.waitForLoadState('domcontentloaded');
}

test.describe('Controlled loyalty print — E2E — Mode B (browser login)', () => {
  const service = createServiceClient();

  // Created in setup, torn down in finally — scoped to created IDs only (QA-006 §4).
  let programId: string | null = null;
  let couponId: string | null = null;

  test.afterEach(async () => {
    if (couponId) {
      await service
        .from('print_attempt')
        .delete()
        .eq('instrument_ref', couponId);
      await service.from('promo_coupon').delete().eq('id', couponId);
    }
    if (programId) {
      await service.from('promo_program').delete().eq('id', programId);
    }
    couponId = null;
    programId = null;
  });

  test('issues an entitlement, prints via the controlled action, and persists a submitted print_attempt', async ({
    page,
  }) => {
    // ── Fixture: a real same-casino entitlement instrument (resolves P0003) ──
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const { data: program, error: programErr } = await service
      .from('promo_program')
      .insert({
        casino_id: SEED_CASINO_ID,
        name: `WS9 Match Play ${stamp}`,
        promo_type: 'match_play',
        face_value_amount: 25,
        required_match_wager_amount: 25,
      })
      .select('id')
      .single();
    expect(programErr, programErr?.message).toBeNull();
    programId = program!.id;

    const validationNumber = `WS9-${stamp}`;
    const { data: coupon, error: couponErr } = await service
      .from('promo_coupon')
      .insert({
        casino_id: SEED_CASINO_ID,
        promo_program_id: programId,
        validation_number: validationNumber,
        face_value_amount: 25,
        required_match_wager_amount: 25,
        issued_by_staff_id: SEED_STAFF_ID,
      })
      .select('id')
      .single();
    expect(couponErr, couponErr?.message).toBeNull();
    couponId = coupon!.id;

    // ── Mode B: real operator session (cookies) ─────────────────────────────
    await signInDev(page, DEV_USER_EMAIL, DEV_USER_PASSWORD);

    // ── Controlled Print action (the explicit operator action, DEC-004) ─────
    // Driven through the authenticated browser request context so the route's
    // cookie-based server client authenticates the real session.
    const entitlementPayload = {
      family: 'entitlement' as const,
      coupon_id: couponId,
      validation_number: validationNumber,
      reward_id: programId,
      reward_code: 'MATCH_PLAY_25',
      reward_name: 'Match Play $25',
      face_value_cents: 2500,
      required_match_wager_cents: 2500,
      expires_at: null,
      player_name: 'WS9 Player',
      player_id: SEED_STAFF_ID, // opaque context string on the receipt
      player_tier: 'gold',
      casino_name: 'Seed Casino',
      staff_name: 'Seed Operator',
      issued_at: new Date().toISOString(),
    };

    const response = await page.request.post('/api/v1/loyalty/printing', {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `e2e-ws9-${stamp}`,
      },
      data: { payload: entitlementPayload },
    });

    expect(
      response.status(),
      `controlled print HTTP status (body: ${await response.text()})`,
    ).toBe(200);

    const body = (await response.json()) as {
      ok: boolean;
      data: {
        attempt: { printAttemptId: string; idempotencyKey: string };
        outcome: { status: string; failure: unknown };
        replayed: boolean;
      };
    };

    // ── Outcome: submitted (≠ printed), first print (not a replay) ──────────
    expect(body.ok).toBe(true);
    expect(body.data.outcome.status).toBe('submitted');
    expect(body.data.outcome.failure).toBeNull();
    expect(body.data.replayed).toBe(false);

    const printAttemptId = body.data.attempt.printAttemptId;
    expect(printAttemptId).toBeTruthy();

    // ── Persisted audit row with full correlation (service-role read) ───────
    const { data: row, error: readErr } = await service
      .from('print_attempt')
      .select('*')
      .eq('print_attempt_id', printAttemptId)
      .single();
    expect(readErr, readErr?.message).toBeNull();

    const persisted = row as PrintAttemptRow;
    expect(persisted.casino_id).toBe(SEED_CASINO_ID); // context-derived (ADR-024)
    expect(persisted.operator_id).toBe(SEED_STAFF_ID); // context-derived, not spoofed
    expect(persisted.instrument_kind).toBe('promo_coupon');
    expect(persisted.instrument_ref).toBe(couponId);
    expect(persisted.result_status).toBe('submitted');
    expect(persisted.failure_domain).toBeNull(); // §7a — device never written
    expect(persisted.failure_code).toBeNull();
    expect(persisted.idempotency_key).toBeTruthy();
    expect(persisted.receipt_document_hash).toBeTruthy();
    expect(persisted.reprint_of).toBeNull(); // first print, not a reprint
  });
});
