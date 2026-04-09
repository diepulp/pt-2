# Mode C Migration — Canonical File List

**Date:** 2026-04-09
**Satisfies:** FIB-H Required Outcome #8
**Method:** Per-file triage via `beforeAll`/test body read, not grep heuristics

---

## Phase B Targets — Auth Rewrite Required

### SERVICE_ROLE_BIZ (service-role used for business-logic calls)

| # | File | Context | Complexity | Notes |
|---|------|---------|------------|-------|
| 1 | `services/casino/__tests__/casino.integration.test.ts` | Casino | MED | `supabase.rpc('compute_gaming_day')` via service-role |
| 2 | `services/visit/__tests__/visit-continuation.integration.test.ts` | Visit | HIGH | 1200+ lines; tests `rpc_start_rating_slip`, `rpc_close_rating_slip`, `rpc_get_player_recent_sessions`, `rpc_get_player_last_session_context` — all via service-role. **Transitive coverage target for the two uncovered child RPCs.** |
| 3 | `services/visit/__tests__/gaming-day-boundary.int.test.ts` | Visit | HIGH | `rpc_start_or_resume_visit`, `.from('visit').insert()` via service-role; auth user created but not used for biz calls |
| 4 | `services/loyalty/__tests__/loyalty-accrual-lifecycle.integration.test.ts` | Loyalty | HIGH | 879 lines; Mode C auth user created but all biz logic simulated via `setupClient.from('loyalty_ledger').insert()` — service-role for business writes |
| 5 | `services/loyalty/__tests__/promo-outbox-contract.int.test.ts` | Loyalty | LOW | `setupClient.from('loyalty_outbox').insert()` for business INSERT tests; auth user "for ADR-024 consistency" but unused for biz |
| 6 | `services/loyalty/promo/__tests__/promo-inventory.int.test.ts` | Loyalty | LOW | `service = createPromoService(supabase)` where supabase is service-role |
| 7 | `services/loyalty/reward/__tests__/reward-catalog.int.test.ts` | Loyalty | MED | `service = createRewardService(supabase)` where supabase is service-role |
| 8 | `services/player-timeline/__tests__/timeline.integration.test.ts` | PlayerTimeline | LOW | `supabase.rpc('rpc_get_player_timeline')` via service-role |
| 9 | `lib/supabase/__tests__/pit-boss-financial-txn.test.ts` | lib/supabase | HIGH | `rpc('rpc_create_financial_txn')` via service-role; RPC calls `set_rls_context_from_staff` internally but picks up service-role identity, not real staff JWT |

**Subtotal: 9 files (3 HIGH, 3 MED, 3 LOW)**

### LEGACY_CONTEXT (uses `set_rls_context_internal` or `injectRLSContext` with explicit params)

| # | File | Context | Complexity | Notes |
|---|------|---------|------------|-------|
| 10 | `services/security/__tests__/rls-context.integration.test.ts` | Security | HIGH | Tests `set_rls_context_internal` RPC directly. Some tests are **Category A (keep)** — they test the ops-lane RPC itself. Category B calls that inject context before business queries need Mode C. Requires per-test triage. |
| 11 | `__tests__/integration/player-identity.test.ts` | root | MED | Creates service-role clients then calls `injectRLSContext(pitBossClient, {actorId, casinoId, staffRole})` — spoofable param injection |
| 12 | `__tests__/rls/player-identity.test.ts` | root | HIGH | 5 service-role clients with `injectRLSContext()` explicit params; tests cross-casino RLS isolation |

**Subtotal: 3 files (2 HIGH, 1 MED)**

### MIXED (partially Mode C, partially service-role/skipAuth for business logic)

| # | File | Context | Complexity | Notes |
|---|------|---------|------------|-------|
| 13 | `lib/supabase/__tests__/rls-context.integration.test.ts` | lib/supabase | MED | Category B tests already use Mode C `authedClient1/2`; Category A tests use `setupClient` to test `set_rls_context_internal` directly — retain Category A, migrate remaining service-role business queries |
| 14 | `lib/server-actions/middleware/__tests__/audit-log.int.test.ts` | lib/server-actions | MED | Has `skipAuth:true` tests + "Authenticated Audit Log" section using `getTestAuthenticatedClient()`. Remaining skipAuth tests may need authenticated variants. |
| 15 | `lib/server-actions/middleware/__tests__/middleware-chain.int.test.ts` | lib/server-actions | MED | Has `skipAuth:true` tests + "Authenticated Chain Execution" section using `getTestAuthenticatedClient()`. Same pattern as audit-log. |

**Subtotal: 3 files (0 HIGH, 3 MED)**

### ASSESS BEFORE REWRITING (service-role may be intentionally correct)

| # | File | Context | Complexity | Reason to assess |
|---|------|---------|------------|-----------------|
| 16 | `lib/supabase/__tests__/rls-jwt-claims.integration.test.ts` | lib/supabase | HIGH | Tests admin-level JWT sync operations (`syncUserRLSClaims`, `clearUserRLSClaims`). These are admin tooling functions that may legitimately require service-role. Assess whether business-logic assertions exist alongside admin ops. |
| 17 | `__tests__/constraints/player-identity.test.ts` | root | MED | Tests pure DB constraints (unique, FK, CHECK). RLS bypass via service-role is intentional for constraint testing. May not need Mode C — assess whether any constraint test should also verify constraint behavior under RLS. |

**Subtotal: 2 files (1 HIGH, 1 MED)**

---

## Phase B Total

| Category | Files | HIGH | MED | LOW |
|----------|-------|------|-----|-----|
| SERVICE_ROLE_BIZ | 9 | 3 | 3 | 3 |
| LEGACY_CONTEXT | 3 | 2 | 1 | 0 |
| MIXED | 3 | 0 | 3 | 0 |
| ASSESS | 2 | 1 | 1 | 0 |
| **Total** | **17** | **6** | **8** | **3** |

---

## Already Mode C — No Phase B Needed

| # | File | Context | Evidence |
|---|------|---------|----------|
| 18 | `services/rating-slip/__tests__/policy-snapshot.integration.test.ts` | RatingSlip | anon client with Bearer token for business calls |
| 19 | `services/rating-slip/__tests__/rating-slip-continuity.integration.test.ts` | RatingSlip | ADR-024 Mode C; commit `b81aae14` rewrite |
| 20 | `services/rating-slip/__tests__/rating-slip-move-pooling.integration.test.ts` | RatingSlip | `ensureStaffContext()` returns authed service |
| 21 | `services/rating-slip/__tests__/rating-slip.integration.test.ts` | RatingSlip | ADR-024 Mode C; commit `b81aae14` rewrite |
| 22 | `services/table-context/__tests__/rpc-activate-table-session.int.test.ts` | TableContext | pitBossClient/dealerClient via signInWithPassword |
| 23 | `services/table-context/__tests__/rpc-close-table-session-cancel.int.test.ts` | TableContext | pitBossClient via signInWithPassword |
| 24 | `services/table-context/__tests__/rpc-open-table-session.int.test.ts` | TableContext | pitBossClient via signInWithPassword |
| 25 | `services/table-context/__tests__/session-close-lifecycle.int.test.ts` | TableContext | pitBossClient via signInWithPassword |
| 26 | `services/table-context/__tests__/table-opening-attestation-rls.int.test.ts` | TableContext | casinoAClient/casinoBClient cross-casino isolation |
| 27 | `services/player/__tests__/exclusion-enforcement.int.test.ts` | Player | authClient via signInWithPassword |
| 28 | `services/loyalty/__tests__/points-accrual-calculation.integration.test.ts` | Loyalty | anon client with Bearer JWT |
| 29 | `lib/supabase/__tests__/rls-financial.integration.test.ts` | lib/supabase | authClient1/2 with Bearer JWT |
| 30 | `lib/supabase/__tests__/rls-mtl.integration.test.ts` | lib/supabase | 5 Mode C clients per role |
| 31 | `lib/supabase/__tests__/rls-policy-enforcement.integration.test.ts` | lib/supabase | authClient1/2 with Bearer JWT |
| 32 | `lib/supabase/__tests__/rls-pooling-safety.integration.test.ts` | lib/supabase | 3 Mode C clients, concurrent tests |
| 33 | `__tests__/services/loyalty/promo-instruments.int.test.ts` | root | pitBossClient/otherCasinoClient via signInWithPassword |
| 34 | `__tests__/services/table-context/finance-telemetry-bridge.int.test.ts` | root | authedClient with Bearer JWT |
| 35 | `__tests__/services/table-context/table-session.int.test.ts` | root | pitBossClient/adminClient via signInWithPassword |
| 36 | `__tests__/services/table-context/shift-metrics.int.test.ts` | root | authedClient with Bearer JWT |

**Total: 19 files already Mode C compliant**

---

## Not Integration Tests — Reclassification Candidates

| # | File | Current naming | Actual classification | Reason |
|---|------|---------------|----------------------|--------|
| 37 | `services/rating-slip/__tests__/rating-slip-rpc-contract.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Compile-time type assertions + Zod schema tests; no DB |
| 38 | `services/table-context/__tests__/table-context.integration.test.ts` | `.integration.test.ts` | STUB | All `it.todo()` stubs; no implementation |
| 39 | `services/loyalty/__tests__/issuance-idempotency.int.test.ts` | `.int.test.ts` | MOCKED | "fully mocked unit test, does not hit the database" |
| 40 | `services/loyalty/__tests__/issue-comp.int.test.ts` | `.int.test.ts` | MOCKED | "fully mocked unit test, does not hit the database" |
| 41 | `services/loyalty/__tests__/issue-entitlement.int.test.ts` | `.int.test.ts` | MOCKED | "fully mocked unit test, does not hit the database" |
| 42 | `services/loyalty/__tests__/valuation-policy-roundtrip.int.test.ts` | `.int.test.ts` | MOCKED | "fully mocked unit test, does not hit the database" |
| 43 | `services/player/__tests__/exclusion-rpc.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Compile-time assertions + DomainError tests |
| 44 | `services/player/__tests__/player-rpc-contract.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Compile-time assertions + Zod tests |
| 45 | `services/player-import/__tests__/execute-guard.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Type assertions + `expect(true).toBe(true)` stubs |
| 46 | `services/player-import/__tests__/execute-rpc.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Compile-time type assertions only |
| 47 | `services/player-import/__tests__/rls-policies.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Type assertions + stubs |
| 48 | `services/player-import/__tests__/upload-route.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Type assertions + stubs |
| 49 | `services/company/__tests__/crud.int.test.ts` | `.int.test.ts` | MOCKED | Fully mocked; `mockSupabase = { rpc: mockRpc }` |
| 50 | `services/company/__tests__/rpc-contract.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Compile-time assertions + TODO stubs |
| 51 | `services/casino/__tests__/gaming-day-boundary.int.test.ts` | `.int.test.ts` | MOCKED | `createMockSupabase(rpcImpl)` — no real DB |
| 52 | `services/casino/__tests__/rpc-accept-staff-invite-abuse.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Compile-time assertions + stubs |
| 53 | `services/casino/__tests__/rpc-bootstrap-casino-abuse.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Compile-time assertions + stubs |
| 54 | `services/casino/__tests__/rpc-create-staff.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Compile-time assertions only; 112 lines |
| 55 | `services/casino/__tests__/setup-wizard-rpc.int.test.ts` | `.int.test.ts` | TYPE_ONLY | Type assertions + Zod + algorithm unit tests |
| 56 | `lib/server-actions/middleware/__tests__/wrapped-route.int.test.ts` | `.int.test.ts` | MOCK_ONLY | "does not hit the database"; Reclassified per Tier 3 plan |
| 57 | `__tests__/player-360-navigation.int.test.ts` | `.int.test.ts` | MOCK_ONLY | "pure URL construction and navigation logic" |
| 58 | `workers/csv-ingestion/__tests__/ingest.int.test.ts` | `.int.test.ts` | MOCKED | `jest.mock('../src/repo')` — all DB mocked |
| 59 | `workers/csv-ingestion/__tests__/crash-recovery.int.test.ts` | `.int.test.ts` | MOCKED | `createMockPool()` — no real DB |
| 60 | `workers/csv-ingestion/__tests__/cross-casino.int.test.ts` | `.int.test.ts` | MOCKED | `jest.mock('../src/repo')` — all DB mocked |
| 61 | `workers/csv-ingestion/__tests__/concurrent-claim.int.test.ts` | `.int.test.ts` | MOCKED | `createMockPool()` — no real DB |

**Total: 25 files are not real integration tests despite `.int.test.ts` naming**

---

## Summary

| Category | Files |
|----------|-------|
| **Phase B targets** | 17 (9 service-role-biz + 3 legacy + 3 mixed + 2 assess) |
| **Already Mode C** | 19 |
| **Not real integration tests** | 25 |
| **Grand total triaged** | 61 |

### Phase B by context (execution order recommendation)

| Priority | Context | Files | Highest complexity | Rationale |
|----------|---------|-------|--------------------|-----------|
| 1 | Visit | #2, #3 | HIGH | Contains parent RPCs for the two uncovered child RPCs (transitive coverage) |
| 2 | Loyalty | #4, #5, #6, #7 | HIGH | Highest file count; valuation bug class exposure |
| 3 | Casino | #1 | MED | Single file, moderate scope |
| 4 | Security | #10 | HIGH | Requires per-test Category A/B triage |
| 5 | lib/supabase | #9, #13, #16 | HIGH | RLS infrastructure; #16 needs assess-first |
| 6 | lib/server-actions | #14, #15 | MED | Already partially remediated via existing helper |
| 7 | root __tests__ | #11, #12, #17 | HIGH | LEGACY_CONTEXT pattern (injectRLSContext) |
| 8 | PlayerTimeline | #8 | LOW | Single file, minimal scope |
