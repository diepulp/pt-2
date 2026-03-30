# Playwright E2E Workflow Gap Analysis

**Date:** 2026-03-27
**Context:** Player exclusion P0 bug (ISS-EXCL-001) shipped because no E2E test exercises the real middleware-to-DB write path. Unit tests pass in isolation; the bug lives at the seam.
**Scope:** All user-facing workflows mapped against existing 17 Playwright specs.

---

## Current E2E Coverage Map

### Covered (17 specs, ~139 assertions)

| Spec | Workflow | DB Writes | Bounded Context |
|------|----------|-----------|-----------------|
| `visit-continuation` | Resume previous visit, session grouping | Yes | Visit |
| `move-player` | Relocate player between tables, perf targets | Yes | RatingSlip |
| `rating-slip-modal` | Open/edit/close slip, buy-in, chips-taken, move | Yes | RatingSlip, Finance |
| `loyalty-accrual-lifecycle` | Accrual on close, idempotency, ghost visits | Yes | Loyalty |
| `loyalty-accrual` (API) | Simple accrual via seed data | Yes | Loyalty |
| `mtl-threshold-notifications` | $2.5k watchlist, $10k CTR, banner, auto-MTL | Yes | MTL |
| `measurement-reports` | Widget rendering, freshness badges | No | Performance |
| `player-360-panels` | Summary band, filters, tiles, responsive, a11y | No | Player |
| `player-360-navigation` | Routes, 308 redirects, history, open-redirect defense | No | Player |
| `shift-dashboard-v3-layout` | Auth, metrics, error boundaries, CLS, sticky header | No | Performance |
| `setup-wizard` | 5-step wizard, skip, re-entry, mid-flow resume | Yes | Casino |
| `csv-player-import` | Upload, map, preview, stage, execute, alias detection | Yes | Player |
| `csv-server-import` | Server upload, worker polling, progress, failure | Yes | Player |
| `cashier-workflow` | Fill/credit/drop confirmations | **fixme** (7 placeholders) | Finance |
| `admin-settings` | Thresholds toggle, numeric edit, gaming day time | Yes | Casino |
| `admin-alerts` | Role-gated access (pit_boss vs dealer), routing | No | Performance |
| `loyalty-admin-catalog` | Create reward, set pricing, activate, list verify | Yes | Loyalty |

---

## Uncovered Workflows — Priority Ordered

### Tier 1: Critical Write Paths (P0 — must test real DB writes through full stack)

These workflows involve **write operations through the middleware chain** where RLS, session-var injection, and idempotency interact. The exclusion bug proves these seams are where failures hide.

#### GAP-E2E-001: Player Exclusion Lifecycle
**Priority:** P0
**Why:** Active P0 bug (ISS-EXCL-001). Session-var-only RLS on a critical table.
**Route:** `/players/[playerId]` > Compliance tab > Exclusion tile
**Scenarios:**

| # | Test | Validates |
|---|------|-----------|
| 1 | Admin creates self-exclusion (type + enforcement + reason) | POST exclusion API, RLS write path, tile refresh |
| 2 | Tile shows active exclusion with enforcement badge | Active exclusions query, UI rendering |
| 3 | Header badge updates to "Blocked" (red) | Status query, badge component |
| 4 | Admin lifts exclusion with reason | POST lift API, RLS update path, tile/badge refresh |
| 5 | Pit boss can create but not lift | Role-gating: Add visible, Lift hidden |
| 6 | Dealer sees read-only tile (no Add/Lift) | Role-gating: both buttons hidden |
| 7 | Hard-block prevents visit start | `rpc_start_or_resume_visit` raises exception |
| 8 | Soft-alert shows warning on visit start | NewSlipModal warning toast |
| 9 | Create with explicit dates (effective_from, effective_until) | Date format handling end-to-end |
| 10 | Duplicate create with same idempotency key | Idempotency enforcement |

**Fixture needed:** `e2e/fixtures/exclusion-fixtures.ts` — creates player + casino + staff (admin + pit_boss + dealer roles)

---

#### GAP-E2E-002: Table Session Lifecycle (Open / Close / Rundown)
**Priority:** P0
**Why:** Core operational workflow. Table close triggers rundown report. No E2E coverage.
**Route:** `/pit` > Table card > Close Table / Table Settings
**Scenarios:**

| # | Test | Validates |
|---|------|-----------|
| 1 | Activate table from pit floor | POST activate API, table status updates |
| 2 | Close table with active players (blocked) | Error: must close active slips first |
| 3 | Close empty table | POST close API, table status updates |
| 4 | Table session creates rundown report | POST rundown API, report generation |
| 5 | Finalize rundown report | POST finalize, immutable after finalization |

---

#### GAP-E2E-003: Chip Custody (Fill / Credit / Drop)
**Priority:** P0
**Why:** Financial audit trail. Cashier confirmation is a regulatory workflow.
**Route:** `/cashier/operational-confirmations`, `/cashier/drop-acknowledgements`
**Scenarios:**

| # | Test | Validates |
|---|------|-----------|
| 1 | Log chip fill from pit floor | POST fill API, pending queue entry |
| 2 | Cashier confirms fill with matching amount | POST confirm, removed from pending |
| 3 | Cashier confirms fill with discrepancy note | Discrepancy field required |
| 4 | Log chip credit | POST credit API |
| 5 | Cashier confirms credit | POST confirm credit |
| 6 | Log drop event | POST drop API |
| 7 | Cashier acknowledges drop | POST acknowledge, stamps cage_received_at |
| 8 | Re-confirmation is idempotent | Same fill, same result |

**Note:** `cashier-workflow.spec.ts` exists with 7 `test.fixme()` placeholders — these need implementation, not new spec creation.

---

#### GAP-E2E-004: Player Enrollment
**Priority:** P1
**Why:** Entry point for all player-scoped workflows. Enrollment creates player_casino junction.
**Route:** `/players` > Search > "Enroll Player" / `/pit` > "Enroll Player"
**Scenarios:**

| # | Test | Validates |
|---|------|-----------|
| 1 | Enroll new player (name, DOB, contact) | POST player API, player_casino link created |
| 2 | Search for enrolled player by name | GET search, result rendered |
| 3 | Navigate to Player 360 from search result | Route navigation, data loading |
| 4 | Enroll duplicate (same name + DOB) returns existing | Dedup logic, no duplicate records |
| 5 | Cross-casino enrollment (company lookup) | Company-scoped player recognition |

---

#### GAP-E2E-005: Visit Start (Check-in) and End (Check-out)
**Priority:** P1
**Why:** Partially covered by `visit-continuation` but no test covers the initial visit start or check-out.
**Route:** `/pit` > Seat > "New Rating Slip" (starts visit implicitly)
**Scenarios:**

| # | Test | Validates |
|---|------|-----------|
| 1 | Seat player at table → visit auto-created | rpc_start_or_resume_visit |
| 2 | Check-out player → visit closed, all slips closed | POST visit close cascade |
| 3 | Visit with hard-block exclusion → blocked | Exclusion enforcement at visit start |
| 4 | Visit with soft-alert exclusion → warning + allowed | Warning toast, visit proceeds |

---

#### GAP-E2E-006: Promo Programs & Coupon Lifecycle
**Priority:** P1
**Why:** Financial instrument with issuance/void/replace lifecycle. No E2E coverage.
**Route:** `/admin/loyalty/promo-programs`, `/admin/loyalty/promo-programs/[id]`
**Scenarios:**

| # | Test | Validates |
|---|------|-----------|
| 1 | Create promo program (name, dates, rules) | POST program API |
| 2 | Generate coupons for program | POST coupon generation |
| 3 | Issue coupon to player | POST issue, coupon inventory decrements |
| 4 | Void coupon | POST void, coupon marked voided |
| 5 | Replace voided coupon | POST replace, new coupon issued |
| 6 | View coupon inventory | GET inventory, correct counts |

---

### Tier 2: Read-Heavy UI Paths (P1 — validate rendering and navigation)

#### GAP-E2E-007: Compliance Dashboard (MTL Entry List + Gaming Day Summary)
**Priority:** P1
**Why:** `/compliance` route has no dedicated spec. MTL threshold spec tests toasts, not the dashboard itself.
**Route:** `/compliance`
**Scenarios:**

| # | Test | Validates |
|---|------|-----------|
| 1 | Dashboard loads with gaming day summary | GET gaming-day-summary renders |
| 2 | MTL entry list shows today's entries | GET entries list, row rendering |
| 3 | Manual MTL entry form submission | POST entry, list refresh |
| 4 | Filter by date range | Query param filtering |

---

#### GAP-E2E-008: Staff Management
**Priority:** P1
**Why:** Admin-only workflow with role-gating. No E2E coverage.
**Route:** `/settings/staff`
**Scenarios:**

| # | Test | Validates |
|---|------|-----------|
| 1 | View staff roster | GET staff list, table rendering |
| 2 | Invite new staff member | POST invite, email sent |
| 3 | Change staff role (pit_boss → admin) | PATCH role, RLS implications |
| 4 | Deactivate staff member | PATCH status=inactive |
| 5 | Non-admin cannot access staff management | Role-gating redirect |

---

#### GAP-E2E-009: Pit Floor Visual Layout
**Priority:** P2
**Why:** Core operational UI but primarily rendering. Write tests covered by table lifecycle (GAP-002).
**Route:** `/pit`
**Scenarios:**

| # | Test | Validates |
|---|------|-----------|
| 1 | Pit selector loads with correct tables | Pit/table combobox renders |
| 2 | Table card shows occupied seats | Seat data-occupied attribute |
| 3 | Click occupied seat opens rating slip modal | Modal trigger |
| 4 | Click empty seat opens enroll/seat flow | Seat assignment flow |
| 5 | Dealer assignment button opens dialog | Dealer management |

---

#### GAP-E2E-010: Loyalty Redemption & Mid-Session Rewards
**Priority:** P2
**Why:** Accrual is tested; redemption is not. Mid-session reward is untested.
**Route:** `/players/[playerId]` > "Issue Reward" button
**Scenarios:**

| # | Test | Validates |
|---|------|-----------|
| 1 | Issue comp reward to player | POST issue, ledger entry, balance decrements |
| 2 | Redeem points for reward | POST redeem, balance check |
| 3 | Insufficient balance shows error | Validation enforcement |
| 4 | Mid-session reward calculation | POST mid-session-reward, correct theo |

---

#### GAP-E2E-011: Floor Layout Design & Activation
**Priority:** P2
**Why:** Setup-time workflow, not daily operations. Lower urgency.
**Route:** `/setup` (wizard step 4), admin floor layout
**Scenarios:**

| # | Test | Validates |
|---|------|-----------|
| 1 | Create floor layout with pit sections | POST layout API |
| 2 | Position tables in layout | Layout version creation |
| 3 | Activate layout | POST activation, current layout updates |

---

### Tier 3: Edge Cases & Regression Guards (P2)

#### GAP-E2E-012: Authentication Edge Cases
**Priority:** P2
**Scenarios:**
- Session expiry during form submission → redirect to login, return after re-auth
- Multi-tab session consistency
- Token refresh during long form fill

#### GAP-E2E-013: Shift Checkpoint Workflow
**Priority:** P2
**Route:** `/shift-dashboard`
**Scenarios:**
- Create shift checkpoint → captures point-in-time metrics
- View checkpoint delta → compares two checkpoints
- Latest checkpoint API → returns most recent

#### GAP-E2E-014: Table Rundown Report Detail
**Priority:** P2
**Route:** Admin/reports
**Scenarios:**
- View rundown report with all aggregations
- Finalize report (immutable after)
- PDF/export generation (if applicable)

---

## Coverage Summary

| Tier | GAP ID | Workflow | Priority | Est. Effort | Spec File |
|------|--------|----------|----------|-------------|-----------|
| **1** | 001 | **Player Exclusion Lifecycle** | **P0** | 4-6h | `player-exclusion.spec.ts` |
| **1** | 002 | Table Session Lifecycle | P0 | 3-4h | `table-lifecycle.spec.ts` |
| **1** | 003 | Chip Custody (Fill/Credit/Drop) | P0 | 3-4h | `cashier-workflow.spec.ts` (existing fixme) |
| **1** | 004 | Player Enrollment | P1 | 2-3h | `player-enrollment.spec.ts` |
| **1** | 005 | Visit Start/End | P1 | 2-3h | `visit-lifecycle.spec.ts` |
| **1** | 006 | Promo Programs & Coupons | P1 | 3-4h | `promo-lifecycle.spec.ts` |
| **2** | 007 | Compliance Dashboard | P1 | 2-3h | `compliance-dashboard.spec.ts` |
| **2** | 008 | Staff Management | P1 | 2-3h | `staff-management.spec.ts` |
| **2** | 009 | Pit Floor Visual Layout | P2 | 2-3h | `pit-floor.spec.ts` |
| **2** | 010 | Loyalty Redemption | P2 | 2-3h | `loyalty-redemption.spec.ts` |
| **2** | 011 | Floor Layout Design | P2 | 2-3h | `floor-layout.spec.ts` |
| **3** | 012 | Auth Edge Cases | P2 | 2h | `auth-edge-cases.spec.ts` |
| **3** | 013 | Shift Checkpoints | P2 | 1-2h | `shift-checkpoints.spec.ts` |
| **3** | 014 | Rundown Reports | P2 | 1-2h | `table-rundown.spec.ts` |

**Total estimated effort:** ~30-42 hours for full gap closure.

---

## Structural Recommendations

### 1. Prioritize write-path tests over read-path tests

The exclusion bug proves: **any workflow that writes to the database through the middleware chain must have an E2E test that exercises the real Supabase instance.** Unit tests with mocked Supabase clients cannot catch RLS/SET LOCAL/session-var failures.

**Rule of thumb:** If a feature does `supabase.from(table).insert()` or `.update()` through `withServerAction`, it needs an E2E test.

### 2. Fixture pattern: service-role setup + anon-key test execution

The existing fixtures (e.g., `rating-slip-fixtures.ts`) demonstrate the correct pattern:
- **Setup:** Service-role client creates test data (bypasses RLS)
- **Test:** Authenticated anon-key client exercises the real middleware path
- **Teardown:** Service-role client cleans up

This pattern must be replicated for exclusion, table lifecycle, and chip custody tests.

### 3. Critical-path smoke suite for CI gate

Before wiring all 17+ specs to CI, define a **smoke subset** (~5 specs, <3 min) that covers the highest-risk write paths:

```
e2e/smoke/
├── auth-and-navigate.spec.ts       # Login → pit floor → player search
├── exclusion-create-lift.spec.ts   # Create + lift exclusion (the bug that triggered this)
├── rating-slip-close-accrue.spec.ts # Open slip → close → loyalty accrual
├── visit-start-end.spec.ts         # Start visit → check-out
├── mtl-threshold.spec.ts           # Buy-in → CTR threshold → banner
```

This smoke suite runs on every PR. Full suite runs nightly or on release branches.

### 4. CI infrastructure requirements

```yaml
# Required additions to .github/workflows/ci.yml
e2e:
  needs: [checks]
  timeout-minutes: 15
  services:
    supabase:  # Local Supabase for test isolation
  steps:
    - supabase start
    - supabase db reset (apply migrations + seed)
    - npx playwright install chromium
    - npx playwright test e2e/smoke/  # Smoke suite on PR
    # Full suite: npx playwright test  (nightly/release only)
```

### 5. Test-per-PRD mandate

Going forward, every PRD that ships UI + write operations must include an E2E spec in its Definition of Done. The exclusion PRD (PRD-052) had a comprehensive DoD but no E2E requirement — this is the governance gap.

**Proposed addition to PRD template:**
```markdown
## Definition of Done
...
- [ ] E2E spec covers primary write path (Playwright, real DB)
- [ ] E2E spec added to smoke suite if workflow is critical-path
```

---

## Relationship to Governance EXEC-SPECs

| Artifact | Status | Blocks |
|----------|--------|--------|
| **EXEC-051** (Jest split, branch protection, required CI) | Written, never executed | Everything |
| **EXEC-052** (Route-handler exemplar, context rollout) | Never written | E2E quality |
| **EXEC-053** (Playwright in CI, Supabase-in-CI) | Never written | CI E2E gate |
| **This report** | Gap analysis complete | Informs EXEC-053 scope |

This gap analysis provides the **test inventory** that EXEC-053 should execute against. The smoke suite (Recommendation #3) is the minimum viable CI E2E gate.
