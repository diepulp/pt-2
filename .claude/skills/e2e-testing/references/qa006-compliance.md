# QA-006 Compliance Reference

Deep-dive reference for QA-006 E2E Testing Standard compliance.
Load this file when you need the full RPC→Mode table, CI promotion details, shared auth extraction plan, or infrastructure gap status.

**Governing document:** `docs/40-quality/QA-006-e2e-testing-standard.md`

---

## Table of Contents

1. [Full RPC → Minimum Auth Mode Table](#full-rpc--minimum-auth-mode-table)
2. [Shared Auth Helper Extraction Plan](#shared-auth-helper-extraction-plan)
3. [CI Promotion Path](#ci-promotion-path)
4. [Environment Configuration](#environment-configuration)
5. [Seed Data Constants](#seed-data-constants)
6. [Known RPC Bugs](#known-rpc-bugs)
7. [Infrastructure Gap Tracker](#infrastructure-gap-tracker)

---

## Full RPC → Minimum Auth Mode Table

All SECURITY DEFINER RPCs calling `set_rls_context_from_staff()` require minimum Mode C for **direct** verification. When the same RPC is reached through a browser workflow, the test is Mode B (canonical E2E) — the RPC still executes correctly because the browser session carries a real JWT.

> **Staleness warning:** This table is a curated subset (~40+ RPCs in the migration corpus). When adding E2E coverage for an RPC not listed here, check the migration source to confirm whether it is SECURITY DEFINER. This table must be reviewed whenever a new SECURITY DEFINER RPC is added (QA-006 §12).

### Floor Layout & Table Context

| RPC | Route | Min Mode (Direct) |
|---|---|---|
| `rpc_activate_floor_layout` | `POST /api/v1/floor-layout-activations` | C |
| `rpc_create_floor_layout` | `POST /api/v1/floor-layouts` | C |
| `rpc_log_table_drop` | `POST /api/v1/table-context/drop-events` | C |
| `rpc_request_table_fill` | `POST /api/v1/table-context/fills` | C |
| `rpc_request_table_credit` | `POST /api/v1/table-context/credits` | C |
| `rpc_confirm_table_fill` | `POST /api/v1/table-context/fills/[id]/confirm` | C |
| `rpc_confirm_table_credit` | `POST /api/v1/table-context/credits/[id]/confirm` | C |
| `rpc_acknowledge_drop_received` | `POST /api/v1/table-context/drop-events/[id]/acknowledge` | C |
| `rpc_log_table_inventory_snapshot` | `POST /api/v1/table-context/inventory-snapshots` | C |
| `rpc_update_table_status` | Service layer | C |

### Table Session Lifecycle

| RPC | Route | Min Mode (Direct) |
|---|---|---|
| `rpc_open_table_session` | Service layer | C |
| `rpc_close_table_session` | Service layer | C |
| `rpc_force_close_table_session` | Service layer | C |

### Shift & Rundown

| RPC | Route | Min Mode (Direct) |
|---|---|---|
| `rpc_create_shift_checkpoint` | Service layer | C |
| `rpc_start_table_rundown` | Service layer | C |
| `rpc_persist_table_rundown` | Service layer | C |
| `rpc_finalize_rundown` | Service layer | C |

### Rating Slip

| RPC | Route | Min Mode (Direct) |
|---|---|---|
| `rpc_start_rating_slip` | Service layer | C |
| `rpc_close_rating_slip` | Service layer | C |
| `rpc_pause_rating_slip` | Service layer | C |
| `rpc_resume_rating_slip` | Service layer | C |
| `rpc_move_player` | `POST /api/v1/rating-slips/[id]/move` | C |

### Player & Visit

| RPC | Route | Min Mode (Direct) |
|---|---|---|
| `rpc_create_player` | Service layer | C |
| `rpc_get_player_exclusion_status` | Service layer | C |
| `rpc_start_or_resume_visit` | Service layer | C |

### Loyalty & Promo

| RPC | Route | Min Mode (Direct) |
|---|---|---|
| `rpc_issue_mid_session_reward` | Service layer | C |
| `rpc_accrue_on_close` | Service layer | C |
| `rpc_redeem` | Service layer | C |
| `rpc_manual_credit` | Service layer | C |
| `rpc_snapshot_loyalty_liability` | Service layer | C |
| `rpc_issue_promo_coupon` | Service layer | C |
| `rpc_void_promo_coupon` | Service layer | C |
| `rpc_replace_promo_coupon` | Service layer | C |

### Player Import

| RPC | Route | Min Mode (Direct) |
|---|---|---|
| `rpc_import_create_batch` | Service layer | C |
| `rpc_import_stage_rows` | Service layer | C |
| `rpc_import_execute` | Service layer | C |

### Casino Onboarding

| RPC | Route | Min Mode (Direct) |
|---|---|---|
| `rpc_bootstrap_casino` | Service layer | C |
| `rpc_complete_casino_setup` | Service layer | C |
| `rpc_create_staff` | Service layer | C |
| `rpc_create_staff_invite` | Service layer | C |
| `rpc_accept_staff_invite` | Service layer | C |

### Finance

| RPC | Route | Min Mode (Direct) |
|---|---|---|
| `rpc_create_financial_txn` | Service layer | C |

**GET routes** reading tables directly (floor layouts list, drop events list, fills list) can use Mode A.

---

## Shared Auth Helper Extraction Plan

### Current Duplication

These auth patterns are duplicated across fixtures:

- `authenticateAndNavigate()` in `setup-wizard-fixtures.ts` and `import-test-data.ts`
- `authenticateViaLogin()` in `shift-dashboard-helpers.ts`
- `authenticateAdmin()` in `admin-helpers.ts`
- `authenticateUser()` used in multiple spec files
- `getDevAuthToken()` in `loyalty-accrual.spec.ts`
- `createServiceClient()` independently defined in 8+ fixture and spec files

### Target Architecture

Single shared module at `e2e/fixtures/auth.ts`:

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { Page } from '@playwright/test';

// Service-role client for setup/teardown (bypasses RLS)
export function createServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Browser-based auth (Mode B — canonical E2E)
export async function authenticateViaLogin(
  page: Page,
  email: string,
  password: string,
  targetUrl?: string,
): Promise<void> {
  await page.goto(targetUrl ?? '/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(url => !url.pathname.includes('/auth/'));
}

// JWT-based auth (Mode C — system/API verification)
export async function getAuthenticatedClient(
  email: string,
  password: string,
): Promise<{ client: SupabaseClient<Database>; token: string }> {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(`Auth failed: ${error?.message}`);
  }
  return { client, token: data.session.access_token };
}
```

**Extraction status:** P1 remediation — not yet extracted.

---

## CI Promotion Path

### Current State (2026-03-29)

**Tier 1 — Trusted Local Verification:**
- Runs in correct environment (real browser + real app + real Supabase)
- Produces behaviorally meaningful assertions (~134 tests)
- Does **not** run in CI, does **not** block merge

### Promotion to CI Advisory

Prerequisites:
1. [ ] `.env.local` override applied in `playwright.config.ts` (§2)
2. [ ] Shared auth helper extracted to `e2e/fixtures/auth.ts` (§3)
3. [ ] `.env.local.example` created (§2)
4. [ ] Critical-path smoke subset identified (5–10 tests, < 3 min)
5. [ ] GitHub Actions workflow created

CI workflow template:

```yaml
  e2e-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    continue-on-error: true  # Advisory phase
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - uses: supabase/setup-cli@v1
      - name: Start Supabase and capture env
        id: supabase
        run: |
          npx supabase start
          echo "ANON_KEY=$(npx supabase status -o env | grep ANON_KEY | cut -d= -f2)" >> "$GITHUB_OUTPUT"
          echo "SERVICE_ROLE_KEY=$(npx supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2)" >> "$GITHUB_OUTPUT"
      - run: npx playwright install chromium --with-deps
      - run: npx playwright test --project=smoke
        env:
          BASE_URL: http://localhost:3000
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ steps.supabase.outputs.ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ steps.supabase.outputs.SERVICE_ROLE_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

### Promotion to CI Required

Prerequisites (per TESTING_GOVERNANCE_STANDARD.md §7):
1. [ ] Smoke suite demonstrates stability: 20 consecutive advisory runs with zero test-attributed flakes, or 14 consecutive calendar days clean
2. [ ] No flaky failures that would block legitimate merges
3. [ ] Branch protection enabled on `main`
4. [ ] `continue-on-error` removed from e2e-smoke job
5. [ ] E2E job added to required status checks

The threshold must be explicit, measurable, and recorded.

---

## Environment Configuration

### Playwright Config — Env File Loading

Playwright must load env files matching Next.js precedence:

```typescript
import dotenv from 'dotenv';
import path from 'path';

// Match Next.js env precedence: .env.local overrides .env
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: true });
dotenv.config({ path: path.resolve(__dirname, '.env') });
```

**Status:** Not yet applied to `playwright.config.ts` (P1 remediation).

### Supabase Key Format

Supabase CLI v2.70+ issues new-style keys. Source of truth: `npx supabase status --output json`

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `npx supabase status` → URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PUBLISHABLE_KEY from status |
| `SUPABASE_SERVICE_ROLE_KEY` | SECRET_KEY from status |

### .env.local.example Template

```bash
# E2E Testing — Local Supabase
# Copy to .env.local and fill from: npx supabase status --output json
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase status: PUBLISHABLE_KEY or anon key>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status: SECRET_KEY or service_role key>

# Dev auth bypass (Mode A only — not needed for Mode B/C)
ENABLE_DEV_AUTH=true
```

**Status:** This file does not yet exist (P1 remediation).

### Deprecation: .env.test

The `e2e/README.md` and `.env.test.example` reference `.env.test`, but Playwright config does not load it. The canonical env file is `.env.local`.

Remediation:
1. Update `e2e/README.md` to reference `.env.local`
2. Remove or rename `.env.test.example` once `.env.local.example` is created
3. Add `.env.test` to `.gitignore` if not covered

---

## Seed Data Constants

Tests using dev seed data must reference constants, not magic strings:

```typescript
// e2e/fixtures/seed-constants.ts
export const SEED_CASINO_ID = 'ca000000-0000-0000-0000-000000000001';
export const SEED_STAFF_ID = '5a000000-0000-0000-0000-000000000001';
export const DEV_USER_EMAIL = 'pitboss@dev.local';
export const DEV_USER_PASSWORD = 'devpass123';
```

**Status:** P2 extraction — not yet created.

---

## Known RPC Bugs

Two migration bugs discovered during Wedge C E2E effort block the mutation test path:

1. **`rpc_compute_rolling_baseline`** — ambiguous `gaming_day` column reference (PG 42702)
   See: `docs/issues/ISSUE-RPC-COMPUTE-BASELINE-AMBIGUOUS-COLUMN.md`

2. **`rpc_persist_anomaly_alerts` → `rpc_get_anomaly_alerts`** — `column ts.table_id does not exist` (PG 42703)
   See: `docs/issues/ISSUE-RPC-PERSIST-ALERTS-MISSING-COLUMN.md`

---

## Infrastructure Gap Tracker

| Gap | Severity | Status |
|---|---|---|
| `.env.local` override in playwright.config.ts | P1 | Not applied |
| `.env.local.example` template | P1 | Not created |
| Shared auth helper extraction (`e2e/fixtures/auth.ts`) | P1 | Not extracted |
| `createServiceClient()` consolidation (8+ definitions) | P1 | Not consolidated |
| `.env.test` / `.env.test.example` deprecation | P1 | Not remediated |
| Verification taxonomy adoption in describe blocks | P1 | Zero of 17 specs compliant |
| Broad casino-level cleanup remediation (§4) | P1 | Not remediated |
| Orphan specs at `e2e/` root (2 files) | P2 | Not relocated |
| Seed constants file | P2 | Not extracted |
| E2E smoke suite in CI | P2 | Not wired |
| Branch protection on `main` | P2 | Not enabled |
| CICD-PIPELINE-SPEC.md update for E2E | P2 | Not updated |
| `e2e/README.md` stale file reference | P3 | Not fixed |

---

## Review Triggers (QA-006 §12)

A review of QA-006 (and this reference) is required when:

- New SECURITY DEFINER RPC added (update RPC table above)
- Auth middleware changes (publicPaths, withServerAction chain)
- Supabase CLI key format changes
- New Playwright project added
- E2E promoted from advisory to required in CI
- New bounded context ships without E2E coverage
