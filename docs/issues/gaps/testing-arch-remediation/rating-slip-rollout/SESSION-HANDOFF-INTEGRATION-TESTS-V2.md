# Rating-Slip Integration Auth Remediation — Session Handoff V2

**Date:** 2026-03-31
**Spec:** `docs/superpowers/specs/2026-03-31-rating-slip-integration-auth-remediation.md`
**Plan:** `docs/superpowers/plans/2026-03-31-rating-slip-integration-auth-remediation.md`

---

## Implementation Status

### Completed (code changes applied, not yet committed)

| File | Change | Status |
|------|--------|--------|
| `rating-slip.integration.test.ts` | Mode C auth rewrite | **Code complete**, 12/27 tests pass |
| `rating-slip-continuity.integration.test.ts` | Mode C auth rewrite | **Code complete**, not yet run |
| `policy-snapshot.integration.test.ts` | Mode C auth rewrite | **Code complete**, not yet run |
| `rating-slip-move-pooling.integration.test.ts` | Mode C auth rewrite | **Code complete**, not yet run |
| `modal-data/route.test.ts` | RPC module mock added | **Done — 2/2 PASS** |

### What Was Done

1. **Mode C auth pattern** applied to all 4 integration files:
   - `setupClient` (service-role) for fixture creation/teardown
   - Auth user creation with `app_metadata: { casino_id, staff_role }`
   - Staff record bound to auth user via `user_id`
   - ADR-024 two-phase `staff_id` stamping into `app_metadata`
   - Sign-in via throwaway client → JWT
   - Authenticated `supabase` client with `Bearer` token
   - `createRatingSlipService(supabase)` uses authenticated client

2. **Schema drift fixes** applied:
   - Visit inserts: added required `gaming_day` and `visit_group_id` fields
   - Casino inserts (move-pooling): added `company_id` (ADR-043)
   - `service.close()` signature: 3-4 arg → 1-2 arg (current interface)

3. **Runtime bugs discovered and fixed:**
   - `signInWithPassword()` on `setupClient` mutates auth state → used throwaway `signInClient`
   - Staff role `dealer` lacks pause/close permissions → changed to `pit_boss`
   - Route handler mock missing `getModalDataViaRPC` → added RPC module mock

4. **Unused imports removed:**
   - `DomainError` from continuity file (TS6133)
   - `injectRLSContext` from move-pooling file

---

## Remaining Failures: `rating-slip.integration.test.ts` (15/27)

### Category 1: SEAT_OCCUPIED constraint (12 failures)

**Root cause:** The `rpc_start_rating_slip` RPC now enforces a **seat uniqueness constraint** — only one active rating slip per seat per table. Under the old service-role path, this constraint was either not enforced or bypassed. Under Mode C with real RLS context, it fires.

**Symptom:** Tests call `createTestFixture()` which creates an isolated player + visit, then call `service.start(...)` with hardcoded seat numbers (e.g., `'1'`, `'5'`). Multiple tests reuse the same table + seat number without closing the previous slip first. The constraint catches this.

**Affected tests:**
| Test | Seat | Why it fails |
|------|------|-------------|
| `should calculate duration excluding paused time` | `'1'` | Previous test left a slip open at seat `'1'` on `testTableId` |
| `should get current duration for open slip` | `'1'` | Same cascade |
| `should prevent duplicate open slips...` | `'1'` | Same cascade |
| `should allow slips at different tables...` | `'1'` | Same cascade |
| `should allow new slip after previous one is closed` | `'1'` | Same cascade |
| `should reject pause on non-open slip` | `'1'` | Same cascade |
| `should reject resume on non-paused slip` | `'1'` | Same cascade |
| `should reject close on already closed slip` | `'1'` | Same cascade |
| `should update average_bet on open slip` | `'5'` | Previous test left slip open |
| `should reject average_bet update on closed slip` | `'5'` | Same cascade |
| `should handle concurrent pause operations safely` | `'1'` | Same cascade |
| `should handle empty game_settings` | *(none)* | Same cascade — seat_number may be null but constraint still triggers on table |
| `should close paused slip directly` | *(none)* | Same cascade |

**Fix strategy:** The tests use `createTestFixture()` which creates a unique player + visit per test, but seat numbers are hardcoded per table. Two options:
- **(A)** Make seat numbers unique per fixture: `seat_number: \`seat-${fixtureCounter}\`` — avoids the constraint entirely
- **(B)** Clean up slips in `afterEach` instead of relying on `afterAll` — ensures no stale open slips leak between tests

**Recommendation:** Option A is simpler and more robust. The seat uniqueness constraint is per-table, so unique seat numbers per test avoid cross-test interference completely.

### Category 2: Pause history visibility (1 failure)

**Test:** `should track pause history correctly`

**Error:** `expect(slipWithPauses.pauses.length).toBe(1)` — received `0`

**Root cause:** `getById()` returns the slip with joined `rating_slip_pause` rows. Under Mode C, the RLS policy on `rating_slip_pause` may filter out rows that the authenticated user can't see, OR the pause record wasn't created because the `pause()` call succeeded but the pause row is in a different RLS scope.

**Investigation needed:**
1. Verify `rating_slip_pause` has an RLS policy that allows the authenticated pit_boss to see pauses
2. Check if `rpc_pause_rating_slip` creates the pause record as SECURITY DEFINER (should bypass RLS for insert) but the subsequent `getById()` read is filtered by RLS
3. May need to verify the `rating_slip_pause` RLS policy includes the authenticated user's casino

### Category 3: Error code mismatch (1 failure)

**Test:** `should handle visit from different casino`

**Error:** Expected `VISIT_CASINO_MISMATCH`, received `VISIT_NOT_OPEN`

**Root cause:** The test creates a visit in `testCasino2Id` and tries to start a slip via the authenticated client (which has `casino_id = testCasinoId`). Under service-role, the RPC checked casino mismatch explicitly. Under Mode C with RLS, the visit from the other casino is **invisible** to the authenticated user (RLS filters it), so the RPC sees "visit not found" or "visit not open" instead of "casino mismatch."

**Fix:** This is **correct behavior under RLS** — the authenticated user SHOULD NOT see visits from other casinos. The test assertion should change from `VISIT_CASINO_MISMATCH` to `VISIT_NOT_OPEN` (or whatever the actual RLS-filtered error is). This is a schema drift case per spec §4 decision rule — the current schema/RLS is correct, the test predates it.

### Category 4: Lifecycle test (1 failure — included in Category 1)

**Test:** `should complete full rating slip lifecycle: start -> pause -> resume -> close`

This test actually **passes** (it's the first test and gets a clean seat). Wait — checking the pass/fail list: it PASSES (✓). The count of 15 failures doesn't include this one. Confirmed: the 15 failures are the 12 SEAT_OCCUPIED + 1 pause history + 1 error code mismatch + 1 close-paused-slip (also SEAT_OCCUPIED). Total = 15.

---

## Files Modified (uncommitted)

```
services/rating-slip/__tests__/rating-slip.integration.test.ts
services/rating-slip/__tests__/rating-slip-continuity.integration.test.ts
services/rating-slip/__tests__/policy-snapshot.integration.test.ts
services/rating-slip/__tests__/rating-slip-move-pooling.integration.test.ts
app/api/v1/rating-slips/[id]/modal-data/__tests__/route.test.ts
```

## Artifacts Created (uncommitted)

```
docs/superpowers/specs/2026-03-31-rating-slip-integration-auth-remediation.md
docs/superpowers/plans/2026-03-31-rating-slip-integration-auth-remediation.md
```

---

## Estimated Remaining Work

| Item | Effort | Approach |
|------|--------|----------|
| Fix SEAT_OCCUPIED (12 tests) | Low | Use unique seat numbers per fixture: `seat-${fixtureCounter}` |
| Fix pause history visibility (1 test) | Medium | Investigate `rating_slip_pause` RLS policy |
| Fix error code assertion (1 test) | Low | Update assertion to match RLS-filtered behavior |
| Fix close-paused-directly (1 test) | Low | Same SEAT_OCCUPIED fix covers it |
| Run continuity, policy-snapshot, move-pooling | Medium | Same patterns will surface — unique seats + role + RLS assertions |
| Commit all changes | Low | 1-2 commits |
| Update ROLLOUT-SUMMARY | Low | Final posture table |
