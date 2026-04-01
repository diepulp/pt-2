# LIB-SERVER-ACTIONS-POSTURE.md

**Layer:** `lib/server-actions/middleware/__tests__/`
**Tier:** 3 — Infrastructure Surfaces (Slice 5)
**Phase:** A complete, Phase B assessed
**Date:** 2026-04-01

---

## File Inventory

| File | Type | Directive | Gate | Phase B |
|------|------|-----------|------|---------|
| `auth.test.ts` | Unit | ✅ | N/A | No auth patterns — fully mocked via `getAuthContext` |
| `idempotency.test.ts` | Unit | ✅ | N/A | No auth patterns — mocked SupabaseClient |
| `tracing.test.ts` | Unit | ✅ | N/A | No auth patterns — mocked error-map |
| `compositor.test.ts` | Unit | ✅ | N/A | No auth patterns — all deps mocked |
| `auth-chain-entrypoints.test.ts` | Unit | ✅ | N/A | Static grep gate only — no auth calls |
| `rls.test.ts` | Unit | ✅ | N/A | Mocks `injectRLSContext` + `dev-context` — no live calls |
| `audit.test.ts` | Unit | ✅ | N/A | No auth patterns — mocked SupabaseClient |
| `audit-log.int.test.ts` | Integration | ✅ | ✅ | `getTestSupabaseServiceClient()` — service role, `skipAuth: true` |
| `middleware-chain.int.test.ts` | Integration | ✅ | ✅ | `getTestSupabaseServiceClient()` — service role, `skipAuth: true` |
| `wrapped-route.int.test.ts` | Integration | ✅ | ✅ | No Supabase client — pure contract/shape assertions |

---

## Layer Health

| Metric | Count |
|--------|-------|
| Total files | 10 |
| `@jest-environment node` | 10/10 |
| `RUN_INTEGRATION_TESTS` gate | 3/3 |
| Unit test files | 7 |
| Integration test files | 3 |

---

## Phase B Assessment

### Auth Pattern Scan

Pattern search: `createClient`, `set_rls_context`, `set_rls_context_internal`

#### `audit-log.int.test.ts`
- **Client**: Uses `getTestSupabaseServiceClient()` from `./helpers` — service role key, not user JWT
- **Auth bypass**: All `withServerAction` calls use `skipAuth: true`
- **set_rls_context**: Not present — service role bypasses RLS
- **set_rls_context_internal**: Not present
- **Phase B risk**: Low. Tests audit log persistence only. No auth context injection tested.
- **Gap**: Does not test the auth middleware path (authenticated user calling withServerAction without skipAuth). Phase B should add a test with a real JWT and `set_rls_context_from_staff()`.

#### `middleware-chain.int.test.ts`
- **Client**: Uses `getTestSupabaseServiceClient()` — service role key
- **Auth bypass**: All cases use `skipAuth: true`
- **set_rls_context**: Not present
- **set_rls_context_internal**: Not present
- **Phase B risk**: Medium. Chain integration tests skip the auth middleware entirely. The `withAuth` path (JWT → `set_rls_context_from_staff()` → RLS context) is not exercised.
- **Gap**: Full chain test with authenticated user is missing. Phase B should add one test without `skipAuth` using a test JWT seeded in `setupTestData`.

#### `wrapped-route.int.test.ts`
- **Client**: No Supabase client at all
- **Auth bypass**: N/A — this file tests HTTP envelope shapes and header extraction patterns only
- **set_rls_context**: Not present
- **set_rls_context_internal**: Not present
- **Phase B risk**: Low. All assertions are pure contract/shape checks using mock objects and `Map`. No live DB calls.
- **Gap**: File is misclassified as integration (`int.test.ts`) — content is entirely unit-level. Phase B should consider renaming to `wrapped-route.test.ts` and removing `setupTestData`/`cleanupTestData` calls.

---

## Known Issues

1. **`wrapped-route.int.test.ts` misclassification** — File contains no database interaction and no Supabase client usage. The `.int.test.ts` suffix is misleading. `setupTestData`/`cleanupTestData` are called but their results are never used by the tests. Phase B recommendation: rename to `wrapped-route.test.ts`.

2. **Auth path not exercised in integration tests** — All integration tests bypass auth via `skipAuth: true`. The full `withServerAction` → `withAuth` → `set_rls_context_from_staff()` → handler path has zero integration coverage. This is the highest-risk gap for the auth pipeline.

3. **`helpers` module not audited** — `./helpers` exports `getTestSupabaseServiceClient`, `setupTestData`, `cleanupTestData`. Phase B should confirm helpers use `SUPABASE_SERVICE_ROLE_KEY` and not anon key, and that `setupTestData` seeds deterministic test fixtures.
