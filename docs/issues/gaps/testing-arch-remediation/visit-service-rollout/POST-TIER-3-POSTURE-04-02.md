

---

## System Testing Infrastructure Posture (Post-Tier 3)

### Test Execution Health

| Metric | Count |
|--------|-------|
| Total test files | 627 |
| Node unit suites | 214 (210 pass, 4 skip) |
| Node unit tests | 3,039 (2,895 pass, 73 skip, 71 todo) |
| Integration test files | 392 (gated, require Supabase) |
| E2E specs (Playwright) | 21 |
| Unit pass rate | **95.3%** tests, **98.1%** suites |

### Governance Plan Progress (TESTING-GOVERNANCE-REMEDIATION.md)

| Phase | Status | Key Evidence |
|-------|--------|-------------|
| **1 — Restore Local Truth** | **COMPLETE** | Jest configs split (node/jsdom/integration), test scripts truthful, route handler exemplar exists, Casino bounded-context exemplar green |
| **2 — Expand by Bounded Context** | **~70%** | 7 of 17 contexts rolled out (Casino, Player, Visit, RatingSlip, Loyalty, MTL, TableContext). Hook tests triaged (0 skipped). Cypress tests deleted (stale artifacts remain). |
| **3 — CI Visibility** | **~65%** | Unit tests in CI (advisory, `continue-on-error: true`). Playwright wired (advisory, 2 specs). **No integration test CI job.** |
| **4 — Promote Enforcement** | **0%** | Main branch unprotected. All test CI jobs advisory. No merge-blocking gates. |

### Remediation Plan Progress (REMAINING-SERVICES-REMEDIATION-PLAN.md)

| Tier | Scope | Phase A | Phase B | Status |
|------|-------|---------|---------|--------|
| **1** (Slice 3) | RatingSlip, Loyalty, MTL, TableContext | Done | Done | **COMPLETE** |
| **2** (Slice 4) | 10 remaining service contexts | 0 of 10 executed | 0 started | **NOT STARTED** |
| **3** (Slice 5) | lib/supabase, lib/server-actions, root __tests__ | Done | Done | **COMPLETE** |

### Bounded Context Rollout Detail

| Context | Directives | Gates | Exemplar | Slice Script | Posture Doc | Mode C |
|---------|-----------|-------|----------|-------------|-------------|--------|
| Casino | 40% | Partial | Yes | Yes | Yes (Slice 1) | Done |
| Player | Yes | Yes | Yes | Yes | — | Done |
| Visit | 43% | Partial | Yes | Yes | — | Done |
| RatingSlip | Yes | Partial | Yes | Yes | — | Done |
| Loyalty | Yes | Yes | Yes | Yes | Yes | Done |
| MTL | Yes | — | Yes | Yes | Yes | N/A |
| TableContext | Yes | Yes | Yes | Yes | Yes | Done |
| **PlayerImport** | 11% | No | No | No | No | Not started |
| **Security** | 0% | No | No | No | No | Not started |
| **PlayerFinancial** | 25% | N/A | No | No | No | N/A |
| **ShiftIntelligence** | 57% | N/A | No | No | No | N/A |
| **Measurement** | 33% | N/A | No | No | No | N/A |
| **PlayerTimeline** | 0% | Maybe | No | No | No | Not started |
| **Player360Dashboard** | 0% | N/A | No | No | No | N/A |
| FloorLayout | 100% | N/A | No | No | No | N/A |
| RatingSlipModal | 100% | N/A | No | No | No | N/A |
| Recognition | 100% | N/A | No | No | No | N/A |

### Infrastructure Surfaces

| Surface | Directives | Gates | Posture Doc | Mode C | Slice Script |
|---------|-----------|-------|-------------|--------|-------------|
| lib/supabase (10 files) | 10/10 | 6/6 | Yes | Done | Yes |
| lib/server-actions (10 files) | 10/10 | 3/3 | Yes | Done | Yes |
| root __tests__ (15 files) | 15/15 | 8/8 | Yes | Done | Yes |
| workers/csv-ingestion | 9/9 | Already compliant | — | N/A | N/A |

### Critical Gaps

1. **Tier 2 unexecuted** — 10 service contexts, highest risk: PlayerImport (active dev), Security (auth pipeline)
2. **23 integration tests ungated** — can silently run or skip depending on environment
3. **No integration test CI job** — RLS/DB contract layer invisible in CI
4. **Branch protection absent** — main unprotected, no merge-blocking gates
5. **Pre-existing failures unverified at runtime** — today's fixture fixes (65 failures) need Supabase to confirm

### Shortest Path to Production Trust

| Action | Effort | Closes |
|--------|--------|--------|
| Wire integration tests to CI (advisory) | 6-8h | Gap #3 |
| Enable branch protection with `checks` + `test` required | 1h | Gap #4 |
| Tier 2 for PlayerImport + Security | 4-6h | Highest-risk Gap #1 contexts |