---
id: EXEC-042-AUDIT-NITS
title: "EXEC-042 Admin Settings Pages — Nit Audit (Fold-in Notes)"
status: draft
date: 2026-03-04
timezone: America/Los_Angeles
source: EXEC-042-admin-settings-pages.md
---

## Purpose

This doc folds implementation nits, spec gaps, and “quiet failure” risks discovered during an audit of the Admin → Settings pages work (EXEC-042 / PRD-042).

Scope: security boundaries, App Router behavior, data integrity (JSONB), API typing, and test realism.

---

## Nit List (Actionable)

### NIT-001 — App Router navigation-blocking is underspecified / likely incorrect
**Spec intent:** prompt on navigation-away when there are unsaved changes.

**Risk:** The spec references patterns that are typical for the **Pages Router** (router events / `onBeforePopState`-style handling). In **App Router**, internal navigation interception is not equally reliable out of the box, so you may end up with:
- `beforeunload` working (tab close/refresh),
- but in-app navigation not being blocked consistently.

**Fold-in fix:**
- Split the requirement explicitly into two:
  1) `beforeunload` protection (refresh/tab close)
  2) in-app navigation confirmation (link clicks / back button)
- State the chosen App Router-compatible approach (examples):
  - Use a client-side “guarded navigation” wrapper for in-app links in this settings area
  - Centralize navigation into a helper that can pop a confirm modal when `isDirty`
  - Ensure back-button behavior is covered (if not feasible, narrow the DoD).

**DoD tweak:** make the DoD statement precise: “blocks refresh/tab close” vs “blocks all in-app route transitions”.

---

### NIT-002 — Unknown-key preservation can be broken by strict validation
**Spec intent:** “Unknown key preservation” for `casino_settings.alert_thresholds` JSONB (e.g., `_future_field` survives round-trip).

**Risk:** If the server validates/parses JSON with a **strict** schema, unknown keys may be stripped during parse, contradicting the preservation test.

**Fold-in fix:**
- Ensure schemas involved in `alert_thresholds` parsing/validation are explicitly configured to **preserve unknown keys** (e.g., `.passthrough()` in Zod) at each object nesting level that might contain extras.
- Add a regression test that fails if unknown keys are dropped.

---

### NIT-003 — Idempotency key requirement is listed but not defined
**Spec:** “Idempotency key respected” appears in DoD.

**Risk:** Without a defined contract, it becomes aspirational (no header name, storage model, collision behavior, TTL, etc.)

**Fold-in fix (minimum viable contract):**
- Define a request header (e.g., `Idempotency-Key`)
- Define scope: `PATCH /api/admin/settings` for `(casino_id, actor_id, key)`
- Define server behavior:
  - If key seen before: return the same response (or 409)
  - TTL for stored keys (e.g., 24h)
- Define where stored:
  - table `idempotency_key` or reuse `audit_log` correlation id + lookup
- Add a test that repeats the same PATCH with same key and asserts stable result.

If you *don’t actually need idempotency* for this endpoint, remove it from DoD to avoid future policy drift.

---

### NIT-004 — Server guard depends on “RLS context” without specifying how it’s set for RSC
**Spec:** server layout guard derives staff role from “RLS context” and redirects non-admins.

**Risk:** Server Components require server-side truth. If your “context” is only set by request-scoped RPC calls in API handlers, the layout guard may not have that context for page render requests.

**Fold-in fix:**
- Explicitly define the guard’s source of truth:
  - Supabase auth user + DB lookup of `staff.role` (or JWT claim)
- If using session variables (`set_rls_context` pattern), define where/when it is invoked for **server-rendered routes** (not only API routes).

---

### NIT-005 — UI must reflect permissions, not just rely on 403
**Spec:** `pit_boss` can edit thresholds but not timezone / gaming day start.

**Risk:** Relying solely on API rejection causes poor UX and noisy error logs.

**Fold-in fix:**
- Disable/hide inputs and Save actions for disallowed fields per role.
- Keep API enforcement as the final backstop.

---

### NIT-006 — “Defaults from NULL” can cause noisy writes
**Spec:** GET returns `alert_thresholds: null`, UI applies defaults by parsing `{}`.

**Risk:** UI may immediately write defaults back on first render (dirty state triggered by default normalization), creating “no-op changes” and audit noise.

**Fold-in fix:**
- Treat defaults as *display-time* until user changes a value.
- Only persist when user actually modifies a field.

---

### NIT-007 — Typed DTO casting can mask missing SELECT columns
**Spec:** warns about casting to `CasinoSettingsWithAlertsDTO` while failing to select required columns; proposes `SETTINGS_SELECT`.

**Risk:** Implementation might drift and silently reintroduce `undefined` fields.

**Fold-in fix:**
- Keep `SETTINGS_SELECT` as the single canonical projection.
- Add a unit test that asserts required keys exist for the DTO.

---

### NIT-008 — E2E fixture should mirror real bootstrap flow (or explicitly justify divergence)
**Spec:** E2E must insert `casino_settings` row because current fixture doesn’t.

**Risk:** Tests become a parallel reality if prod uses an onboarding/bootstrap RPC to create settings.

**Fold-in fix (choose one):**
- Option A: Call the real bootstrap RPC in the fixture (preferred)
- Option B: Insert rows directly but document “fixture bypasses bootstrap” and keep a dedicated test for the bootstrap path.

---

### NIT-009 — “No new RLS policies needed” should be verified, not asserted
**Spec:** claims no new RLS policies needed.

**Risk:** A correct UI/API still fails at the DB layer if existing RLS doesn’t allow role-based updates of `casino_settings.alert_thresholds`.

**Fold-in fix:**
- Add a checklist item: verify existing RLS permits:
  - admin: read/write
  - pit_boss: write thresholds only (or enforced via API)
- If relying on API-only restriction, ensure DB RLS at least allows pit_boss updates to the row; otherwise you need RLS changes or definer wrappers.

---

### NIT-010 — Performance DoD lacks measurement plan
**Spec:** “Settings fetch < 300ms p95.”

**Risk:** Without measurement guidance, the DoD is not enforceable.

**Fold-in fix:**
- Define where p95 is measured (client RUM? server logs? local? prod?)
- Define test/bench conditions or downgrade to a “target” rather than DoD.

---

## Recommended Spec Edits (Minimal)

1. Add a small **“App Router navigation guard plan”** section that states what will and won’t be blocked.
2. Add a **“JSONB preservation”** note that server validation must not drop unknown keys.
3. Either define the **idempotency-key contract** or remove it from DoD.
4. Add a **“Guard source of truth”** note: JWT claim vs DB lookup vs session variables on RSC.
5. Add a short **RLS verification checklist** (even if “no changes expected”).

---

## Quick Checklist for Implementation Review

- [ ] Layout guard blocks non-admins server-side (no flash of content).
- [ ] API enforces field-level restrictions for pit_boss vs admin.
- [ ] `alert_thresholds` parsing preserves unknown keys.
- [ ] UI does not auto-write defaults on first render.
- [ ] E2E sets up `casino_settings` via real bootstrap (or documented direct insert).
- [ ] DTO projection is fixed and tested (`SETTINGS_SELECT`).
- [ ] Navigation-away protection is accurate for App Router behavior.
- [ ] RLS behavior validated for both roles.

