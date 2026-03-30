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

## P1 — Date Format Mismatch (Latent, will surface after P0 fix)

### ISS-EXCL-002: Client sends YYYY-MM-DD, server schema expects ISO 8601 datetime

**Severity:** P1 (blocks date-specific exclusions)
**State:** Latent — currently masked by P0 RLS failure; will surface when dates are provided

**Root Cause:**

The form uses `<input type="date">` which produces `YYYY-MM-DD` format. The submit handler sends this raw to the server:

```tsx
// create-exclusion-dialog.tsx line 109
effective_from: values.effective_from || undefined,
```

The server schema validates with `z.iso.datetime()` which rejects `YYYY-MM-DD`:

```typescript
// exclusion-schemas.ts line 33
effective_from: z.iso.datetime({ message: 'effective_from must be ISO 8601' }).optional(),
```

**Impact:** Creating an exclusion with explicit effective dates (common for regulatory and trespass exclusions) will fail with a validation error.

**Previous fix:** A client-side conversion (`new Date(\`${v}T00:00:00\`).toISOString()`) was applied but appears lost (not in current working tree). The issue doc at `docs/issues/ISSUE-SYSTEM-DATE-CONVERSION-STANDARDIZATION.md` documents this as a systemic problem.

**Fix options:**

| Option | Approach |
|--------|----------|
| **A: Client conversion** | Convert dates in submit handler: `new Date(\`${v}T00:00:00\`).toISOString()` |
| **B: Server schema fix** | Change `z.iso.datetime()` → YYYY-MM-DD regex for calendar-date fields |
| **C: Canonical dateSchema** | Create `lib/validation/date.ts` with `dateSchema()` and `datetimeSchema()` |

**Recommendation:** Option A as immediate fix, Option C as systemic fix per the standardization issue doc.

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
**Current state:** Only unit tests exist (schemas, mappers, badges, hooks). No Playwright E2E tests cover:
- Creating an exclusion via the dialog
- Verifying exclusion badge appears in header after creation
- Verifying exclusion tile shows active exclusion with enforcement details
- Lifting an exclusion via admin dialog
- Role-gating (dealer cannot see Add button)
- Visit-start enforcement (hard_block prevents seating, soft_alert shows warning)

**E2E test scenarios needed:**

| Test | Path | Validates |
|------|------|-----------|
| Create self-exclusion | Compliance > Add > fill form > submit | POST API, tile refresh, badge update |
| Lift exclusion (admin) | Compliance > Lift > fill reason > submit | POST lift API, tile/badge refresh |
| Role-gate: dealer sees no Add | Login as dealer > Compliance tab | Add button hidden |
| Role-gate: pit_boss sees no Lift | Login as pit_boss > active exclusion | Lift button hidden |
| Hard block prevents visit start | Create hard_block > New Rating Slip | Error toast, visit blocked |
| Soft alert warning on visit start | Create soft_alert > New Rating Slip | Warning toast, visit allowed |
| Date validation | Provide dates > submit | Dates accepted, stored correctly |

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
| ISS-EXCL-001 | **P0** | RLS INSERT policy blocks all creates (session-var-only + REST API) | **OPEN** |
| ISS-EXCL-002 | P1 | Date format mismatch (YYYY-MM-DD vs ISO datetime) | Latent |
| ISS-EXCL-003 | P1 | Generic error toast hides actionable details | OPEN |
| ISS-EXCL-004 | P2 | Casino endpoint 400 (unrelated) | OPEN |
| ISS-EXCL-005 | P2 | `is_exclusion_active()` IMMUTABLE → should be STABLE | OPEN |
| ISS-EXCL-006 | P2 | Lift operation same RLS failure | OPEN (same fix as 001) |
| GAP-EXCL-E2E-001 | P1 | No E2E tests for exclusion surface | OPEN |
| GAP-EXCL-E2E-002 | P1 | No integration test for RLS write path | OPEN |
| GAP-EXCL-DOC-001 | P2 | Missing from SEC-001 matrix | OPEN |
| GAP-EXCL-DOC-002 | P2 | Missing from ADR-030 registry | OPEN |

**Critical path:** ISS-EXCL-001 must be resolved first. Recommended approach: SECURITY DEFINER RPCs for create + lift operations, matching the established visit/gaming pattern.
