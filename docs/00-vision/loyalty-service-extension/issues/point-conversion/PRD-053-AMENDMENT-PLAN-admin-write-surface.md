# Plan: Amend PRD-053 — Add Minimal Admin Write Surface for `cents_per_point`

**Status:** Draft — pending review
**Date:** 2026-03-20
**Target:** `docs/10-prd/PRD-053-point-conversion-canonicalization-v0.md`

## Context

PRD-053 removes hardcoded `CENTS_PER_POINT = 10` and wires the system to read `loyalty_valuation_policy.cents_per_point` from DB, with fail-closed semantics on missing rows. But it delivers **no write surface** — meaning operators can't change the redemption rate without engineering running SQL. ADR-045 D6 promises "operators may change either canonical knob through approved admin/configuration surfaces." This amendment makes that statement true for `cents_per_point`.

The earn knob (`game_settings.points_conversion_rate`) has the same gap — only writable via onboarding wizard, no admin page. This amendment explicitly acknowledges that as a separate phase, not this slice.

### Asymmetry acknowledged

ADR-045 declares two canonical knobs:

| Knob | Table | Column | Admin write surface |
|------|-------|--------|---------------------|
| Earn rate | `game_settings` | `points_conversion_rate` | Setup wizard only (GAP-A) |
| Redemption value | `loyalty_valuation_policy` | `cents_per_point` | **None** (GAP-B) → **this amendment** |

This PRD delivers redemption-knob admin only (phase one of policy configurability). Earn-rate admin is a known gap for a follow-on slice. The PRD must call this what it is — phase one, not finished policy configurability.

---

## What Changes (PRD document amendments — adds implementation scope)

### 1. Frontmatter
- `http_boundary`: `false` → `true` (new Route Handler)

### 2. Section 1 (Overview)
- Append to summary: this PRD also delivers a minimal admin settings tab for `cents_per_point` at `/admin/settings/valuation/`. Phase one of policy configurability — redemption knob only.

### 3. Section 2.2 (Goals) — Add G5
- G5: Admin can change the casino's redemption rate through the admin settings UI without code deployment or migration

### 4. Section 2.3 (Non-Goals) — Rewrite first two items
- Replace "Admin UI out of scope" → "Earn-rate admin (`game_settings.points_conversion_rate`) is a known gap (GAP-A in posture doc). This PRD delivers redemption-knob admin only (phase one). Earn-rate admin is a separate follow-on."
- Merge the old "Earn rate already wired" non-goal into this framing ("already wired" means "the system reads it," not "the operator can manage it")

### 5. Section 3 (Users) — Add admin job
- As a **casino admin**, I need to change the redemption rate through the admin settings UI so that I can adjust the loyalty program's generosity without requiring engineering involvement.

### 6. Section 4.1 (In Scope) — Add admin write surface block
New block covering:
- Admin settings tab for viewing and editing `cents_per_point`
- Authenticated API endpoint for admin-only policy updates with audit-safe write semantics (atomic deactivate-old / insert-new, preserving policy history)
- Service-layer CRUD, validation schema, and cache-invalidating mutation hook
- Settings form with:
  - Read-only mode for pit_boss (view current rate, cannot edit)
  - Dirty state tracking and unsaved changes protection
  - Confirmation dialog before save with impact warning
  - Informational reinvestment rate preview (see §8 below for labeling constraints)
  - Loading, error, and last-saved states

### 7. Section 4.2 (Out of Scope) — Update
- Remove "Admin UI for loyalty_valuation_policy (future PRD)"
- Add: earn-rate admin write surface, batch rate changes, policy version history viewer

### 8. Section 5.1 (Functional Requirements) — Add FR-7 through FR-11
- **FR-7:** Updating `cents_per_point` atomically deactivates the current active policy row and inserts a new row with updated values (`cents_per_point`, `effective_date`, `version_identifier`, `created_by_staff_id`). The write must be transactional — partial state (two active rows or zero active rows) must not be observable.
- **FR-8:** The admin write endpoint requires admin role. Non-admin roles receive 403. The endpoint follows the project's authenticated middleware chain (auth, RLS context, idempotency, audit).
- **FR-9:** The settings form displays: current `cents_per_point`, `effective_date` of active policy, last-saved timestamp, and an informational reinvestment rate indicator. The reinvestment indicator must be labeled as approximate and game-dependent (see NFR-5).
- **FR-10:** Pit boss role sees the valuation settings in read-only mode with a visible informational banner. Cannot edit or save.
- **FR-11:** The form warns on navigation with unsaved changes and requires explicit confirmation before saving, with impact copy explaining that the change affects all future comp issuance conversions.

### 9. Section 5.2 (Non-Functional) — Add NFR-4 and NFR-5
- **NFR-4:** Atomic write via SECURITY DEFINER RPC. Supabase JS client has no multi-statement transactions. RLS write policies use `current_setting('app.staff_role', true)` — session vars only set server-side via `set_rls_context_from_staff()`.
- **NFR-5:** The reinvestment rate preview is **informational and game-dependent**. Because `points_conversion_rate` varies per game type within a casino, there is no single casino-wide reinvestment rate. The preview must either: (a) show a range across game types, or (b) show a representative rate with explicit labeling such as "Approximate — varies by game type." The preview must not present a single number as an authoritative casino-wide reinvestment rate.

### 10. Section 6 (UX Flows) — Add Flows 4-5

**Flow 4: Admin changes redemption rate**
1. Casino admin navigates to Admin > Settings > Valuation tab
2. Form loads current active policy: `cents_per_point = 2`, `effective_date = 2026-03-20`
3. Reinvestment preview: "Approx. reinvestment: ~20% (varies by game type)" with tooltip or subtitle explaining earn rate varies per game
4. Admin changes `cents_per_point` to `5` — preview updates live: "Approx. reinvestment: ~50% (varies by game type)"
5. Save Changes → confirmation dialog → POST with idempotency key
6. Server atomically deactivates old row, inserts new row
7. Success: form resets, displays updated values

**Flow 5: Pit boss views read-only**
1. Pit boss navigates to Admin > Settings > Valuation tab
2. Amber banner: "Only casino admins can change valuation settings."
3. All inputs disabled; can view rate and reinvestment preview but cannot edit.

### 11. Section 7 — Add dependency + risk
- **Dependency:** Cross-context read of `game_settings.points_conversion_rate` for reinvestment preview (CasinoService → LoyaltyService admin UI, read-only via published DTO)
- **Risk:** Reinvestment preview is inherently approximate — earn rate varies per game type. NFR-5 constrains the UI to label it as such (range or "varies by game type"). Not a limitation to resolve; it is the correct representation of the two-knob model.

### 12. Section 8 (DoD) — Add admin surface group

**Admin Write Surface**
- [ ] Valuation settings tab appears in admin settings navigation and is navigable
- [ ] Settings form displays current `cents_per_point` and `effective_date` from active policy row
- [ ] Reinvestment rate preview shows approximate percentage, explicitly labeled as game-dependent (per NFR-5)
- [ ] Admin can change `cents_per_point`, confirm via dialog, and save successfully
- [ ] Pit boss sees tab in read-only mode (inputs disabled, amber banner)
- [ ] Unsaved changes protection fires when navigating with pending edits
- [ ] Subsequent comp issuance uses the newly saved rate
- [ ] Write endpoint requires admin role, returns 403 for non-admin roles
- [ ] Atomic deactivate/insert verified: old row `is_active = false`, new row `is_active = true`
- [ ] `created_by_staff_id` populated on new policy row from RLS context

### 13. Appendix B — Add WS5

**WS5: Admin write surface — valuation policy settings tab (P1)**

**5a. Migration: RPC for atomic policy update**
- [ ] `rpc_update_valuation_policy(p_cents_per_point numeric, p_effective_date date, p_version_identifier text)` — SECURITY DEFINER
- [ ] Calls `set_rls_context_from_staff()` for self-injection
- [ ] Validates `app.staff_role = 'admin'`
- [ ] Atomically: UPDATE existing active row `SET is_active = false`, INSERT new row
- [ ] Returns newly inserted row

**5b. Service layer**
- [ ] `ValuationPolicyDTO` in `services/loyalty/dtos.ts`
- [ ] `UpdateValuationPolicyInput` in `services/loyalty/dtos.ts`
- [ ] `updateValuationPolicySchema` in `services/loyalty/schemas.ts`
- [ ] `updateValuationPolicy()` in `services/loyalty/crud.ts` — calls RPC
- [ ] `valuationRate` key in `services/loyalty/keys.ts`
- [ ] `updateValuationPolicy()` HTTP fetcher in `services/loyalty/http.ts`

**5c. Route Handler**
- [ ] `app/api/v1/loyalty/valuation-policy/route.ts` with POST handler
- [ ] `withServerAction` middleware (auth + RLS + idempotency + audit)
- [ ] Admin-only role check, returns 403 for non-admin

**5d. React Query hook**
- [ ] `useUpdateValuationPolicy()` mutation in `hooks/loyalty/use-loyalty-mutations.ts`
- [ ] Invalidates `loyaltyKeys.valuationRate(casinoId)` on success

**5e. Settings UI**
- [ ] Tab entry in `app/(dashboard)/admin/settings/layout.tsx` SETTINGS_TABS array
- [ ] `getActiveTab()` handles `/valuation` path
- [ ] `app/(dashboard)/admin/settings/valuation/page.tsx` rendering form
- [ ] `components/admin/valuation-settings-form.tsx` following `ShiftSettingsForm` pattern

### 14. Appendix C — Add error code
- `VALUATION_POLICY_UPDATE_FORBIDDEN` (HTTP 403) — Non-admin role attempted to update valuation policy.

### 15. Version history
- 0.3.0 entry for this amendment

---

## Design Decisions

**Why POST not PATCH:** The table has audit-trail semantics (insert-only with deactivation). Each "update" creates a new row. POST matches "create new policy row."

**Why RPC not direct client mutation:** RLS write policies use `current_setting('app.staff_role', true)` — session vars not set in client-side path. Must go through server-side `set_rls_context_from_staff()`.

**Why Route Handler not just RPC from client:** Follows existing admin settings pattern (PATCH `/api/v1/casino/settings`). Gets `withServerAction` middleware for auth, RLS context injection, idempotency, and audit logging for free.

**Why earn-rate admin is a separate slice:** Different bounded context (CasinoService), different form complexity (`game_settings` has many columns beyond `points_conversion_rate`), and GAP-A has three documented options (wire `loyalty_earn_config`, deprecate it and expose `game_settings` directly, or hybrid). Coupling it here violates YAGNI and the Over-Engineering Guardrail.

---

## Key Reference Files

| File | Purpose |
|------|---------|
| `app/(dashboard)/admin/settings/layout.tsx` | Tab nav to extend (`SETTINGS_TABS` array, `getActiveTab()`) |
| `components/admin/shift-settings-form.tsx` | Canonical form pattern to follow |
| `app/api/v1/casino/settings/route.ts` | Route Handler pattern (`withServerAction`, role check) |
| `services/loyalty/crud.ts:60-80` | Existing `getActiveValuationCentsPerPoint()` — sibling for write function |
| `services/loyalty/keys.ts` | Add `valuationRate` query key |
| `supabase/migrations/20260307114452_adr039_loyalty_measurement_schema.sql` | Existing RLS policies (INSERT/UPDATE admin-only with session vars) |
| `docs/00-vision/loyalty-service-extension/POINTS_CONVERSIO_COMP_VALUATION_POSTURE.md` | GAP-A and GAP-B definitions |

---

## Verification (post-amendment)

1. Read final PRD — all 9 required sections internally consistent
2. G5 matches DoD admin checkboxes
3. WS5 tasks cover all new FRs (FR-7 through FR-11)
4. Non-goals no longer claim admin UI is out of scope
5. Earn-rate gap reframed honestly as phase one, not "already wired"
