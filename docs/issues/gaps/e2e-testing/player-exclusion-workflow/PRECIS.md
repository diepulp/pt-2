# Player Exclusion E2E Exemplar — Delivery Precis

> **Date:** 2026-03-30
> **Scope:** E2E test harness, regression coverage, CI advisory, harness stabilization rules
> **Standard:** QA-006 E2E Testing Standard
> **Gap:** GAP-EXCL-E2E-001

---

## What Was Delivered

A credible E2E test harness for the player exclusion workflow, serving as the reference implementation for all future Playwright E2E suites in PT-2. The work spans infrastructure fixes, test authoring, a date-format regression chain, CI wiring, and the governing standard itself.

### Test Coverage Matrix

| Test | File | Mode | Status |
|------|------|------|--------|
| Empty state before exclusions | `e2e/workflows/player-exclusion.spec.ts` | B (browser) | Passing |
| Create hard_block via dialog | same | B | Passing |
| Lift exclusion via admin dialog | same | B | Passing |
| Date-field regression (YYYY-MM-DD) | same | B | Passing |
| pit_boss sees Add, not Lift | same | B | Passing |
| dealer sees neither Add nor Lift | same | B | Passing |
| hard_block auto-closes visit + slip | `e2e/api/player-exclusion-enforcement.spec.ts` | C (authenticated) | Passing |
| Audit trail for auto-close | same | C | Passing |
| YYYY-MM-DD passthrough (unit) | `components/.../create-exclusion-dialog.test.tsx` | — | Passing |
| ISO datetime rejected (unit) | same | — | Passing |
| Route accepts YYYY-MM-DD (unit) | `app/.../exclusions/__tests__/route.test.ts` | — | Passing |
| Route rejects ISO datetime (unit) | same | — | Passing |
| Hard block prevents seating (new-slip) | `e2e/workflows/player-exclusion.spec.ts` | B | **Scaffolded** (`test.skip`) |

**Final count:** 7 E2E tests passing + 5 unit regression tests passing. 1 test scaffolded, blocked on pit dashboard fixture complexity.

### Fixture Architecture

`e2e/fixtures/exclusion-fixtures.ts` — Two scenario factories:

- **ExclusionPanelScenario** (minimal): company → casino → casino_settings → auth user → staff → player → player_casino. Role-parameterized (`admin`/`pit_boss`/`dealer`). Used for Mode B browser tests.
- **ExclusionEnforcementScenario** (extended): adds gaming_table → visit → open rating_slip. Used for Mode C auto-close verification.

Helpers: `seedExclusion()` (bypass-RLS pre-population), `createAuthenticatedClient()` (Mode C), `authenticateAndNavigate()` (Mode B with hydration wait).

### CI Advisory Job

`.github/workflows/ci.yml` — New `e2e` job:
- `continue-on-error: true` (advisory, not blocking)
- Starts local Supabase (GoTrue + PostgREST + Postgres)
- Installs Playwright chromium
- Runs the two exclusion spec files
- Uploads `playwright-report/` + `test-results/` as artifacts (14-day retention)

### Harness Stabilization Rules

QA-006 §13 — Operational rules extracted from stabilization:

| Rule | Failure Mode Prevented |
|------|----------------------|
| Hydration waits after navigation | Click before React hydration → no effect → misleading assertion failure |
| Scoped selectors + `{ exact: true }` | Ambiguous text matches across tile and dialog |
| Toast assertions over `waitForResponse` | Fragile coupling to URL patterns |
| Fixture invariants table | Missing `casino_settings` → cryptic `gaming_day` NOT NULL violation |
| YYYY-MM-DD for calendar dates | `toISO` conversion → `dateSchema()` regex rejection |
| Serial for lifecycle, parallel for gating | Shared state corruption in parallel workers |

---

## Commit Arc

### Phase 1: Infrastructure (2026-03-10 → 2026-03-22)

| Commit | Date | What |
|--------|------|------|
| `a2a3861` | 03-10 | Create `player_exclusion` table, helpers, indexes (EXEC-050 WS2) |
| `65e9cd3` | 03-10 | RLS policies for `player_exclusion` (EXEC-050 WS3) |
| `7a550c5` | 03-10 | Enforcement guards in slip RPCs (EXEC-050 WS6) |
| `b90061a` | 03-22 | Canonical `lib/validation/date.ts` — `dateSchema()` + `datetimeSchema()`. Server schemas migrated from `z.iso.datetime()` to `dateSchema()`. |

### Phase 2: Bug Fixes (2026-03-28 → 2026-03-29)

| Commit | Date | What |
|--------|------|------|
| `d3d8c40` | 03-28 | Replace direct DML with SECURITY DEFINER RPCs (`rpc_create_player_exclusion`, `rpc_lift_player_exclusion`). Resolves ISS-EXCL-001 (P0). |
| `14e02c5` | 03-29 | **Regression**: re-introduced `toISO` converters, unaware of `b90061a` schema fix. Also fixed generic error toast (ISS-EXCL-003) and `IMMUTABLE→STABLE` (ISS-EXCL-005). |
| `bd82986` | 03-29 | Wire enforcement into slip RPCs + auto-close on hard_block. 796-line migration. Integration tests. |

### Phase 3: E2E Standard + Exemplar (2026-03-29 → 2026-03-30)

| Commit | Date | What |
|--------|------|------|
| `abed253` | 03-29 | QA-006 E2E Testing Standard (695 lines). Auth mode decision matrix, fixture architecture, CI promotion path. |
| `a5d21b7` | 03-29 | Consolidate env loading, audit-patch QA-006. |
| `0d7bca6` | 03-30 | Exclusion fixture factory (`ExclusionPanelScenario`, `ExclusionEnforcementScenario`). |
| `8f05c86` | 03-30 | CRUD lifecycle tests (Mode B, serial). |
| `c6ba8ae` | 03-30 | Role gating tests (Mode B, parallel). |
| `6e6ef9a` | 03-30 | Auto-close system verification (Mode C). |
| `2ddc3a5` | 03-30 | Scaffold enforcement test in new-slip modal (blocked). |
| `ec57eb7` | 03-30 | Mark GAP-EXCL-E2E-001 as partially resolved. |
| `e438ec6` | 03-30 | **Stabilization**: resolve all test failures — 6/6 passing. Hydration waits, scoped selectors, fixture invariants. |
| `74f1ef8` | 03-30 | Remove `toISO` converters (14e02c5 regression). Add unit regression tests at component + route layers. |

### Phase 4: Hardening (this session, uncommitted)

| Change | What |
|--------|------|
| E2E date regression test | New serial test fills all 3 date fields, verifies creation through full stack |
| Fixture date format fix | `seedExclusion()` and enforcement spec: `toISOString()` → `.toISOString().slice(0, 10)` |
| CI advisory job | `ci.yml` `e2e` job with Supabase + Playwright + artifact upload |
| QA-006 §13 | Harness stabilization rules (hydration, selectors, invariants, dates, serial/parallel) |
| Gap status update | ISS-EXCL-001/002/003/005/006 marked RESOLVED. GAP-EXCL-E2E-001 date row → COVERED. |

---

## The Date Regression Story

This deserves its own section because it's the exemplar of what the harness is for.

```
b90061a (Mar 22) ─── Correct fix: server → dateSchema() (YYYY-MM-DD)
                       No client conversion needed. Clean.

14e02c5 (Mar 29) ─── Regression: adds toISO converters to client
                       Unaware of b90061a. Converts YYYY-MM-DD → ISO datetime.
                       Server's dateSchema() regex rejects the ISO string.

74f1ef8 (Mar 30) ─── Removes toISO. Adds unit tests at both layers.

This session  ──── E2E test fills date fields, verifies full-stack path.
                       Fixture dates fixed to YYYY-MM-DD.
```

The E2E test was absent during the regression window. Had it existed, `14e02c5` would have been caught before merge. This is the operational argument for the date regression test existing in the E2E suite, not just at the unit level.

**See:** `docs/issues/gaps/player-exclusion/DATE-MISMATCH.md` for the full two-commit analysis.

---

## What Remains Open

| Item | Blocker | Priority |
|------|---------|----------|
| Pit-path enforcement (new-slip-modal hard block) | Pit dashboard fixture complexity (floor layout + table sessions) | P1 |
| Real-Supabase integration test for RLS write path (GAP-EXCL-E2E-002) | None — can be implemented now | P1 |
| Shared auth helper extraction (`e2e/fixtures/auth.ts`) | None — deferred tech debt | P1 |
| `createServiceClient()` consolidation (8+ definitions) | None — deferred tech debt | P1 |
| CI advisory stability observation | Need 14+ days of green runs before promotion to required | — |
| SEC-001 / ADR-030 documentation alignment | None — doc updates only | P2 |

---

## Reuse Pattern

This suite is the exemplar for the next workflow's E2E coverage. The recipe:

1. **Mode B** for canonical browser surface (CRUD, role gating, UI state)
2. **Mode C** for authenticated RPC/system verification (enforcement, audit trail)
3. **Role-parameterized fixtures** with minimal scenario (panel) and extended scenario (enforcement)
4. **Serial for lifecycle**, parallel for gating
5. **CI advisory first**, blocking after stability observation
6. **Harness rules** (QA-006 §13) applied from the start — don't rediscover them

The next candidate workflow for this pattern is **table session lifecycle** or **chip custody** (see QA-006 §9 uncovered workflows).
