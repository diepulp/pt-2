# Player Exclusion Surface — Issues & Gaps Report

**Date:** 2026-03-27
**Tested by:** Agent (Chrome DevTools live UI + code analysis)
**Surface:** Player 360 > Compliance Tab > Exclusion Tile + Create Dialog
**Player:** John Smith (`a1000000-0000-0000-0000-000000000001`)
**Auth:** `pitboss@dev.local` (role: admin via remote Supabase)
**Environment:** `localhost:3000` → remote Supabase (`vaicxfihdldgepzryhpd.supabase.co`)

---

## P0 — Blocking: Cannot Create Exclusion (RLS Policy Violation)

### ISS-EXCL-001: Direct PostgREST DML fails on session-var-only INSERT policy

**Severity:** P0 (feature completely broken)
**Reproduction:** Player 360 > Compliance > Add > Self Exclusion + Hard Block + Reason > Create Exclusion
**Result:** `500 INTERNAL_ERROR` — `new row violates row-level security policy for table "player_exclusion"` (code 42501)

**Root Cause:**

The middleware chain calls `set_rls_context_from_staff()` via `.rpc()`, which sets `app.casino_id`, `app.actor_id`, `app.staff_role` using `SET LOCAL`. The subsequent `.from('player_exclusion').insert()` runs as a **separate HTTP request** to the Supabase REST API. `SET LOCAL` scopes only to the transaction in which it was issued — the session vars are gone by the time the INSERT executes.

The `player_exclusion` INSERT policy is **session-var-only** (no JWT fallback), per ADR-030 D4 critical table designation:

```sql
-- player_exclusion INSERT policy (session-var-only)
casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
```

When the session var is empty, this evaluates to `casino_id = NULL` → always FALSE → RLS violation.

**Comparison:** All other successful INSERT policies use **COALESCE JWT fallback**:

```sql
-- rating_slip, visit, loyalty_ledger INSERT policies (hybrid Pattern C)
casino_id = COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

This was flagged in EXEC-052 adversarial review as "INV-030-7 tension: direct PostgREST DML vs Template 2b policies" but was not resolved before shipping.

**Request body (captured):**
```json
{
  "exclusion_type": "self_exclusion",
  "enforcement": "hard_block",
  "reason": "Player requested voluntary self-exclusion from gaming activities",
  "effective_until": null,
  "review_date": null,
  "external_ref": null,
  "jurisdiction": null,
  "player_id": "a1000000-0000-0000-0000-000000000001"
}
```

**Response (captured):**
```json
{
  "ok": false,
  "code": "INTERNAL_ERROR",
  "error": "new row violates row-level security policy for table \"player_exclusion\"",
  "details": { "code": "42501" },
  "httpStatus": 500
}
```

**Fix options (ordered by preference):**

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: SECURITY DEFINER RPC** | Create `rpc_create_player_exclusion()` that calls `set_rls_context_from_staff()` + inserts in one transaction | Context + DML in same tx; consistent with visit pattern; preserves ADR-030 D4 | New migration + service change |
| **B: COALESCE JWT fallback** | Change INSERT policy to use `COALESCE(session_var, JWT)` | Minimal change (one migration) | Violates ADR-030 D4 designation; must amend ADR |
| **C: Same-transaction wrapper** | Wrap RPC + DML in a single Postgres function call | Preserves session-var pattern | Complex plumbing |

**Recommendation:** Option A. It matches the established visit/gaming pattern, preserves ADR-030 D4, and the same RPC pattern is needed for the UPDATE (lift) operation. A single migration with `rpc_create_player_exclusion` and `rpc_lift_player_exclusion` resolves both CREATE and LIFT.

---

## ~~P1 — Date Format Mismatch~~ — RESOLVED

### ISS-EXCL-002: Client sends YYYY-MM-DD, server schema expects ISO 8601 datetime

**Severity:** P1 (blocks date-specific exclusions)
**Status:** RESOLVED (2026-03-30)

**Resolution chain:**
1. **Commit `b90061a` (2026-03-22)** — Server schema migrated from `z.iso.datetime()` to `dateSchema('...')` (YYYY-MM-DD regex). Created canonical `lib/validation/date.ts`.
2. **Commit `14e02c5` (2026-03-29)** — Regression: re-introduced `toISO` converters, unaware of the schema fix.
3. **Commit `74f1ef8` (2026-03-30)** — Removed `toISO` converters. Added unit tests: component contract test validates YYYY-MM-DD passthrough, route handler test rejects ISO datetime.
4. **E2E regression test** (2026-03-30) — `player-exclusion.spec.ts` now fills all three date fields and verifies creation succeeds through the full browser→API→schema→DB path.

**See:** `DATE-MISMATCH.md` for the full two-commit regression analysis.

---

## P1 — Error Response Opacity

### ISS-EXCL-003: Generic "Failed to create exclusion" toast hides actionable error details

**Severity:** P1 (UX/debugging)
**Location:** `create-exclusion-dialog.tsx` line 119

```tsx
} catch {
    toast.error('Failed to create exclusion');
}
```

The `FetchError` class carries structured error details (code, field errors) but the dialog discards them. The user sees only a generic message with no indication of what went wrong (RLS, validation, etc.).

**Fix:** Extract and display the error message from the caught `FetchError`:

```tsx
} catch (err) {
    const message = err instanceof FetchError ? err.message : 'Failed to create exclusion';
    toast.error(message);
}
```

---

## P2 — Ancillary Issues

### ISS-EXCL-004: Casino endpoint returns 400 (separate, non-blocking)

**Severity:** P2 (cosmetic — 3 console errors on player page load)
**Request:** `GET /api/v1/casino/ca000000-0000-0000-0000-000000000001` → 400
**Error:** `{"fieldErrors":{"id":["Invalid casino ID format"]}}`
**Note:** Does not block exclusion functionality. Likely a route param validation issue in the casino detail endpoint.

### ISS-EXCL-005: `is_exclusion_active()` marked IMMUTABLE but calls `now()`

**Severity:** P2 (data correctness risk)
**Location:** `supabase/migrations/20260310003435_create_player_exclusion.sql` line 115
**Issue:** `IMMUTABLE` functions must return the same output for the same input. `now()` changes over time, making this function `STABLE` not `IMMUTABLE`. PostgreSQL may cache the result, causing stale active-status evaluations.
**Fix:** Change `IMMUTABLE` → `STABLE`.
**Source:** EXEC-052 adversarial review finding.

### ISS-EXCL-006: Lift operation will also fail (same RLS pattern)

**Severity:** P2 (blocked by P0 — same root cause)
**Location:** `exclusion-crud.ts` line 107-115
**Issue:** The UPDATE policy for lift also uses session-var-only:
```sql
casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
```
Direct `.from('player_exclusion').update()` will fail for the same reason as INSERT.
**Fix:** Resolved by Option A in ISS-EXCL-001 (`rpc_lift_player_exclusion`).

---

## Testing Gaps

### GAP-EXCL-E2E-001: No E2E tests for exclusion surface

**Priority:** P1
**Status:** PARTIALLY RESOLVED (2026-03-30)

**Covered:**
- `e2e/workflows/player-exclusion.spec.ts` — Mode B (browser login):
  - Create exclusion via dialog (serial CRUD lifecycle)
  - Verify exclusion tile shows active exclusion with enforcement details
  - Lift exclusion via admin dialog
  - Role-gate: pit_boss sees Add but not Lift
  - Role-gate: dealer sees neither Add nor Lift
- `e2e/api/player-exclusion-enforcement.spec.ts` — Mode C (authenticated client):
  - Auto-close verification: hard_block exclusion auto-closes active visit + open slip via RPC
  - Audit trail: verifies audit_log entry for auto-close
- QA-006 exemplar established (fixture pattern, auth mode selection, verification taxonomy)

**Still open — pit-path enforcement surface:**
- Hard block prevents seating (new-slip-modal) — scaffolded in `player-exclusion.spec.ts` (`test.skip`), blocked on pit dashboard fixture complexity (floor layout + table sessions required)
- Soft alert warning on visit start — same dependency
- Gap remains open until pit-path enforcement tests are implemented or explicitly de-scoped

**Original E2E test scenarios:**

| Test | Path | Status |
|------|------|--------|
| Create self-exclusion | Compliance > Add > fill form > submit | COVERED |
| Lift exclusion (admin) | Compliance > Lift > fill reason > submit | COVERED |
| Role-gate: dealer sees no Add | Login as dealer > Compliance tab | COVERED |
| Role-gate: pit_boss sees no Lift | Login as pit_boss > active exclusion | COVERED |
| Auto-close on hard_block | RPC create exclusion > verify visit/slip closed | COVERED (Mode C) |
| Hard block prevents visit start | Create hard_block > New Rating Slip | **OPEN** (scaffolded) |
| Soft alert warning on visit start | Create soft_alert > New Rating Slip | **OPEN** |
| Date validation (YYYY-MM-DD regression) | Fill all 3 date fields > submit succeeds | **COVERED** (E2E + unit) |

### GAP-EXCL-E2E-002: Integration test gap for RLS write path

**Priority:** P1
**Issue:** Existing integration tests (`exclusion-http-contract.test.ts`) mock the Supabase client, so they don't exercise the actual SET LOCAL → DML flow. The RLS violation only manifests in a live environment.
**Fix:** Add an integration test that uses a real Supabase client (local or remote) and exercises the full middleware chain for exclusion creation.

---

## Documentation Gaps

### GAP-EXCL-DOC-001: player_exclusion missing from SEC-001 RLS policy matrix

**Priority:** P2
**Source:** EXEC-052 adversarial review
**Fix:** Add player_exclusion policies to `docs/30-security/SEC-001-rls-policy-matrix.md`

### GAP-EXCL-DOC-002: player_exclusion missing from ADR-030 Category A/B registry

**Priority:** P2
**Source:** EXEC-052 adversarial review
**Fix:** Add player_exclusion to ADR-030's critical table registry with Category designation

---

## Summary

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| ISS-EXCL-001 | **P0** | RLS INSERT policy blocks all creates (session-var-only + REST API) | **RESOLVED** — `rpc_create_player_exclusion` + `rpc_lift_player_exclusion` via SECURITY DEFINER RPCs |
| ISS-EXCL-002 | P1 | Date format mismatch (YYYY-MM-DD vs ISO datetime) | **RESOLVED** — `dateSchema()` migration + `toISO` removal + regression tests |
| ISS-EXCL-003 | P1 | Generic error toast hides actionable details | **RESOLVED** — dialog now extracts `err.message` |
| ISS-EXCL-004 | P2 | Casino endpoint 400 (unrelated) | OPEN |
| ISS-EXCL-005 | P2 | `is_exclusion_active()` IMMUTABLE → should be STABLE | **RESOLVED** — `20260329125610_fix_exclusion_active_volatility.sql` |
| ISS-EXCL-006 | P2 | Lift operation same RLS failure | **RESOLVED** — same RPCs as 001 |
| GAP-EXCL-E2E-001 | P1 | No E2E tests for exclusion surface | **PARTIALLY RESOLVED** — CRUD, role gating, auto-close, date regression covered. Pit-path enforcement still scaffolded (`test.skip`). |
| GAP-EXCL-E2E-002 | P1 | No integration test for RLS write path | OPEN |
| GAP-EXCL-DOC-001 | P2 | Missing from SEC-001 matrix | OPEN |
| GAP-EXCL-DOC-002 | P2 | Missing from ADR-030 registry | OPEN |

**Remaining work:**
- GAP-EXCL-E2E-001: pit-path enforcement surface (new-slip-modal hard block) — blocked on pit dashboard fixture complexity
- GAP-EXCL-E2E-002: real-Supabase integration test for the RLS write path
- GAP-EXCL-DOC-001/002: documentation alignment (P2)
- ISS-EXCL-004: casino endpoint 400 (unrelated, P2)
