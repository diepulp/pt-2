# LIB-SUPABASE-POSTURE.md

**Surface:** `lib/supabase/__tests__/`
**Tier:** 3 — RLS Core Infrastructure
**Phase:** A complete (2026-04-01)
**Risk:** Highest — casino-scoped RLS enforcement, multi-tenant isolation

---

## File Inventory

| File | Type | Directive | Gate | Phase B |
|------|------|-----------|------|---------|
| `assert-rows-affected.test.ts` | unit | ✅ added | n/a | no Supabase |
| `bypass-lockdown.test.ts` | unit | ✅ added | n/a | no Supabase |
| `claims-lifecycle.test.ts` | unit | ✅ added | n/a | no Supabase |
| `pit-boss-financial-txn.test.ts` | integration | ✅ pre-existing | ✅ normalized | ADR-024 flow |
| `rls-context.integration.test.ts` | integration | ✅ added | ✅ added | set_rls_context_internal ×13 |
| `rls-financial.integration.test.ts` | integration | ✅ added | ✅ added | set_rls_context_internal ×2 |
| `rls-jwt-claims.integration.test.ts` | integration | ✅ added | ✅ added | createClient ×3, no context RPC |
| `rls-mtl.integration.test.ts` | integration | ✅ added | ✅ replaced | set_rls_context_internal ×2 |
| `rls-policy-enforcement.integration.test.ts` | integration | ✅ added | ✅ added | set_rls_context_internal ×2 |
| `rls-pooling-safety.integration.test.ts` | integration | ✅ added | ✅ added | set_rls_context_internal ×4, createClient ×26 |

**Gate canonical form:** `process.env.RUN_INTEGRATION_TESTS === 'true' || process.env.RUN_INTEGRATION_TESTS === '1'`

---

## Layer Health

| Check | Status |
|-------|--------|
| `@jest-environment node` on all 10 files | ✅ 10/10 |
| `RUN_INTEGRATION_TESTS` gate on all 6 integration files | ✅ 6/6 |
| Gate checks both `'true'` and `'1'` (canonical form) | ✅ all normalized |
| No bare `describe(` at top level in integration files | ✅ |
| Removed non-canonical skip patterns (`shouldSkip`, `describeOrSkip`) | ✅ rls-mtl.integration.test.ts |

---

## Phase B Assessment

Phase B covers functional correctness of RLS context injection calls within each integration file.

### `rls-context.integration.test.ts` (737 lines)
- **set_rls_context_internal**: 13 call-sites — primary ops-lane test surface per ADR-024
- **set_rls_context_from_staff**: 4 call-sites — tests production path via JWT auth.uid()
- **createClient**: 5 instances
- **Phase B concern**: `skipIfNoEnv()` function defined but not wired to gate — still present as dead guard after Phase A gate addition. Phase B should remove it or convert to env-var assertion in `beforeAll`.
- **ADR coverage**: ADR-015, ADR-024 context injection + hybrid policy fallback + Company ID derivation (ADR-043)

### `rls-financial.integration.test.ts` (843 lines)
- **set_rls_context_internal**: 2 call-sites
- **set_rls_context_from_staff**: 1 mention (comment/helper)
- **createClient**: 4 instances (service + 2 auth clients for cross-casino isolation)
- **Phase B concern**: Phase A gate only — no functional issues observed

### `rls-jwt-claims.integration.test.ts` (1,038 lines)
- **set_rls_context_internal**: 0 — tests JWT sync path, not context injection
- **set_rls_context_from_staff**: 0
- **createClient**: 3 instances
- **skipIfNoEnv**: used on ~18 individual `it()` guards — fine-grained env check, independent of gate
- **Phase B concern**: `skipIfNoEnv()` pattern is redundant with the new top-level `describe.skip` gate. Phase B should evaluate whether per-test env guards can be removed.

### `rls-mtl.integration.test.ts` (1,179 lines)
- **set_rls_context_internal**: 2 call-sites in helper function
- **createClient**: 7 instances (service, pitBoss, cashier, admin, dealer, crossCasino)
- **Phase B concern**: `supabaseUrl` and `supabaseServiceKey` were previously used in the old `shouldSkip` guard. Both variables are still referenced throughout the `beforeAll` block — no orphan variables introduced by Phase A.

### `rls-policy-enforcement.integration.test.ts` (818 lines)
- **set_rls_context_internal**: 2 call-sites in helper function
- **createClient**: 4 instances
- **Phase B concern**: None identified

### `rls-pooling-safety.integration.test.ts` (2,352 lines) — largest file
- **set_rls_context_internal**: 4 call-sites
- **set_rls_context_from_staff**: 1 mention (comment/helper)
- **createClient**: 26 instances — expected given pooling isolation test matrix
- **Phase B concern**: High client churn; Phase B should verify connection teardown in `afterAll` covers all 26 client instances to prevent resource leaks under test.

---

## Known Issues

| ID | Severity | File | Issue |
|----|----------|------|-------|
| KI-001 | Low | `rls-context.integration.test.ts` | `skipIfNoEnv()` helper defined but no longer needed at top-level — redundant with gate. Remove in Phase B. |
| KI-002 | Low | `rls-jwt-claims.integration.test.ts` | Per-test `skipIfNoEnv()` guards (×18) redundant with new describe.skip gate. Evaluate removal in Phase B. |
| KI-003 | Medium | `rls-pooling-safety.integration.test.ts` | 26 `createClient` instances — verify all have corresponding `afterAll` teardown to prevent connection leaks. |
| KI-004 | Info | `rls-mtl.integration.test.ts` | Old gate variables (`shouldSkip`, `describeOrSkip`) removed; `supabaseUrl`/`supabaseServiceKey` module-level consts retained (still used in test body). |

---

## Phase B Checklist

- [ ] Remove `skipIfNoEnv` helper from `rls-context.integration.test.ts`
- [ ] Evaluate removing per-test `skipIfNoEnv()` guards in `rls-jwt-claims.integration.test.ts`
- [ ] Audit `rls-pooling-safety.integration.test.ts` for connection teardown completeness
- [ ] Confirm `set_rls_context_internal` calls match current RPC signature (ADR-024 compliance)
- [ ] Verify `set_rls_context_from_staff` call-sites in `rls-context` and `rls-pooling-safety` reflect ADR-030 TOCTOU elimination
