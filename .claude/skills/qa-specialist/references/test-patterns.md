# PT-2 Testing Patterns

Testing patterns and anti-patterns specific to the PT-2 casino pit management system. All patterns conform to **ADR-044 Testing Governance Posture**, the **Testing Governance Standard** (`docs/70-governance/TESTING_GOVERNANCE_STANDARD.md`), and **QA-006 E2E Testing Standard** (`docs/40-quality/QA-006-e2e-testing-standard.md`).

## ADR-044 Environment Contract Quick Reference

Per ADR-044 §4, each test layer must run in the environment appropriate to what it is proving:

| Layer | Required Environment | Jest Directive |
|-------|---------------------|----------------|
| Unit (browser) | `jsdom` | `/** @jest-environment jsdom */` |
| Server-unit | `node` | `/** @jest-environment node */` |
| Route-handler | `node` | `/** @jest-environment node */` |
| Integration | `node` + Supabase | `/** @jest-environment node */` |
| E2E | Browser + app + Supabase | Playwright (not Jest) |
| Smoke | `node` | `/** @jest-environment node */` |

A single global `testEnvironment` applying to all test files is prohibited (ADR-044 §4). Misclassification of environment is a governance defect.

## Test Structure Patterns

### Pattern 1: Workflow Isolation with Verification Taxonomy (QA-006)

Each test should create its own complete test scenario. The top-level describe block must declare both the **verification class** and **auth mode** per QA-006 §1:

```typescript
import { test, expect } from '@playwright/test';
import { createTestScenario, TestScenario } from '../fixtures/test-data';

// QA-006 §1: Describe block labeling — 'Feature — Class — Mode X (description)'
test.describe('Rating Slip — E2E — Mode B (browser login)', () => {
  let scenario: TestScenario;

  test.beforeEach(async () => {
    scenario = await createTestScenario();
  });

  test.afterEach(async () => {
    await scenario.cleanup();
  });

  test('should start and close rating slip', async ({ page }) => {
    // Mode B: real browser/app surface under test
    // Test uses scenario.casinoId, scenario.playerId, etc.
  });
});
```

**Verification class reference:**
| Class | Auth Mode | Use When |
|-------|-----------|----------|
| `E2E` | Mode B (browser login) | Testing full browser/app surface |
| `System Verification` | Mode C (authenticated client) | Testing API/RPC with real JWT, bypassing browser |
| `Local Verification` | Mode A (dev bypass) | Read-only regression, auth fidelity not under test |

### Pattern 2: API-First Testing

Test API endpoints before UI components:

```typescript
test('POST /api/v1/rating-slips creates new slip', async ({ request }) => {
  const response = await request.post('/api/v1/rating-slips', {
    data: {
      visit_id: scenario.visitId,
      table_id: scenario.tableId,
      seat_number: 1,
      average_bet: 25,
    },
    headers: { Authorization: `Bearer ${scenario.authToken}` },
  });

  expect(response.ok()).toBeTruthy();
  expect(response.status()).toBe(201);

  const body = await response.json();
  expect(body.data.id).toBeDefined();
  expect(body.data.status).toBe('open');
});
```

### Pattern 3: State Transition Testing

Test all valid state transitions:

```typescript
test.describe('Rating Slip State Machine', () => {
  test('open -> paused -> open -> closed', async ({ request }) => {
    // Create slip (open)
    const slip = await createRatingSlip(request, scenario);
    expect(slip.status).toBe('open');

    // Pause
    const paused = await pauseRatingSlip(request, slip.id, scenario);
    expect(paused.status).toBe('paused');

    // Resume
    const resumed = await resumeRatingSlip(request, slip.id, scenario);
    expect(resumed.status).toBe('open');

    // Close
    const closed = await closeRatingSlip(request, slip.id, scenario);
    expect(closed.status).toBe('closed');
  });

  test('paused slip cannot be paused again', async ({ request }) => {
    const slip = await createRatingSlip(request, scenario);
    await pauseRatingSlip(request, slip.id, scenario);

    const response = await request.post(`/api/v1/rating-slips/${slip.id}/pause`, {
      headers: { Authorization: `Bearer ${scenario.authToken}` },
    });

    expect(response.status()).toBe(422); // Invalid state transition
  });
});
```

### Pattern 4: Idempotency Testing

Verify operations can be safely retried:

```typescript
test('visit check-in is idempotent', async ({ request }) => {
  const firstResponse = await request.post('/api/v1/visits', {
    data: {
      player_id: scenario.playerId,
      casino_id: scenario.casinoId,
    },
    headers: { Authorization: `Bearer ${scenario.authToken}` },
  });

  expect(firstResponse.status()).toBe(201);
  const firstVisit = await firstResponse.json();

  // Retry same operation
  const secondResponse = await request.post('/api/v1/visits', {
    data: {
      player_id: scenario.playerId,
      casino_id: scenario.casinoId,
    },
    headers: { Authorization: `Bearer ${scenario.authToken}` },
  });

  expect(secondResponse.status()).toBe(200); // 200, not 201
  const secondVisit = await secondResponse.json();
  expect(secondVisit.data.id).toBe(firstVisit.data.id);
});
```

### Pattern 5: RLS Enforcement Testing

Verify casino scoping is enforced:

```typescript
test('cannot access other casino data', async ({ request }) => {
  // Create data in casino A
  const casinoA = await createTestScenario();
  const slipInA = await createRatingSlip(request, casinoA);

  // Try to access from casino B
  const casinoB = await createTestScenario();

  const response = await request.get(`/api/v1/rating-slips/${slipInA.id}`, {
    headers: { Authorization: `Bearer ${casinoB.authToken}` },
  });

  expect(response.status()).toBe(404); // Not 403, for security

  await casinoA.cleanup();
  await casinoB.cleanup();
});
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shared State Between Tests

```typescript
// BAD: Tests depend on each other
let sharedVisitId: string;

test('create visit', async ({ request }) => {
  const response = await request.post('/api/v1/visits', {...});
  sharedVisitId = (await response.json()).data.id;
});

test('create slip for visit', async ({ request }) => {
  // This fails if previous test fails
  await request.post('/api/v1/rating-slips', {
    data: { visit_id: sharedVisitId, ... }
  });
});
```

```typescript
// GOOD: Each test creates its own data
test('create slip for visit', async ({ request }) => {
  const scenario = await createTestScenario();
  const visit = await createVisit(request, scenario);
  const slip = await createRatingSlip(request, { ...scenario, visitId: visit.id });
  await scenario.cleanup();
});
```

### Anti-Pattern 2: Fixed Timeouts

```typescript
// BAD: Arbitrary wait
await page.waitForTimeout(2000);
await expect(page.getByText('Success')).toBeVisible();
```

```typescript
// GOOD: Wait for specific condition
await expect(page.getByText('Success')).toBeVisible({ timeout: 5000 });
```

### Anti-Pattern 3: Brittle Selectors

```typescript
// BAD: Implementation-dependent selectors
await page.click('.btn-primary.submit-form');
await page.locator('div > form > button:nth-child(3)').click();
```

```typescript
// GOOD: Semantic or data-testid selectors
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByTestId('submit-rating-slip').click();
```

### Anti-Pattern 4: Service Role in Assertions

```typescript
// BAD: Service role bypasses RLS
const supabase = createServiceClient(); // Service role
const { data } = await supabase.from('rating_slip').select('*');
expect(data).toHaveLength(1); // Always passes, ignores RLS
```

```typescript
// GOOD: Authenticated client respects RLS
const supabase = createAuthenticatedClient(scenario.authToken);
const { data } = await supabase.from('rating_slip').select('*');
expect(data).toHaveLength(1); // Only sees casino-scoped data
```

### Anti-Pattern 5: Shallow Mock-Everything Tests (ADR-044 §9 Prohibited)

```typescript
// BAD: Only proves handler exists — no behavioral assertion
jest.mock('@/services/player/crud', () => ({
  getPlayer: jest.fn().mockResolvedValue({ ok: true, data: {} }),
}));

test('GET handler is defined', async () => {
  const { GET } = await import('./route');
  expect(GET).toBeDefined(); // Theatre — proves nothing about HTTP behavior
});
```

```typescript
// GOOD: Asserts on observable HTTP behavior with minimal mocking
test('GET returns 400 for invalid UUID', async () => {
  const request = createMockRequest('GET', '/api/v1/players/not-a-uuid');
  const params = createMockRouteParams({ id: 'not-a-uuid' });
  const response = await GET(request, { params });

  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.code).toBe('VALIDATION_ERROR');
});
```

Net-new shallow tests are prohibited. Existing shallow tests are reclassified as smoke coverage and replaced incrementally as routes are touched.

### Anti-Pattern 6: Incomplete Cleanup

```typescript
// BAD: Missing cleanup on failure
test('create player', async () => {
  const player = await createPlayer();
  // If this assertion fails, player is never cleaned up
  expect(player.name).toBe('John');
});
```

```typescript
// GOOD: Cleanup in afterEach
let player: Player;

test.afterEach(async () => {
  if (player) await deletePlayer(player.id);
});

test('create player', async () => {
  player = await createPlayer();
  expect(player.name).toBe('John');
});
```

---

## Test Data Factories

> **QA-006 §3/§4 compliance:** Factories use `randomUUID()` for collision-resistant isolation
> (not timestamp-only), create company for dual-boundary tenancy (ADR-043), and stamp
> `app_metadata` for RLS context derivation (ADR-024).

### Company + Casino Factory

```typescript
import { randomUUID } from 'crypto';

export async function createTestCasino(
  supabase: SupabaseClient,
): Promise<{ company: Company; casino: Casino }> {
  const uniqueId = randomUUID().slice(0, 8);

  // Company is required by ADR-043 dual-boundary tenancy
  const { data: company, error: companyError } = await supabase
    .from('company')
    .insert({ name: `e2e_${uniqueId}_company` })
    .select()
    .single();

  if (companyError) throw companyError;

  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({
      company_id: company.id,
      name: `e2e_${uniqueId}_casino`,
      timezone: 'America/Los_Angeles',
    })
    .select()
    .single();

  if (casinoError) throw casinoError;
  return { company, casino };
}
```

### Staff Factory

```typescript
export async function createTestStaff(
  supabase: SupabaseClient,
  casinoId: string,
): Promise<Staff & { email: string; password: string }> {
  const uniqueId = randomUUID().slice(0, 8);
  const email = `e2e_${uniqueId}_staff@test.example.com`;
  const password = 'TestPassword123!';

  // Create auth user with app_metadata for RLS context (ADR-024)
  const { data: authUser } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      casino_id: casinoId,
      staff_role: 'pit_boss',
    },
  });

  // Create staff record
  const { data, error } = await supabase
    .from('staff')
    .insert({
      user_id: authUser.user.id,
      casino_id: casinoId,
      email,
      first_name: 'Test',
      last_name: `Staff_${uniqueId}`,
      role: 'pit_boss',
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;

  // Update app_metadata with staff_id (needed by set_rls_context_from_staff)
  await supabase.auth.admin.updateUserById(authUser.user.id, {
    app_metadata: {
      casino_id: casinoId,
      staff_role: 'pit_boss',
      staff_id: data.id,
    },
  });

  return { ...data, email, password };
}
```

### Player Factory

```typescript
export async function createTestPlayer(
  supabase: SupabaseClient,
  casinoId: string,
): Promise<Player> {
  const uniqueId = randomUUID().slice(0, 8);

  const { data: player } = await supabase
    .from('player')
    .insert({
      casino_id: casinoId,
      first_name: 'Test',
      last_name: `Player_${uniqueId}`,
    })
    .select()
    .single();

  return player;
}
```

### Table Factory

```typescript
export async function createTestTable(
  supabase: SupabaseClient,
  casinoId: string,
): Promise<GamingTable> {
  const uniqueId = randomUUID().slice(0, 8);

  const { data, error } = await supabase
    .from('gaming_table')
    .insert({
      casino_id: casinoId,
      label: `e2e_${uniqueId}_table`,
      type: 'blackjack',
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

---

## Cleanup Order

Delete in reverse dependency order to avoid FK violations. **QA-006 §4: scope cleanup by specific IDs — broad casino-level sweeps are prohibited** because parallel workers sharing seed data will destroy each other's test records.

```typescript
/**
 * Cleanup scoped by specific entity IDs created during the test.
 * Do NOT use broad `.eq('casino_id', casinoId)` sweeps.
 */
export async function deleteTestData(
  supabase: SupabaseClient,
  ids: {
    ratingSlipIds?: string[];
    visitIds?: string[];
    playerIds?: string[];
    tableIds?: string[];
    staffId?: string;
    staffUserId?: string;
    casinoId: string;
    companyId: string;
  }
): Promise<void> {
  // 1. Rating slip pauses (depends on rating_slip)
  if (ids.ratingSlipIds?.length) {
    await supabase
      .from('rating_slip_pause')
      .delete()
      .in('rating_slip_id', ids.ratingSlipIds);

    // 2. Rating slips
    await supabase.from('rating_slip').delete().in('id', ids.ratingSlipIds);
  }

  // 3. Visits (depends on player, casino)
  if (ids.visitIds?.length) {
    // Loyalty ledger entries linked to visits
    await supabase.from('loyalty_ledger').delete().in('visit_id', ids.visitIds);
    // Financial transactions linked to visits
    await supabase.from('player_financial_transaction').delete().in('visit_id', ids.visitIds);
    await supabase.from('visit').delete().in('id', ids.visitIds);
  }

  // 4. Players (depends on casino)
  if (ids.playerIds?.length) {
    await supabase.from('player_loyalty').delete().in('player_id', ids.playerIds);
    await supabase.from('player_enrollment').delete().in('player_id', ids.playerIds);
    await supabase.from('player').delete().in('id', ids.playerIds);
  }

  // 5. Gaming tables
  if (ids.tableIds?.length) {
    await supabase.from('gaming_table').delete().in('id', ids.tableIds);
  }

  // 6. Staff + auth user
  if (ids.staffId) {
    await supabase.from('staff').delete().eq('id', ids.staffId);
  }
  if (ids.staffUserId) {
    await supabase.auth.admin.deleteUser(ids.staffUserId);
  }

  // 7. Casino + Company (root entities)
  await supabase.from('casino').delete().eq('id', ids.casinoId);
  await supabase.from('company').delete().eq('id', ids.companyId);
}
```

---

## Environment Configuration

### Playwright Config for PT-2

Per QA-006 §2, Playwright must load `.env.local` with override precedence matching Next.js. `.env.test` is deprecated.

```typescript
// playwright.config.ts
import path from 'path';
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// QA-006 §2: Match Next.js env precedence — .env.local overrides .env
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: true });
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'api',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

> **Note**: The actual config uses a single `api` project (not separate chromium/mobile) since E2E tests are primarily API-level. The `baseURL` is configurable via `BASE_URL` env var.

### Environment Variables

```bash
# .env.local (QA-006 §2 — canonical env file, replaces deprecated .env.test)
# Copy from .env.local.example and fill from: npx supabase status --output json
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase status: PUBLISHABLE_KEY or anon key>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status: SECRET_KEY or service_role key>
```
