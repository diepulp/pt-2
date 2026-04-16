I have all the data now. Let me compile the full triage report.

---

## E2E Triage Report — Phase 1

### Summary Across All 22 Spec Files (153 test cases)

| Category | Count | Details |
|----------|-------|---------|
| **Passed** | **22** | Working as-is |
| **Failed** | **50** | Need fixes |
| **Did not run** | **68** | Blocked by earlier failure in serial group |
| **Skipped (test.fixme)** | **13** | Stubs — expected |

### Classified Failures

#### 1. Route Drift (3 tests) — `/admin/alerts` moved to `/admin/anomaly-detection/alerts`
- `admin-alerts.spec.ts`: 3 tests — URL assertions expect `/admin/alerts`, actual URL is `/admin/anomaly-detection/alerts`
- **Fix:** Update `ADMIN_URLS` constant and assertions

#### 2. Fixture RLS Failure (1 test) — `test-data.ts` uses service-role but hits RLS on `player` table
- `admin-settings.spec.ts`: `createTestScenario()` from `test-data.ts` fails — "new row violates row-level security policy for table player"
- **Fix:** `test-data.ts` fixture needs the same company→casino→staff→app_metadata pattern used in other fixtures

#### 3. Missing Company in Fixture (1 test group, 17 tests blocked)
- `visit-continuation.spec.ts`: `createVisitContinuationScenario()` missing ADR-043 company creation — `null value in column "company_id" of relation "casino"`
- **Fix:** Add company creation before casino insert

#### 4. Auth/Login Form Selector Mismatch (2 tests)
- `measurement-reports.spec.ts`: Login helper looks for `[name="email"]` but actual form uses `#email`
- **Fix:** Use the canonical `authenticateAndNavigate` from `e2e/fixtures/auth.ts`

#### 5. Missing `data-testid="table-grid"` on `/pit` Page (28 tests)
- `rating-slip-modal.spec.ts` (10 tests), `move-player.spec.ts` (5 tests): All wait for `[data-testid="table-grid"]` which doesn't appear
- **Root cause:** Either the pit page doesn't render `table-grid` for test scenarios (no tables in casino? UI changed?) or the test user's casino has no active shift/tables
- **Fix:** Investigate pit page rendering — likely needs active tables seeded, or `data-testid` added to component

#### 6. RLS Context Missing for `createTestTransaction` (2 tests)
- `rating-slip-modal.spec.ts` tests 5 & 12: `player_financial_transaction` insert fails with "MISSING_CONTEXT: app.casino_id/app.actor_id must be set"
- **Root cause:** Finance-to-MTL bridge trigger requires RLS context even from service-role
- **Fix:** Use authenticated client for transaction creation, or set RLS context before insert

#### 7. MTL Entry Creation Fails (9+ tests)
- `mtl-threshold-notifications.spec.ts`, `mtl-fixtures.ts:442`: All `createTestMtlEntry` calls fail — same RLS context issue
- **Fix:** Same as #6 — `mtl_entry` insert triggers need RLS context

#### 8. API Route Changes (7 tests)
- `shift-intelligence.spec.ts`: GET `/alerts` returns non-200 — route may have moved or requires auth
- `loyalty-accrual.spec.ts`: Close endpoint returns 401 — needs authenticated request
- `move-player.spec.ts` Mode C tests (4): Move endpoint returns errors

#### 9. Assertion Drift — UI Content Changed (9 tests)
- `csv-player-import.spec.ts` (3): Looking for "5 rows detected" text — UI wording may differ
- `csv-server-import.spec.ts` (3): Looking for "10 rows detected" — same issue
- `loyalty-admin-catalog.spec.ts` (1): "Reward Catalog" heading not found
- `setup-wizard.spec.ts` (2): "Game Settings" card title not found after Step 0

#### 10. Shift Dashboard Auth Redirect (1 test)
- `shift-dashboard-v3-layout.spec.ts`: Unauthenticated redirect goes to different URL than expected
- 6 passed (layout tests), 1 failed, 10 blocked

### Passing Tests (22 GREEN)

| File | Passed |
|------|--------|
| `player-exclusion-enforcement.spec.ts` | 1 |
| `company-registration.spec.ts` | 5 |
| `player-exclusion.spec.ts` (role gating) | 2 |
| `admin-alerts.spec.ts` (dealer redirect) | 1 |
| `setup-wizard.spec.ts` (re-entry redirect) | 2 |
| `shift-dashboard-v3-layout.spec.ts` (layout) | 6 |
| `player-360-panels.spec.ts` (route structure) | 3 |
| `player-360-navigation.spec.ts` (route/URL) | 2 |

### Priority Fix Order

1. **Quick wins (fixture bugs):** `visit-continuation` missing company, `test-data.ts` RLS, `measurement-reports` login selector — unblocks 22+ tests
2. **Route drift:** `admin-alerts` URL update — unblocks 3 tests  
3. **RLS context for triggers:** Fix `createTestTransaction` and `createTestMtlEntry` — unblocks 11+ tests
4. **`data-testid="table-grid"` investigation:** Biggest blocker — unblocks 15+ tests across rating-slip-modal and move-player
5. **Assertion drift:** CSV import, setup-wizard, loyalty-admin text/selector updates — 9 tests