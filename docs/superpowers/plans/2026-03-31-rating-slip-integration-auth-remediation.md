# Rating-Slip Integration Test Auth Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate 4 rating-slip integration test files from Advisory to Trusted-Local by rewriting auth from service-role to Mode C (JWT-authenticated), fix schema drift, and fix 1 route handler mock bug.

**Architecture:** Each integration test file's `beforeAll` is rewritten to create a real auth user + staff with ADR-024 `app_metadata.staff_id` stamping, sign in for JWT, and pass an authenticated client to `createRatingSlipService()`. Service-role client is retained for setup/teardown only. Fixtures stay file-local (no shared helpers). Schema drift cases are verified individually against current types before fixing.

**Tech Stack:** Jest (node environment), Supabase JS client, ADR-024 `set_rls_context_from_staff()`, Mode C authenticated client pattern.

**Spec:** `docs/superpowers/specs/2026-03-31-rating-slip-integration-auth-remediation.md`

**Skill delegation:**
- `/e2e-testing` — consult when authoring Mode C fixture setup (QA-006 §5 alignment)
- `/qa-specialist` — invoke after each file remediation to validate Trusted-Local tier claim

---

## Task 1: Rewrite `rating-slip.integration.test.ts` auth (Validating Exemplar)

**Files:**
- Modify: `services/rating-slip/__tests__/rating-slip.integration.test.ts`

This is the largest file (~35 tests) and serves as the validating exemplar. The auth rewrite pattern proven here is applied mechanically to Tasks 2-4.

### Current broken pattern (lines 68-71)

```typescript
supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
service = createRatingSlipService(supabase);
```

### Changes required

1. Add `supabaseAnonKey` env variable
2. Create auth user + staff with `app_metadata.staff_id` stamping
3. Sign in → get JWT
4. Create authenticated client (Mode C)
5. Keep service-role client as `setupClient` for fixture creation/cleanup
6. Pass authenticated client to `createRatingSlipService()`
7. Fix `service.close()` call at line 784 — old 3-arg signature `close(casinoId, actorId, slipId)` → new 1-arg `close(slipId)`
8. Fix visit inserts in `createTestFixture()` — add required `gaming_day` and `visit_group_id` fields

- [ ] **Step 1: Add anon key and auth variables to test setup**

Replace the environment setup block (lines 33-36) and add auth-related variables after the existing fixture IDs:

```typescript
// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
```

Add to the variable declarations inside the describe block (after `let testActorId: string;` at line 63):

```typescript
  let authUserId: string; // For cleanup
```

- [ ] **Step 2: Rewrite `beforeAll` to use Mode C auth**

Replace the `beforeAll` block (lines 68-71 — the client creation and service init) with:

```typescript
  beforeAll(async () => {
    // Service-role client for setup/teardown only
    const setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // =========================================================================
    // Create shared test fixtures (using service-role)
    // =========================================================================

    // 0. Create test companies (ADR-043: company before casino)
    const { data: company, error: companyError } = await setupClient
      .from('company')
      .insert({ name: `${TEST_PREFIX} Company 1` })
      .select()
      .single();

    if (companyError) throw companyError;
    testCompanyId = company.id;

    const { data: company2, error: company2Error } = await setupClient
      .from('company')
      .insert({ name: `${TEST_PREFIX} Company 2` })
      .select()
      .single();

    if (company2Error) throw company2Error;
    testCompany2Id = company2.id;

    // 1. Create test casino
    const { data: casino, error: casinoError } = await setupClient
      .from('casino')
      .insert({
        name: `${TEST_PREFIX} Casino 1`,
        status: 'active',
        company_id: testCompanyId,
      })
      .select()
      .single();

    if (casinoError) throw casinoError;
    testCasinoId = casino.id;

    // 2. Create second casino for RLS tests
    const { data: casino2, error: casino2Error2 } = await setupClient
      .from('casino')
      .insert({
        name: `${TEST_PREFIX} Casino 2`,
        status: 'active',
        company_id: testCompany2Id,
      })
      .select()
      .single();

    if (casino2Error2) throw casino2Error2;
    testCasino2Id = casino2.id;

    // 3. Create casino settings (required for compute_gaming_day)
    await setupClient.from('casino_settings').insert([
      {
        casino_id: testCasinoId,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      },
      {
        casino_id: testCasino2Id,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      },
    ]);

    // 4. Create gaming tables
    const { data: table, error: tableError } = await setupClient
      .from('gaming_table')
      .insert({
        casino_id: testCasinoId,
        label: `${TEST_PREFIX}-BJ-01`,
        pit: 'Pit A',
        type: 'blackjack',
        status: 'active',
      })
      .select()
      .single();

    if (tableError) throw tableError;
    testTableId = table.id;

    const { data: table2, error: table2Error } = await setupClient
      .from('gaming_table')
      .insert({
        casino_id: testCasinoId,
        label: `${TEST_PREFIX}-BJ-02`,
        pit: 'Pit A',
        type: 'blackjack',
        status: 'active',
      })
      .select()
      .single();

    if (table2Error) throw table2Error;
    testTable2Id = table2.id;

    const { data: inactiveTable, error: inactiveTableError } = await setupClient
      .from('gaming_table')
      .insert({
        casino_id: testCasinoId,
        label: `${TEST_PREFIX}-BJ-INACTIVE`,
        pit: 'Pit A',
        type: 'blackjack',
        status: 'inactive',
      })
      .select()
      .single();

    if (inactiveTableError) throw inactiveTableError;
    testInactiveTableId = inactiveTable.id;

    // =========================================================================
    // ADR-024 Mode C Auth Setup
    // =========================================================================

    // 7a. Create auth user with initial metadata
    const testEmail = `${TEST_PREFIX}-actor@test.com`;
    const testPassword = 'TestPassword123!';

    const { data: authData, error: authError } = await setupClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: {
        casino_id: testCasinoId,
        staff_role: 'dealer',
      },
    });

    if (authError || !authData.user) throw authError ?? new Error('Auth user creation returned null');
    authUserId = authData.user.id;

    // 7b. Create staff record bound to auth user
    const { data: actor, error: actorError } = await setupClient
      .from('staff')
      .insert({
        casino_id: testCasinoId,
        user_id: authData.user.id,
        employee_id: `${TEST_PREFIX}-001`,
        first_name: 'Test',
        last_name: 'Actor',
        email: testEmail,
        role: 'dealer',
        status: 'active',
      })
      .select()
      .single();

    if (actorError) throw actorError;
    testActorId = actor.id;

    // 7c. Stamp staff_id into app_metadata (ADR-024 two-phase)
    await setupClient.auth.admin.updateUserById(authData.user.id, {
      app_metadata: {
        casino_id: testCasinoId,
        staff_id: actor.id,
        staff_role: 'dealer',
      },
    });

    // 7d. Sign in → get JWT
    const { data: signInData, error: signInError } = await setupClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (signInError || !signInData.session) throw signInError ?? new Error('Sign-in returned no session');

    // 7e. Create authenticated client (Mode C)
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${signInData.session.access_token}` },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    service = createRatingSlipService(supabase);
  });
```

**Note:** The existing fixture setup code for companies, casinos, tables stays identical — only `supabase` references become `setupClient`, and the staff/auth section is replaced with the Mode C pattern. The `afterAll` cleanup needs the `setupClient` too — see Step 4.

- [ ] **Step 3: Fix `service.close()` signature at line 784**

Replace the old 3-arg call:

```typescript
      const closedSlip = await service.close(
        testCasinoId,
        testActorId,
        slip.id,
      );
```

With the current 1-arg signature:

```typescript
      const closedSlip = await service.close(slip.id);
```

- [ ] **Step 4: Fix visit inserts in `createTestFixture()`**

The `createTestFixture()` helper (line ~286-296) inserts visits without the now-required `gaming_day` and `visit_group_id` fields.

Replace the visit insert:

```typescript
    // Create visit
    const visitId = randomUUID();
    const { data: visit, error: visitError } = await supabase
      .from('visit')
      .insert({
        id: visitId,
        player_id: player.id,
        casino_id: casino,
        started_at: new Date().toISOString(),
        ended_at: null,
        visit_group_id: visitId, // Self-reference for new visit group
        gaming_day: '1970-01-01', // Overwritten by compute_gaming_day trigger
      })
      .select()
      .single();
```

Add `import { randomUUID } from 'crypto';` at the top of the file (after the existing imports).

**Note:** The `createTestFixture()` function uses the authenticated `supabase` client variable from the describe scope. Since visit inserts go through RLS, they need the authenticated client. If this fails because the authenticated user's RLS policy doesn't allow visit creation, switch the fixture helper to use a `setupClient` that is stored in the describe scope. Investigate at runtime.

- [ ] **Step 5: Update `afterAll` to use service-role for cleanup**

The cleanup block needs a service-role client (RLS-bypassing). Store `setupClient` in the describe scope:

Add after `let authUserId: string;`:

```typescript
  let setupClient: SupabaseClient<Database>; // Service-role for setup/teardown
```

Initialize at the start of `beforeAll`:

```typescript
    setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
```

In `afterAll`, replace all `supabase.from(...)` cleanup calls with `setupClient.from(...)`. Add auth user deletion at the end:

```typescript
    // Delete auth user
    await setupClient.auth.admin.deleteUser(authUserId);
```

- [ ] **Step 6: Run the test file against local Supabase**

```bash
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  services/rating-slip/__tests__/rating-slip.integration.test.ts \
  > /tmp/rs-int-exemplar.log 2>&1
```

Read `/tmp/rs-int-exemplar.log` and verify:
- Zero UNAUTHORIZED failures
- All `service.start()` / `service.close()` calls succeed
- If any schema drift assertions fail, investigate individually per spec §4 decision rule

- [ ] **Step 7: Fix any remaining schema drift failures discovered in Step 6**

Based on test output, fix assertion mismatches. Document any test that cannot be fixed with a §11-compliant skip (reason + exit criteria).

- [ ] **Step 8: Re-run and confirm all tests pass**

```bash
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  services/rating-slip/__tests__/rating-slip.integration.test.ts \
  > /tmp/rs-int-exemplar-final.log 2>&1
```

Expected: All ~35 tests PASS. Zero UNAUTHORIZED. Zero schema drift failures.

- [ ] **Step 9: Commit**

```bash
git add services/rating-slip/__tests__/rating-slip.integration.test.ts
git commit -m "fix(test): rewrite rating-slip.integration auth to Mode C (ADR-024)

Replaces service-role client with JWT-authenticated client per ADR-024.
Fixes service.close() signature drift (3-arg → 1-arg).
Adds gaming_day + visit_group_id to visit inserts (schema evolution).

Governance: Advisory → Trusted-Local (Testing Governance Standard §2/§5)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Rewrite `rating-slip-continuity.integration.test.ts` auth

**Files:**
- Modify: `services/rating-slip/__tests__/rating-slip-continuity.integration.test.ts`

Mechanical application of the Task 1 pattern. This file has identical auth shape.

- [ ] **Step 1: Add anon key env variable**

Add after line 28:

```typescript
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
```

Add to describe-scoped variables (after `let testActorId: string;`):

```typescript
  let authUserId: string;
  let setupClient: SupabaseClient<Database>;
```

- [ ] **Step 2: Rewrite `beforeAll` with Mode C auth**

Same pattern as Task 1 Step 2. Replace `supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)` with `setupClient = createClient<Database>(...)`, change all fixture setup to use `setupClient`, then add the ADR-024 Mode C auth block (create auth user, create staff with `user_id`, stamp `staff_id`, sign in, create authenticated client).

The staff record in this file uses `role: 'dealer'` (line 184). Preserve that.

- [ ] **Step 3: Fix visit inserts in `createTestFixture()`**

This file has the same `createTestFixture()` pattern as Task 1. Add `gaming_day` and `visit_group_id` to the visit insert. Add `import { randomUUID } from 'crypto';` at the top.

```typescript
    const visitId = randomUUID();
    const { data: visit, error: visitError } = await supabase
      .from('visit')
      .insert({
        id: visitId,
        player_id: player.id,
        casino_id: casino,
        started_at: new Date().toISOString(),
        ended_at: null,
        visit_group_id: visitId,
        gaming_day: '1970-01-01', // Overwritten by trigger
      })
      .select()
      .single();
```

- [ ] **Step 4: Remove unused `DomainError` import if confirmed unused**

Line 21: `import { DomainError } from '@/lib/errors/domain-errors';` — TS6133 says it's unused. Grep the file for `DomainError` usage. If no usage beyond the import, remove the import line.

- [ ] **Step 5: Update `afterAll` to use `setupClient` for cleanup + auth user deletion**

Same pattern as Task 1 Step 5. Replace `supabase` with `setupClient` in all cleanup operations. Add `await setupClient.auth.admin.deleteUser(authUserId);` at the end.

- [ ] **Step 6: Run and verify**

```bash
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  services/rating-slip/__tests__/rating-slip-continuity.integration.test.ts \
  > /tmp/rs-continuity-int.log 2>&1
```

Expected: All ~25 tests PASS.

- [ ] **Step 7: Fix any remaining failures and re-run**

Investigate failures individually. Apply §11 skip policy if needed.

- [ ] **Step 8: Commit**

```bash
git add services/rating-slip/__tests__/rating-slip-continuity.integration.test.ts
git commit -m "fix(test): rewrite rating-slip-continuity auth to Mode C (ADR-024)

Same pattern as rating-slip.integration exemplar.
Adds gaming_day + visit_group_id to visit inserts.
Removes unused DomainError import.

Governance: Advisory → Trusted-Local

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Rewrite `policy-snapshot.integration.test.ts` auth

**Files:**
- Modify: `services/rating-slip/__tests__/policy-snapshot.integration.test.ts`

This file has a slightly different structure: it uses a standalone `createTestFixture(supabase)` function (line 542) that already creates company/casino/staff. The auth rewrite goes into that function.

### Key differences from Tasks 1-2

- `createTestFixture()` is a standalone function (not nested in describe), takes `supabase` as parameter
- `createIsolatedVisit()` helper also creates visits — needs `gaming_day` + `visit_group_id` fix
- `service.close()` has 2 instances using old 3-4 arg signature (lines 159, 355)

- [ ] **Step 1: Add anon key and restructure client management**

Add after line 27:

```typescript
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
```

Update the `TestFixture` interface (line 31-39) to include auth artifacts:

```typescript
interface TestFixture {
  casinoId: string;
  tableId: string;
  actorId: string;
  playerId: string;
  visitId: string;
  slipIds: string[];
  authUserId: string;
  setupClient: SupabaseClient<Database>;
  cleanup: () => Promise<void>;
}
```

- [ ] **Step 2: Rewrite `createTestFixture()` with Mode C auth**

The function at line 542 already creates company, casino, settings, table, game_settings, staff, player, and visit. Add the Mode C auth block after staff creation (after line 620):

```typescript
  // ADR-024 Mode C Auth Setup
  const testEmail = `${TEST_PREFIX}-auth@test.com`;
  const testPassword = 'TestPassword123!';

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    app_metadata: {
      casino_id: casino.id,
      staff_role: 'pit_boss',
    },
  });

  if (authError || !authData.user) throw authError ?? new Error('Auth user creation failed');

  // Bind staff to auth user
  await supabase
    .from('staff')
    .update({ user_id: authData.user.id })
    .eq('id', actor.id);

  // Stamp staff_id (ADR-024 two-phase)
  await supabase.auth.admin.updateUserById(authData.user.id, {
    app_metadata: {
      casino_id: casino.id,
      staff_id: actor.id,
      staff_role: 'pit_boss',
    },
  });

  // Sign in → get JWT
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signInError || !signInData.session) throw signInError ?? new Error('Sign-in failed');
```

Update the staff insert to include `user_id` placeholder (or update after insert as shown above).

**Important:** The `supabase` parameter passed to `createTestFixture()` is the service-role client. Store it as `setupClient` in the fixture return. The authenticated client is created inside and used for the service.

Update the return object:

```typescript
  return {
    casinoId: casino.id,
    tableId: table.id,
    actorId: actor.id,
    playerId: player.id,
    visitId: visit.id,
    slipIds: [],
    authUserId: authData.user.id,
    setupClient: supabase, // The service-role client for cleanup
    cleanup: async () => {
      // ... existing cleanup ...
      // Add auth user deletion:
      await supabase.auth.admin.deleteUser(authData.user.id);
    },
  };
```

- [ ] **Step 3: Update `beforeAll` to create authenticated service**

Replace lines 46-48:

```typescript
  beforeAll(async () => {
    const setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
    fixture = await createTestFixture(setupClient);

    // Create authenticated client from fixture auth
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${fixture.authToken}` },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    service = createRatingSlipService(supabase);
  });
```

This requires adding `authToken` to the fixture interface and return. Add to `TestFixture`:

```typescript
  authToken: string;
```

Add to the return in `createTestFixture()`:

```typescript
    authToken: signInData.session.access_token,
```

- [ ] **Step 4: Fix `service.close()` calls using old 3-4 arg signature**

Line 159 — replace:

```typescript
      const closed = await service.close(
        fixture.casinoId,
        fixture.actorId,
        slip.id,
        {
          average_bet: 50,
        },
      );
```

With:

```typescript
      const closed = await service.close(slip.id, {
        average_bet: 50,
      });
```

Line 355 — same pattern, replace 4-arg call with 2-arg.

- [ ] **Step 5: Fix visit inserts in `createIsolatedVisit()` and `createTestFixture()`**

Both functions insert visits without `gaming_day` and `visit_group_id`. Add:

```typescript
    const visitId = randomUUID();
    const { data: visit, error: visitError } = await supabase
      .from('visit')
      .insert({
        id: visitId,
        player_id: player.id,
        casino_id: fixture.casinoId, // or casino.id in createTestFixture
        started_at: new Date().toISOString(),
        ended_at: null,
        visit_group_id: visitId,
        gaming_day: '1970-01-01', // Overwritten by trigger
      })
      .select()
      .single();
```

Ensure `import { randomUUID } from 'crypto';` is already present (it is — line 16).

- [ ] **Step 6: Run and verify**

```bash
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  services/rating-slip/__tests__/policy-snapshot.integration.test.ts \
  > /tmp/rs-policy-snapshot-int.log 2>&1
```

Expected: All ~7 tests PASS.

- [ ] **Step 7: Fix any remaining failures and re-run**

- [ ] **Step 8: Commit**

```bash
git add services/rating-slip/__tests__/policy-snapshot.integration.test.ts
git commit -m "fix(test): rewrite policy-snapshot auth to Mode C (ADR-024)

Adds Mode C auth to createTestFixture. Fixes service.close() signature.
Adds gaming_day + visit_group_id to visit inserts.

Governance: Advisory → Trusted-Local

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Complete `rating-slip-move-pooling.integration.test.ts` auth

**Files:**
- Modify: `services/rating-slip/__tests__/rating-slip-move-pooling.integration.test.ts`

This file has **partial auth** already — `ensureStaffContext()` creates auth users and staff records (line 225-280). But it's missing:
1. `company_id` on casino insert (line 243) — ADR-043 requirement
2. `gaming_day` + `visit_group_id` on visit insert (line 315)
3. `staff_id` stamping in `app_metadata` (ADR-024 two-phase)
4. Mode C authenticated client — currently uses service-role for everything

### Key difference from Tasks 1-3

The `ensureStaffContext()` helper is called **per-test** (not in `beforeAll`), creating separate casinos for isolation. Each call creates its own auth user + staff. The rewrite extends this existing pattern rather than replacing it entirely.

- [ ] **Step 1: Add anon key env variable**

After line 39:

```typescript
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
```

- [ ] **Step 2: Rewrite `ensureStaffContext()` to return authenticated client**

Update the return type and function body:

```typescript
async function ensureStaffContext(
  setupClient: SupabaseClient<Database>,
): Promise<{
  casinoId: string;
  actorId: string;
  userId: string;
  authedClient: SupabaseClient<Database>;
  authedService: RatingSlipServiceInterface;
}> {
  const testEmail = `test-staff-${Date.now()}@test.com`;
  const testPassword = 'TestPassword123!';

  // Create auth user
  const { data, error } = await setupClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    app_metadata: {
      staff_role: 'pit_boss',
    },
  });

  if (error) throw error;

  // Create company (ADR-043)
  const { data: company, error: companyError } = await setupClient
    .from('company')
    .insert({ name: `Test Company ${Date.now()}` })
    .select()
    .single();

  if (companyError) throw companyError;

  // Create casino with company_id
  const { data: casino, error: casinoError } = await setupClient
    .from('casino')
    .insert({
      name: `Test Casino ${Date.now()}`,
      status: 'active',
      company_id: company.id,
    })
    .select()
    .single();

  if (casinoError) throw casinoError;

  // Create casino settings
  await setupClient.from('casino_settings').insert({
    casino_id: casino.id,
    gaming_day_start_time: '06:00:00',
    timezone: 'America/Los_Angeles',
    watchlist_floor: 3000,
    ctr_threshold: 10000,
  });

  // Create staff record
  const { data: staff, error: staffError } = await setupClient
    .from('staff')
    .insert({
      casino_id: casino.id,
      user_id: data.user.id,
      employee_id: `EMP-${Date.now()}`,
      first_name: 'Test',
      last_name: 'Staff',
      role: 'pit_boss',
      status: 'active',
    })
    .select()
    .single();

  if (staffError) throw staffError;

  // Stamp staff_id (ADR-024 two-phase)
  await setupClient.auth.admin.updateUserById(data.user.id, {
    app_metadata: {
      casino_id: casino.id,
      staff_id: staff.id,
      staff_role: 'pit_boss',
    },
  });

  // Sign in → JWT
  const { data: signInData, error: signInError } = await setupClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signInError || !signInData.session) throw signInError ?? new Error('Sign-in failed');

  // Mode C client
  const authedClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${signInData.session.access_token}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    casinoId: casino.id,
    actorId: staff.id,
    userId: data.user.id,
    authedClient,
    authedService: createRatingSlipService(authedClient),
  };
}
```

- [ ] **Step 3: Fix `createTestVisit()` — add required fields**

Replace lines 313-323:

```typescript
async function createTestVisit(
  client: SupabaseClient<Database>,
  casinoId: string,
  playerId: string,
): Promise<string> {
  const visitId = randomUUID();
  const { data, error } = await client
    .from('visit')
    .insert({
      id: visitId,
      player_id: playerId,
      casino_id: casinoId,
      visit_group_id: visitId,
      gaming_day: '1970-01-01', // Overwritten by trigger
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}
```

Add `import { randomUUID } from 'crypto';` at the top.

- [ ] **Step 4: Update test bodies to use `authedService` from `ensureStaffContext()`**

Each test currently does:

```typescript
const { casinoId, actorId } = await ensureStaffContext(supabase);
// ...
const slip = await service.start(casinoId, actorId, { ... });
```

Update to:

```typescript
const { casinoId, actorId, authedService } = await ensureStaffContext(setupClient);
// ...
const slip = await authedService.start(casinoId, actorId, { ... });
```

Replace `service.close(...)` calls with `authedService.close(...)` in each test.

Also update `createTestPlayer`, `createTestVisit`, `createTestTable`, and `createMoveFixture` calls to pass `setupClient` instead of `supabase`.

- [ ] **Step 5: Update `beforeAll` — store `setupClient`**

Replace lines 52-58:

```typescript
  let setupClient: SupabaseClient<Database>;

  beforeAll(() => {
    setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  });
```

Remove the top-level `service` variable — each test gets its own `authedService`.

- [ ] **Step 6: Remove `injectRLSContext` import if unused after rewrite**

Line 33 imports `injectRLSContext` — verify if any test still uses it. If not, remove the import.

- [ ] **Step 7: Run and verify**

```bash
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  services/rating-slip/__tests__/rating-slip-move-pooling.integration.test.ts \
  > /tmp/rs-move-pooling-int.log 2>&1
```

Expected: All ~4 tests PASS.

- [ ] **Step 8: Fix remaining failures and re-run**

- [ ] **Step 9: Commit**

```bash
git add services/rating-slip/__tests__/rating-slip-move-pooling.integration.test.ts
git commit -m "fix(test): complete move-pooling auth with Mode C (ADR-024)

Adds company_id to casino inserts (ADR-043).
Adds gaming_day + visit_group_id to visit inserts.
Stamps staff_id in app_metadata (ADR-024 two-phase).
Returns authenticated client from ensureStaffContext().

Governance: Advisory → Trusted-Local

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Fix `modal-data/route.test.ts` mock bug

**Files:**
- Modify: `app/api/v1/rating-slips/[id]/modal-data/__tests__/route.test.ts`

The test at line 93 expects `response.status` to be 200 but gets 500. This is a mock/logic bug — the mocks don't provide enough data for the route handler to construct a complete response.

- [ ] **Step 1: Read the route handler to understand what data it expects**

Read `app/api/v1/rating-slips/[id]/modal-data/route.ts` in full to understand what services are called and what response shape is expected.

- [ ] **Step 2: Investigate the 500 error**

Run the test in isolation to see the actual error:

```bash
npx jest --config jest.node.config.js \
  app/api/v1/rating-slips/\\[id\\]/modal-data/__tests__/route.test.ts \
  --verbose > /tmp/modal-data-route.log 2>&1
```

Read the error output to identify which mock is insufficient.

- [ ] **Step 3: Fix the mock that causes the 500**

Based on the error, update the relevant mock to provide the data the route handler expects. The `getById` mock returns a slip with `player_id: null` visit — this may trigger an error path if the handler expects player data.

Fix the mock to match the route handler's expectations. The fix will depend on what Step 2 reveals.

- [ ] **Step 4: Run and verify**

```bash
npx jest --config jest.node.config.js \
  app/api/v1/rating-slips/\\[id\\]/modal-data/__tests__/route.test.ts \
  --verbose > /tmp/modal-data-route-fixed.log 2>&1
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/rating-slips/\[id\]/modal-data/__tests__/route.test.ts
git commit -m "fix(test): fix modal-data route test mock returning 500

Updates mock data to match route handler expectations.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Invoke `/qa-specialist` — validate Trusted-Local tier

- [ ] **Step 1: Run full integration suite**

```bash
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  services/rating-slip/__tests__/*.integration.test.ts \
  > /tmp/rs-int-full-suite.log 2>&1
```

- [ ] **Step 2: Invoke `/qa-specialist` to validate tier transition**

Use the `/qa-specialist` skill to:
- Confirm all 4 integration test files pass
- Validate Trusted-Local conditions per Testing Governance Standard §2
- Produce a quality gate report
- Document any §11 skips in the skip registry

- [ ] **Step 3: Run modal-data route test to confirm route handler fix**

```bash
npx jest --config jest.node.config.js \
  app/api/v1/rating-slips/\\[id\\]/modal-data/__tests__/route.test.ts \
  --verbose > /tmp/modal-data-final.log 2>&1
```

---

## Task 7: Update governance artifacts

**Files:**
- Modify: `docs/issues/gaps/testing-arch-remediation/rating-slip-rollout/ROLLOUT-SUMMARY-03-31.md`

- [ ] **Step 1: Update the rollout summary exit state table**

Replace the final table in `ROLLOUT-SUMMARY-03-31.md` with:

```markdown
| Layer | Files | Directive | Status |
|-------|-------|-----------|--------|
| Service unit tests | 7 | `@jest-environment node` | **PASS** |
| Route handlers | 10 | `@jest-environment node` | **10 PASS** |
| Modal service tests | 5 | `@jest-environment node` | **124 PASS** |
| Integration tests | 4 | `@jest-environment node` | **PASS** (Mode C auth remediated) |
| RPC contract | 1 | `@jest-environment node` | **112 PASS** |
| Hooks/components/store | 4 | jsdom (correct for UI) | Mixed — separate remediation track |
```

- [ ] **Step 2: Update the Verdict section**

Replace the verdict to reflect completion:

```markdown
### Verdict (updated 2026-03-31)

**Rating-slip service testing remediation is COMPLETE.** All service-layer test files
(unit, route handler, modal service, integration, RPC contract) achieve Trusted-Local
verification tier per Testing Governance Standard §2.

- Integration tests rewritten from service-role to Mode C (ADR-024 authenticated client)
- Schema drift resolved: casino `company_id` (ADR-043), visit `gaming_day`/`visit_group_id`
- `service.close()` signature drift fixed (3-arg → 1-arg)
- Route handler mock bug fixed in `modal-data/route.test.ts`

**Remaining:** Hooks/components/store (4 files) — UI-layer, legitimately jsdom. Separate track.
```

- [ ] **Step 3: Add skip registry if any §11 skips were needed**

If any tests were skipped during Tasks 1-4, add a skip registry section:

```markdown
### Skip Registry (§11)

| File | Test(s) | Reason | Exit Criteria |
|------|---------|--------|---------------|
| ... | ... | ... | ... |
```

If no skips were needed, add:

```markdown
### Skip Registry (§11)

No skips required. All tests pass.
```

- [ ] **Step 4: Commit governance update**

```bash
git add docs/issues/gaps/testing-arch-remediation/rating-slip-rollout/ROLLOUT-SUMMARY-03-31.md
git commit -m "docs: update rollout summary — rating-slip integration tests Trusted-Local

All 4 integration test files remediated from Advisory to Trusted-Local.
Mode C auth, schema drift fixes, service.close() signature fix.
§12 change disclosure: confidence INCREASED for integration layer.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
