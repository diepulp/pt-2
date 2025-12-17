# PT-2 E2E Testing Patterns

Testing patterns and anti-patterns specific to the PT-2 casino pit management system.

## Test Structure Patterns

### Pattern 1: Workflow Isolation

Each test should create its own complete test scenario:

```typescript
import { test, expect } from '@playwright/test';
import { createTestScenario, TestScenario } from '../fixtures/test-data';

test.describe('Rating Slip Workflow', () => {
  let scenario: TestScenario;

  test.beforeEach(async () => {
    scenario = await createTestScenario();
  });

  test.afterEach(async () => {
    await scenario.cleanup();
  });

  test('can start and close rating slip', async ({ request }) => {
    // Test uses scenario.casinoId, scenario.playerId, etc.
  });
});
```

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

### Anti-Pattern 5: Incomplete Cleanup

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

### Casino Factory

```typescript
export async function createTestCasino(
  supabase: SupabaseClient,
  timestamp: number
): Promise<Casino> {
  const { data, error } = await supabase
    .from('casino')
    .insert({
      name: `Test Casino ${timestamp}`,
      timezone: 'America/Los_Angeles',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

### Staff Factory

```typescript
export async function createTestStaff(
  supabase: SupabaseClient,
  casinoId: string,
  timestamp: number
): Promise<Staff> {
  const email = `staff-${timestamp}@test.example.com`;

  // Create auth user
  const { data: authUser } = await supabase.auth.admin.createUser({
    email,
    password: 'TestPassword123!',
    email_confirm: true,
  });

  // Create staff record
  const { data, error } = await supabase
    .from('staff')
    .insert({
      id: authUser.user.id,
      casino_id: casinoId,
      email,
      first_name: 'Test',
      last_name: `Staff ${timestamp}`,
      role: 'pit_boss',
    })
    .select()
    .single();

  if (error) throw error;
  return { ...data, email };
}
```

### Player Factory

```typescript
export async function createTestPlayer(
  supabase: SupabaseClient,
  casinoId: string,
  timestamp: number
): Promise<Player> {
  // Create player
  const { data: player } = await supabase
    .from('player')
    .insert({
      first_name: 'Test',
      last_name: `Player ${timestamp}`,
    })
    .select()
    .single();

  // Create enrollment
  await supabase.from('player_enrollment').insert({
    player_id: player.id,
    casino_id: casinoId,
  });

  // Create loyalty account
  await supabase.from('player_loyalty').insert({
    player_id: player.id,
    casino_id: casinoId,
    current_balance: 0,
  });

  return player;
}
```

### Table Factory

```typescript
export async function createTestTable(
  supabase: SupabaseClient,
  casinoId: string,
  timestamp: number
): Promise<GamingTable> {
  const { data, error } = await supabase
    .from('gaming_table')
    .insert({
      casino_id: casinoId,
      table_number: `T${timestamp}`,
      game_type: 'blackjack',
      seat_count: 6,
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

Delete in reverse dependency order to avoid FK violations:

```typescript
export async function deleteTestData(
  supabase: SupabaseClient,
  scenario: TestScenario
): Promise<void> {
  const { casinoId } = scenario;

  // 1. Rating slip pauses (depends on rating_slip)
  await supabase
    .from('rating_slip_pause')
    .delete()
    .eq('rating_slip_id', supabase.from('rating_slip').select('id').eq('casino_id', casinoId));

  // 2. Rating slips (depends on visit, table)
  await supabase.from('rating_slip').delete().eq('casino_id', casinoId);

  // 3. Loyalty ledger (depends on player_loyalty)
  await supabase.from('loyalty_ledger').delete().eq('casino_id', casinoId);

  // 4. Player loyalty (depends on player, casino)
  await supabase.from('player_loyalty').delete().eq('casino_id', casinoId);

  // 5. Financial transactions (depends on visit)
  await supabase.from('player_financial_transaction').delete().eq('casino_id', casinoId);

  // 6. Visits (depends on player, casino)
  await supabase.from('visit').delete().eq('casino_id', casinoId);

  // 7. Player enrollments (depends on player, casino)
  await supabase.from('player_enrollment').delete().eq('casino_id', casinoId);

  // 8. Gaming tables (depends on casino)
  await supabase.from('gaming_table').delete().eq('casino_id', casinoId);

  // 9. Staff (depends on casino, auth.users)
  const { data: staff } = await supabase
    .from('staff')
    .select('id')
    .eq('casino_id', casinoId);

  if (staff) {
    await supabase.from('staff').delete().eq('casino_id', casinoId);
    for (const s of staff) {
      await supabase.auth.admin.deleteUser(s.id);
    }
  }

  // 10. Casino settings (depends on casino)
  await supabase.from('casino_settings').delete().eq('casino_id', casinoId);

  // 11. Casino (root entity)
  await supabase.from('casino').delete().eq('id', casinoId);
}
```

---

## Environment Configuration

### Playwright Config for PT-2

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Environment Variables

```bash
# .env.test
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Only for test setup
```
