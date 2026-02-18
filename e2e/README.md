# E2E Tests

End-to-end tests using Playwright for API testing of the PT-2 casino management system.

## Setup

### Prerequisites

1. Local Supabase instance running (`npx supabase start`)
2. Environment variables configured (see `.env.test.example`)

### Environment Configuration

Create a `.env.test` file (or use `.env.local`) with the following variables:

```bash
# Next.js app URL
BASE_URL=http://localhost:3000

# Supabase connection (local instance)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key

# Service role key for test data setup/teardown
SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key
```

Get the keys from `npx supabase status`:
- Use `API URL` for `NEXT_PUBLIC_SUPABASE_URL`
- Use `anon key` for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Use `service_role key` for `SUPABASE_SERVICE_ROLE_KEY`

## Running Tests

```bash
# Run all E2E tests
npm run e2e:playwright

# Run with UI mode (recommended for development)
npm run e2e:playwright:ui

# Run in debug mode
npm run e2e:playwright:debug

# Run specific test file
npx playwright test e2e/rating-slip-lifecycle.spec.ts
```

## Test Structure

### Test Fixtures (`fixtures/test-data.ts`)

Provides utilities for creating and cleaning up test data:
- `createTestScenario()`: Creates a complete test environment (casino, staff, player, table, visit)
- `createServiceClient()`: Creates a Supabase client with service role (bypasses RLS)

Each test scenario includes:
- Test casino
- Authenticated staff user
- Test player
- Test gaming table
- Active visit
- Auth token for API requests
- Cleanup function to remove all test data

### Test Files

#### `rating-slip-lifecycle.spec.ts`

Tests the complete rating slip lifecycle:
1. Open table (set status to active)
2. Start rating slip
3. Pause rating slip
4. Resume rating slip
5. Close rating slip

**Key Verifications:**
- All state transitions succeed
- Duration calculation excludes pause time
- Proper authentication and authorization
- Clean test data isolation

## Test Patterns

### Authentication

Tests use real authentication via Supabase Auth:
```typescript
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${scenario.authToken}`,
};
```

### Idempotency

Mutation endpoints require idempotency keys:
```typescript
headers: {
  ...authHeaders,
  'X-Idempotency-Key': `operation-${Date.now()}`,
}
```

### Test Isolation

- Each test creates fresh test data in `beforeEach`
- All test data is cleaned up in `afterEach`
- Test data is namespaced with timestamps to avoid conflicts

### Timing Assertions

Duration tests allow for timing variance due to async operations:
```typescript
// Allow up to 0.2 second variance
expect(Math.abs(actual - expected)).toBeLessThan(0.2);
```

## Troubleshooting

### "Missing required environment variables"

Ensure `.env.test` or `.env.local` is configured with all required variables.

### "Failed to create test casino"

Check that:
1. Supabase is running (`npx supabase status`)
2. Migrations are applied (`npx supabase migration up`)
3. Service role key is correct

### "UNAUTHORIZED: No authenticated user"

The test creates its own authenticated user. If this fails:
1. Check that the `staff` table has a `user_id` column
2. Verify auth is enabled in Supabase config
3. Check that the service role key has admin permissions

### Tests are flaky

If duration assertions are failing:
- Increase the timing variance threshold
- Check if CI environment is slower than expected
- Verify database performance is consistent

## Adding New Tests

1. Create new test file in `e2e/` directory
2. Import test fixtures from `./fixtures/test-data`
3. Use `createTestScenario()` for test data setup
4. Always clean up in `afterEach` hook
5. Use authenticated requests with `authHeaders`

Example:
```typescript
import { test, expect } from '@playwright/test';
import { createTestScenario } from './fixtures/test-data';

test.describe('My Feature E2E', () => {
  let scenario;

  test.beforeEach(async () => {
    scenario = await createTestScenario();
  });

  test.afterEach(async () => {
    if (scenario?.cleanup) {
      await scenario.cleanup();
    }
  });

  test('does something', async ({ request }) => {
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${scenario.authToken}`,
    };

    // Your test here
  });
});
```
