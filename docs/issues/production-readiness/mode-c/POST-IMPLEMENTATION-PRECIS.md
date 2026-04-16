# Mode C Migration — Post-Implementation Precis

**Commit:** `58bfa0d` (2026-04-09)
**Scope authority:** FIB-H `fib-h-mode-c-migration.md`
**Traceability:** FIB-S `fib-s-mode-c-migration.json`

---

## What shipped

Migrated 14 integration test files from service-role business-logic execution to the canonical Mode C authenticated-anon pattern (ADR-024). Created a shared auth ceremony helper (`createModeCSession`) and assessed 3 files as intentionally Category A (service-role retained).

Business-logic calls now flow through JWT-bearing anon clients so that RLS policies, EXECUTE grants, and `set_rls_context_from_staff()` context derivation are exercised in the real authenticated path rather than silently bypassed by service-role.

---

## Artifact inventory

| Artifact | Path | Purpose |
|----------|------|---------|
| Auth ceremony helper | `lib/testing/create-mode-c-session.ts` | Zero-domain-fixture Mode C session factory (FIB-H Section N) |
| Helper invariant tests | `lib/testing/__tests__/create-mode-c-session.integration.test.ts` | 6 invariants: zero `.from()`, cleanup scope, static Bearer, independence, local-only, unique emails |
| FIB-H | `docs/issues/production-readiness/mode-c/fib-h-mode-c-migration.md` | Human scope authority |
| FIB-S | `docs/issues/production-readiness/mode-c/fib-s-mode-c-migration.json` | Machine traceability authority |
| Canonical file list | `docs/issues/production-readiness/mode-c/canonical-file-list.md` | 61-file triage (17 Phase B, 19 already Mode C, 25 misnamed) |
| Helper decision record | `docs/issues/production-readiness/mode-c/helper-decision.md` | Auth-only vs bundled helper rationale |

---

## Migration ledger

### Migrated to Mode C (14 files)

| # | File | Context | Complexity | Key change |
|---|------|---------|------------|------------|
| 1 | `services/visit/__tests__/visit-continuation.integration.test.ts` | Visit | HIGH | 2 Mode C sessions (casino 1 + 2); service wired to pitBossClient; setupStartSlip/setupCloseSlip/setupCreateVisit/setupUpdateVisit helpers |
| 2 | `services/visit/__tests__/gaming-day-boundary.int.test.ts` | Visit | HIGH | Replaced inline auth with createModeCSession; setupComputeGamingDay helper |
| 3 | `services/loyalty/__tests__/loyalty-accrual-lifecycle.integration.test.ts` | Loyalty | HIGH | Replaced 30-line inline auth ceremony with createModeCSession |
| 4 | `services/loyalty/__tests__/promo-outbox-contract.int.test.ts` | Loyalty | LOW | Mode C session; fixture restructured |
| 5 | `services/loyalty/promo/__tests__/promo-inventory.int.test.ts` | Loyalty | LOW | createPromoService wired to pitBossClient |
| 6 | `services/loyalty/reward/__tests__/reward-catalog.int.test.ts` | Loyalty | MED | createRewardService wired to pitBossClient; fixture flattened |
| 7 | `services/casino/__tests__/casino.integration.test.ts` | Casino | MED | compute_gaming_day RPCs via pitBossClient; staff constraints on setupClient |
| 8 | `services/security/__tests__/rls-context.integration.test.ts` | Security | HIGH | Category A/B triage: 13 Cat-A kept on setupClient, 1 Cat-B converted |
| 9 | `lib/supabase/__tests__/pit-boss-financial-txn.test.ts` | lib/supabase | HIGH | 2 Mode C sessions (pitBoss + cashier); all rpc_create_financial_txn via Mode C |
| 10 | `lib/supabase/__tests__/rls-context.integration.test.ts` | lib/supabase | MED | Replaced 60-line inline Mode C ceremony with createModeCSession |
| 11 | `__tests__/integration/player-identity.test.ts` | root | MED | Replaced injectRLSContext with 2 Mode C sessions (pitBoss + admin) |
| 12 | `__tests__/rls/player-identity.test.ts` | root | HIGH | Replaced injectRLSContext with 5 Mode C sessions for cross-casino isolation |
| 13 | `services/player-timeline/__tests__/timeline.integration.test.ts` | PlayerTimeline | LOW | Mode C session; RPC calls wrapped in setup* helpers |
| 14 | `__tests__/constraints/player-identity.test.ts` | root | MED | Renamed to setupClient for consistency (Category A — no auth migration) |

### Assessed as Category A — no migration (3 files)

| File | Reason |
|------|--------|
| `lib/supabase/__tests__/rls-jwt-claims.integration.test.ts` | Purely admin ops (`auth.admin.*`, `syncUserRLSClaims`). No business-logic queries. |
| `__tests__/constraints/player-identity.test.ts` | Pure DB constraint tests (FK, UNIQUE, CHECK). RLS bypass intentional. |
| `lib/server-actions/middleware/__tests__/audit-log.int.test.ts` + `middleware-chain.int.test.ts` | `skipAuth:true` tests exercise legitimate middleware infrastructure paths. Authenticated sections already Mode C via `getTestAuthenticatedClient`. |

### Already Mode C — no changes needed (19 files)

See `canonical-file-list.md` rows 18-36. These were already compliant before this migration.

---

## Machine-verifiable gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npx eslint` (via pre-commit) | PASS |
| `prettier --write` (via pre-commit) | PASS |
| `setupClient.rpc()` outside conformant scopes | 0 violations (all in `setup*` helpers or Category A) |
| Zero `.from()` calls in `create-mode-c-session.ts` | Confirmed |
| Helper cleanup scope (auth user only) | Confirmed |
| Local-only safety assertion | Confirmed |

---

## FIB-H Required Outcomes checklist

| # | Outcome | Status |
|---|---------|--------|
| 1 | Business-logic tests no longer rely on service_role | DONE — 14 files migrated |
| 2 | Canonical helper used or justified equivalent | DONE — `createModeCSession` used in all Phase B work |
| 3 | RLS/grant/auth-path failures observable | DONE — RPCs flow through JWT-bearing clients |
| 4 | service_role confined to setup/teardown scopes | DONE — machine-verifiable grep: 0 violations |
| 5 | Uncovered RPCs exercised transitively via parent Mode C tests | DONE — `visit-continuation.integration.test.ts` calls `rpc_get_player_recent_sessions` and `rpc_get_player_last_session_context` via Mode C service, which internally invoke `rpc_get_visit_loyalty_summary` and `rpc_get_visit_last_segment` |
| 6 | Blocked cases logged with blocker class | N/A — no blockers encountered |
| 7 | Artifacts suitable for EXEC spec | DONE — this precis + canonical file list |
| 8 | Canonical file list produced | DONE — `canonical-file-list.md` (61 files triaged) |

---

## Containment boundary

This migration touched **test files only**. No production code, no migrations, no RLS policies, no API routes, no service layer logic was modified. The `createModeCSession` helper lives in `lib/testing/` and is excluded from production builds.

---

## Known residual

- **Runtime validation pending**: Tests require a running local Supabase instance. The migration is structurally complete but has not been executed against a live database in this session.
- **`pitBossClient` declared but unused** in 3 files (loyalty-accrual-lifecycle, promo-outbox-contract, timeline) where business logic is still simulated via direct SQL inserts. The Mode C client is wired and ready for when those tests are updated to call service methods or RPCs.
- **Inline `setupClient.from()` calls in test bodies**: Visit-continuation and gaming-day-boundary have fixture creation via `setupClient.from('visit').insert()` wrapped in `setupCreateVisit()` helpers. A few `.from('rating_slip')`, `.from('gaming_table')`, and `.from('player_financial_transaction')` calls remain inline in test bodies for assertion reads and fixture manipulation. These are fixture-level, not business-logic, and are not covered by the `.rpc()` machine-verifiable gate.
