# Rating Slip Integration Tests — Session Handoff

> **Date:** 2026-03-31
> **From:** Current session (env directive rollout)
> **To:** Next session (integration test remediation)
> **Blocking issue:** 82× `UNAUTHORIZED: staff identity not found` across 4 integration test files

---

## What Was Done This Session

1. Added `/** @jest-environment node */` to 9 files (4 integration + 5 modal service)
2. Eliminated `fetch is not defined` — the jsdom env problem is fully resolved
3. Modal service tests: **124 tests PASS** under correct environment
4. Integration tests: `fetch` error gone, but **102 tests FAIL** for legitimate reasons

## Root Cause of Remaining Failures

### Primary: Pre-ADR-024 Auth Pattern (82 failures)

The integration tests were written before ADR-024 (authoritative context derivation). They create a **service-role client** and pass it to `createRatingSlipService()`. The service then calls SECURITY DEFINER RPCs (`rpc_start_rating_slip`, `rpc_close_rating_slip`, etc.) which internally call `set_rls_context_from_staff()`:

```
set_rls_context_from_staff()
  → auth.uid()              ← returns NULL with service-role client
  → staff lookup by user_id ← no match
  → RAISE EXCEPTION 'UNAUTHORIZED: staff identity not found'
```

**This is by design** (ADR-024 defense-in-depth). Service-role clients have no `auth.uid()`. The tests need real JWTs.

### Secondary: Schema Drift (4-6 failures)

- `casino` insert missing `company_id` (required after ADR-043)
- `visit` insert missing `gaming_day`, `visit_group_id` (required fields)
- Some DTO assertions reference old field shapes

### Tertiary: Move-Pooling Partial Auth (4 failures)

`rating-slip-move-pooling.integration.test.ts` creates an auth user but:
- Casino insert missing `company_id`
- `app_metadata` missing `casino_id` and `staff_id` (ADR-024 requirement)

---

## Files to Fix

| File | Tests | Failure Mode | Fix Scope |
|------|-------|-------------|-----------|
| `rating-slip.integration.test.ts` | ~35 | `UNAUTHORIZED` — no auth user, service-role client | Full auth setup rewrite |
| `rating-slip-continuity.integration.test.ts` | ~25 | `UNAUTHORIZED` — same pattern | Full auth setup rewrite |
| `policy-snapshot.integration.test.ts` | ~7 | `UNAUTHORIZED` — same pattern | Full auth setup rewrite |
| `rating-slip-move-pooling.integration.test.ts` | ~4 | Partial auth + missing `company_id` | Fix `app_metadata` + `company_id` |

### Files Already Passing (no changes needed)

| File | Tests | Status |
|------|-------|--------|
| `rating-slip-rpc-contract.int.test.ts` | 112 | PASS — pure schema/type/mapper validation, no Supabase calls |
| `rating-slip.service.test.ts` | — | PASS — unit tests, fully mocked |
| `mappers.test.ts` | — | PASS |
| `queries.test.ts` | — | PASS |
| `http-contract.test.ts` | — | PASS |
| All 5 `rating-slip-modal/__tests__/` | 124 | PASS |

---

## Fix Pattern

The fix follows the E2E fixture exemplar (`e2e/fixtures/auth.ts` + `exclusion-fixtures.ts`), adapted for Jest integration tests.

### 1. Create a shared integration test helper

```typescript
// services/__test-helpers__/integration-auth.ts (or similar)

export async function createIntegrationScenario(role: 'admin' | 'pit_boss' = 'admin') {
  const supabase = createServiceClient(); // service-role for setup

  // ADR-043: company before casino
  const company = await insert('company', { name: `int-test-${randomUUID().slice(0,8)}` });
  const casino = await insert('casino', { name: '...', company_id: company.id, status: 'active' });

  // Casino settings (gaming_day trigger dependency)
  await insert('casino_settings', { casino_id: casino.id, gaming_day_start_time: '06:00:00', timezone: 'America/Los_Angeles' });

  // Auth user + staff + app_metadata stamping (ADR-024)
  const authUser = await supabase.auth.admin.createUser({
    email: `int-test-${randomUUID().slice(0,8)}@test.com`,
    password: 'TestPassword123!',
    email_confirm: true,
    app_metadata: { casino_id: casino.id, staff_role: role },
  });

  const staff = await insert('staff', {
    casino_id: casino.id,
    user_id: authUser.data.user.id,
    first_name: 'Test', last_name: role,
    email: authUser.email, role, status: 'active',
  });

  // Stamp staff_id into app_metadata (ADR-024 Phase 2)
  await supabase.auth.admin.updateUserById(authUser.data.user.id, {
    app_metadata: { casino_id: casino.id, staff_id: staff.id, staff_role: role },
  });

  // Sign in → real JWT with auth.uid()
  const { data: session } = await supabase.auth.signInWithPassword({
    email, password: 'TestPassword123!',
  });

  // Authenticated client for RPC calls (Mode C)
  const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    serviceClient: supabase,         // for setup/teardown (bypasses RLS)
    authedClient,                     // for service instantiation (real JWT)
    casinoId: casino.id,
    staffId: staff.id,
    userId: authUser.data.user.id,
    cleanup: async () => { /* reverse FK order delete */ },
  };
}
```

### 2. Rewrite beforeAll in each integration test

```typescript
// Before (broken):
supabase = createClient(supabaseUrl, supabaseServiceKey);
service = createRatingSlipService(supabase);

// After (correct):
const scenario = await createIntegrationScenario('admin');
serviceClient = scenario.serviceClient;  // for fixture setup
service = createRatingSlipService(scenario.authedClient);  // real JWT for RPCs
```

### 3. Fix schema drift in fixture setup

- All `casino` inserts need `company_id`
- All `visit` inserts need `gaming_day` and `visit_group_id`
- Check `visit_kind` enum values match current schema

---

## Execution Order

1. **Create shared integration auth helper** — reusable across all integration tests, not just rating-slip
2. **Fix `rating-slip.integration.test.ts` first** — largest file (35 tests), validates the pattern
3. **Apply pattern to remaining 3 files** — mechanical once the first one works
4. **Run `npm run test:integration:canary`** — verify all pass with local Supabase
5. **Update ROLLOUT-SUMMARY** — mark integration tests as remediated

## Pre-Requisites

- Local Supabase must be running (`npx supabase start`)
- Migrations applied (`npx supabase migration up`)
- `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env` or `.env.local`

## Verification Command

```bash
# Start Supabase if not running
npx supabase start

# Run integration tests
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js --testPathPatterns='rating-slip' --maxWorkers=1
```

## What Success Looks Like

| Metric | Current | Target |
|--------|---------|--------|
| Integration tests passing | 112 (schema-only) | ~214 (all) |
| `UNAUTHORIZED` failures | 82 | 0 |
| `fetch is not defined` | 0 (fixed this session) | 0 |
| Modal service tests | 124 PASS (node) | 124 PASS (node) |
| Test governance tier | Advisory | Trusted-Local (§2 Tier 1) |

## References

- ADR-024: Authoritative context derivation — why service-role fails for RPCs
- QA-006 §5: SECURITY DEFINER RPC testing pattern (Mode C)
- QA-006 §13: Fixture invariants table (casino_settings, app_metadata.staff_id)
- Testing Governance Standard §4: Environment contract
- `e2e/fixtures/auth.ts`: Canonical auth helpers (pattern source)
- `e2e/fixtures/exclusion-fixtures.ts`: Exemplar fixture factory (ADR-043 + ADR-024 compliant)
