---
id: PRD-053
title: "Point Conversion Canonicalization — Remove Runtime Constant, Wire DB Valuation Policy, Enforce Onboarding Seed"
owner: Engineering
status: Draft
affects: [ADR-045, ARCH-SRM, PRD-052, SEC-001]
created: 2026-03-20
last_review: 2026-03-20
phase: Phase 5 (Loyalty Hardening)
pattern: B
http_boundary: true
---

# PRD-053 — Point Conversion Canonicalization

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** Variable-amount comp issuance currently hardcodes `CENTS_PER_POINT = 10` in two files (`services/loyalty/crud.ts`, `components/loyalty/comp-confirm-panel.tsx`). This constant silently diverges from the per-casino `loyalty_valuation_policy.cents_per_point` column that the liability measurement system already reads, and implies a 100% reinvestment rate that is economically indefensible. This PRD removes all runtime conversion constants, wires both backend and frontend to the canonical DB source, enforces fail-closed behavior when the policy row is missing, and seeds pilot casinos with a defensible bootstrap default (`cents_per_point = 2`, implying 20% reinvestment at the current earn rate of 10). Additionally, this PRD delivers a minimal admin settings surface for viewing and editing `cents_per_point`, so that operators can adjust the redemption rate without engineering involvement. This is phase one of policy configurability — redemption knob only. The earn-rate knob (`game_settings.points_conversion_rate`) has the same admin gap; its write surface is deferred to a follow-on slice. Per ADR-045 (patched), this is a bounded remediation slice — not a loyalty admin or catalog repricing effort.

---

## 2. Problem & Goals

### 2.1 Problem

EXEC-053 (P2K-30) shipped variable-amount comp issuance with `CENTS_PER_POINT = 10` hardcoded in backend service code and frontend UI. The `loyalty_valuation_policy` table already exists with a per-casino `cents_per_point` column (landed in ADR-039 measurement schema), and the backend `getActiveValuationCentsPerPoint()` function already reads it — but falls back to `10` on error or missing row rather than failing closed. The frontend `CompConfirmPanel` ignores the DB entirely and uses its own `const CENTS_PER_POINT = 10`.

This creates three concrete problems:

1. **Multi-casino deployment blocked** — different casinos cannot set different redemption rates without code changes.
2. **Silent divergence** — comp valuation and liability valuation can use different rates, producing incorrect financial reporting.
3. **100% reinvestment default** — `points_conversion_rate = 10` × `cents_per_point = 10` / 100 = 100% reinvestment. This is placeholder scaffolding, not a viable operating posture.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Single source of truth for redemption rate | `grep -r 'CENTS_PER_POINT\|DEFAULT_CENTS_PER_POINT' --include='*.ts' --include='*.tsx'` returns zero matches in application code |
| **G2**: Fail-closed on missing policy | Attempting variable-amount comp issuance for a casino with no active `loyalty_valuation_policy` row returns a `VALUATION_POLICY_MISSING` domain error |
| **G3**: Defensible bootstrap seed | All pilot casinos have an active `loyalty_valuation_policy` row after migration. Casinos lacking an active row receive the bootstrap default `cents_per_point = 2`. Existing active policy rows are preserved. |
| **G4**: Frontend reads rate from DB | `CompConfirmPanel` receives `centsPerPoint` as a required prop sourced from `useValuationRate(casinoId)` hook; no component-local constant or default |
| **G5**: Admin can change redemption rate | A casino admin can change `cents_per_point` through the admin settings UI and observe the updated rate reflected in subsequent comp issuance — without code deployment or migration |

### 2.3 Non-Goals

- **Earn-rate admin (`game_settings.points_conversion_rate`)** — the earn knob has the same admin gap as the redemption knob: it is read by accrual logic but only writable via the onboarding setup wizard, with no post-setup admin surface. This is documented as GAP-A in the loyalty posture doc. This PRD delivers redemption-knob admin only (phase one of policy configurability). Earn-rate admin is a separate follow-on slice. "Already wired" means "the system reads it," not "the operator can manage it."
- **Catalog price provenance** — ADR-045 D3 requires promotional override pricing to be distinguishable from standard-derived pricing in catalog metadata. This is deferred to the follow-on catalog admin spec (see §7.1 Dependencies). This PRD does not touch `reward_price_points.points_cost` or add provenance columns
- **Operator preset ladder** (tight/balanced/aggressive) — belongs in onboarding UX, not in this remediation
- **`loyalty_earn_config` cleanup** — remains deprecated per ADR-045 D2; removal is a separate housekeeping task

---

## 3. Users & Use Cases

- **Primary users:** Pit bosses, floor supervisors (comp issuers); casino admins (policy configuration); system operators (onboarding)

**Top Jobs:**

- As a **pit boss**, I need variable-amount comp conversion to use the casino's configured rate so that the dollar amount I enter produces the correct point debit for my property's loyalty program.
- As a **system operator**, I need missing valuation policy to block comp issuance with a clear error so that I discover configuration defects during setup, not after issuing comps at a wrong rate.
- As a **pit boss**, I need the comp confirmation panel to display the actual conversion rate so that I can verify the point debit before confirming.
- As a **casino admin**, I need to change the redemption rate (`cents_per_point`) through the admin settings UI so that I can adjust the loyalty program's generosity without requiring engineering involvement.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Backend — fail-closed valuation lookup:**
- Remove `DEFAULT_CENTS_PER_POINT = 10` constant from `services/loyalty/crud.ts`
- Change `getActiveValuationCentsPerPoint()` to throw `VALUATION_POLICY_MISSING` domain error when no active row exists (instead of returning `10`)
- `issueComp()` surfaces this error to callers — no silent fallback

**Frontend — DB-sourced rate via prop threading:**
- Create `useValuationRate(casinoId)` hook in `hooks/loyalty/use-loyalty-queries.ts` — direct Supabase client query against `loyalty_valuation_policy` (eq `casino_id` + `is_active`), `staleTime: 300_000` (5 min cache)
- Remove `const CENTS_PER_POINT = 10` from `components/loyalty/comp-confirm-panel.tsx`
- Add `centsPerPoint: number` as a required prop on `CompConfirmPanel`
- Thread `centsPerPoint` through the component chain: `useValuationRate → IssueRewardButton → IssueRewardDrawer → CompConfirmPanel`
- Display actual rate in conversion line (replace hardcoded `$0.10/pt`)
- Surface configuration error state when `useValuationRate` returns error (block confirmation, show setup message)

**Bootstrap seed migration:**
- Migration: insert active `loyalty_valuation_policy` row with `cents_per_point = 2` for each existing casino that lacks one
- Idempotent: skip casinos that already have an active policy row

**Admin write surface — valuation policy settings:**
- Admin settings tab for viewing and editing `cents_per_point`
- Authenticated API endpoint for admin-only policy updates with audit-safe write semantics (atomic deactivate-old / insert-new, preserving policy history)
- Service-layer CRUD, validation schema, and cache-invalidating mutation hook
- Settings form with:
  - Read-only mode for pit_boss (view current rate, cannot edit)
  - Dirty state tracking and unsaved changes protection
  - Confirmation dialog before save with impact warning
  - Informational reinvestment rate preview, labeled as approximate and game-dependent
  - Loading, error, and last-saved states

**Test updates:**
- Update `issue-comp-variable-amount.test.ts` to expect `VALUATION_POLICY_MISSING` error when no active policy exists
- Add test: successful comp issuance reads `cents_per_point` from policy row, not from a constant

### 4.2 Out of Scope

- Earn-rate admin write surface (`game_settings.points_conversion_rate` post-setup editing) — follow-on slice
- Catalog price provenance schema changes (ADR-045 D3 — deferred to catalog admin spec)
- Batch/bulk rate changes across multiple casinos
- Valuation policy version history viewer / audit trail UI
- `loyalty_earn_config` table removal

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1:** `getActiveValuationCentsPerPoint(supabase, casinoId)` returns `cents_per_point` from the active `loyalty_valuation_policy` row for the given casino, or throws `VALUATION_POLICY_MISSING` if none exists.
- **FR-2:** `issueComp()` uses the value from FR-1 for variable-amount conversion (`Math.ceil(faceValueCents / centsPerPoint)`). No hardcoded fallback at any layer.
- **FR-3:** `useValuationRate(casinoId)` hook returns `{ centsPerPoint: number | null, policyMissing: boolean, isLoading: boolean, error: Error | null }` via direct client-side Supabase query against `loyalty_valuation_policy`. `policyMissing` is `true` when the query succeeds but no active row exists; `error` is set only for transport/auth/query failures.
- **FR-4:** `CompConfirmPanel` accepts `centsPerPoint` as a required prop. Conversion display reflects the actual rate (e.g., `$0.02/pt` instead of hardcoded `$0.10/pt`).
- **FR-5:** `useValuationRate` must normalize "query succeeded but no active row" into a dedicated missing-policy state (`policyMissing: boolean`), distinct from transport/auth/query errors (`error`). The UI uses the configuration-error copy ("Valuation policy not configured...") only for the missing-policy case; generic query failures surface a standard retry/error state. In both cases the confirm button is disabled.
- **FR-6:** Bootstrap migration inserts `cents_per_point = 2` for all casinos without an active policy row.
- **FR-7:** Updating `cents_per_point` atomically deactivates the current active policy row and inserts a new row with updated values (`cents_per_point`, `effective_date`, `version_identifier`, `created_by_staff_id`). The write must be transactional — partial state (two active rows or zero active rows) must not be observable.
- **FR-8:** The admin write endpoint requires admin role. Non-admin roles receive 403. The endpoint follows the project's authenticated middleware chain (auth, RLS context, idempotency, audit).
- **FR-9:** The settings form displays: current `cents_per_point`, `effective_date` of active policy, last-saved timestamp, and an informational reinvestment rate indicator. The reinvestment indicator must be labeled as approximate and game-dependent (see NFR-5).
- **FR-10:** Pit boss role sees the valuation settings in read-only mode with a visible informational banner. Cannot edit or save.
- **FR-11:** The form warns on navigation with unsaved changes and requires explicit confirmation before saving, with impact copy explaining that the change affects all future comp issuance conversions.

### 5.2 Non-Functional Requirements

- **NFR-1:** `useValuationRate` query is cached with `staleTime: 300_000` (5 minutes). Valuation policy changes infrequently; this avoids per-interaction DB hits.
- **NFR-2:** The `loyalty_valuation_policy` table already has Pattern C hybrid RLS SELECT policy (landed in ADR-039 migration `20260307114452`). No new RLS work required — the direct client-side query path relies on the existing `loyalty_valuation_policy_select_casino_scoped` policy. This is a **fixed architectural assumption per ADR-045 D5**, not an open question.
- **NFR-3:** Backend valuation lookup is parallelized with existing pre-flight queries in `issueComp()` (reward fetch + balance check). No additional sequential latency.
- **NFR-4:** The atomic deactivate-old/insert-new write for valuation policy updates must execute within a single database transaction. Because the Supabase JS client does not support multi-statement transactions and RLS write policies use session vars (`current_setting('app.staff_role', true)`) that are only set server-side, the operation requires a SECURITY DEFINER RPC with self-injection per ADR-015 Phase 1A pattern.
- **NFR-5:** The reinvestment rate preview is **informational and game-dependent**. Because `points_conversion_rate` varies per game type within a casino, there is no single casino-wide reinvestment rate. The preview must either: (a) show a range across game types, or (b) show a representative rate with explicit labeling such as "Approximate — varies by game type." The preview must not present a single number as an authoritative casino-wide reinvestment rate.

> Architecture details: See ADR-045 (D4, D5, D6), SRM §LoyaltyService, migration `20260307114452_adr039_loyalty_measurement_schema.sql`

---

## 6. UX / Flow Overview

**Flow 1: Variable-amount comp issuance (happy path)**
1. Pit boss opens Player 360 → clicks Issue Reward
2. Page-level component calls `useValuationRate(casinoId)` — returns `{ centsPerPoint: 2 }`
3. Pit boss selects a `points_comp` reward → `CompConfirmPanel` renders with `centsPerPoint=2` prop
4. Pit boss enters dollar amount (e.g., `$20.00`)
5. Panel displays: `$20.00 = 1,000 points (at $0.02/pt)`
6. Pit boss confirms → backend reads same `cents_per_point = 2` from DB → debits 1,000 points

**Flow 2: Missing valuation policy (config error)**
1. Pit boss opens Player 360 → clicks Issue Reward
2. `useValuationRate(casinoId)` returns error (no active policy row)
3. Comp confirmation panel shows configuration error state: "Valuation policy not configured for this casino. Contact system administrator."
4. Confirm button is disabled — no comp can be issued at an unknown rate

**Flow 3: Catalog default comp (no dollar input)**
1. Pit boss selects a reward with a fixed `points_cost` from the catalog
2. `centsPerPoint` is still threaded for display purposes but `points_cost` is used directly — no conversion needed
3. Existing flow unchanged

**Flow 4: Admin changes redemption rate**
1. Casino admin navigates to Admin > Settings > Valuation tab
2. Form loads current active policy: shows current `cents_per_point`, `effective_date`, last-saved timestamp
3. Reinvestment preview: "Approx. reinvestment: ~20% (varies by game type)"
4. Admin changes `cents_per_point` — preview updates live: "Approx. reinvestment: ~50% (varies by game type)"
5. Save Changes button appears → admin clicks → confirmation dialog with impact warning
6. On confirm: server atomically deactivates old policy row, inserts new row with updated values
7. Success: form resets dirty state, displays updated values, success toast

**Flow 5: Pit boss views valuation settings (read-only)**
1. Pit boss navigates to Admin > Settings > Valuation tab
2. Informational banner: "Only casino admins can change valuation settings."
3. All inputs disabled; can view current rate and reinvestment preview but cannot edit or save

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **ADR-045 (patched)** — Accepted; governs all decisions in this PRD. D4 (fail-closed), D5 (client-side query hook), D6 (bootstrap seed).
- **ADR-039 migration** — `loyalty_valuation_policy` table and Pattern C RLS policies already landed (`20260307114452`). No new schema DDL required beyond the seed insert.
- **Catalog price provenance (follow-on)** — ADR-045 D3 requires promotional override pricing to be distinguishable from standard-derived pricing. This PRD explicitly does not address that requirement. A follow-on catalog admin spec must resolve it. Until then, `reward_price_points.points_cost` has no provenance metadata and all catalog prices are treated as opaque.
- **`game_settings.points_conversion_rate` (read-only dependency)** — The reinvestment rate preview in the valuation settings form reads the casino's earn rates from `game_settings` to compute the implied reinvestment percentage. This is a read-only cross-context data access (CasinoService → LoyaltyService admin UI). No write dependency.

### 7.2 Risks & Open Questions

- **Existing test assumptions** — `issue-comp-variable-amount.test.ts` currently assumes `CENTS_PER_POINT = 10` for conversion math. Tests must be updated to use the seeded policy value or mock `getActiveValuationCentsPerPoint` to return a known rate. Moderate effort, no architectural risk.
- **In-flight comp staleness** — If an operator changes `cents_per_point` while a pit boss has the comp drawer open, the displayed rate may be stale until the drawer is reopened. Acceptable per ADR-045 Consequences — drawer uses key-based reset on open, and valuation policy changes are rare.
- **Pilot seed timing** — The bootstrap migration must run before any comp issuance attempt post-deploy. If the migration fails or is skipped, comp issuance is blocked (fail-closed). This is intentional.
- **Reinvestment preview accuracy** — The preview is inherently approximate because earn rate varies per game type. NFR-5 constrains the UI to label it as such. This is the correct representation of the two-knob model, not a limitation to resolve.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Variable-amount comp issuance uses `cents_per_point` from `loyalty_valuation_policy` for the casino — no hardcoded constant in backend or frontend
- [ ] Missing active policy row produces `VALUATION_POLICY_MISSING` error and blocks issuance
- [ ] `CompConfirmPanel` displays the actual rate from DB (e.g., `$0.02/pt`), not `$0.10/pt`
- [ ] Configuration error state renders when valuation policy cannot be loaded

**Data & Integrity**
- [ ] All pilot casinos have an active `loyalty_valuation_policy` row after migration
- [ ] Casinos that lacked an active row received the bootstrap default `cents_per_point = 2`
- [ ] Casinos with pre-existing active policy rows are unchanged by the migration

**Security & Access**
- [ ] `useValuationRate` hook reads via existing Pattern C RLS SELECT policy — no new RLS read policies required
- [ ] Admin write endpoint requires admin role; non-admin roles receive 403
- [ ] No privilege escalation: authenticated staff can read their casino's valuation policy; only admin can write

**Testing**
- [ ] Unit test: `getActiveValuationCentsPerPoint` throws `VALUATION_POLICY_MISSING` when no active row exists
- [ ] Unit test: `issueComp` with `faceValueCents` uses DB-sourced `centsPerPoint` for conversion
- [ ] Existing `issue-comp-variable-amount.test.ts` updated to remove `CENTS_PER_POINT = 10` assumptions

**Operational Readiness**
- [ ] No business-as-usual rollback to hardcoded conversion is supported. Recovery strategy is forward-fix: restore missing valuation policy rows or hotfix the read path
- [ ] `VALUATION_POLICY_MISSING` error is a named domain error — surfaceable in logs and error boundaries

**Admin Write Surface**
- [ ] Valuation settings tab appears in admin settings navigation and is navigable
- [ ] Settings form displays current `cents_per_point` and `effective_date` from active policy row
- [ ] Reinvestment rate preview shows approximate percentage, explicitly labeled as game-dependent (per NFR-5)
- [ ] Admin can change `cents_per_point`, confirm via dialog, and save successfully
- [ ] Pit boss sees tab in read-only mode (inputs disabled, informational banner)
- [ ] Unsaved changes protection fires when navigating with pending edits
- [ ] Subsequent comp issuance uses the newly saved rate
- [ ] Atomic deactivate/insert verified: old row `is_active = false`, new row `is_active = true`
- [ ] `created_by_staff_id` populated on new policy row from RLS context

**Documentation**
- [ ] ADR-045 patch applied (D4 fail-closed, D5 no default, D6 bootstrap seed)
- [ ] Known limitation documented: catalog price provenance deferred to follow-on spec

---

## 9. Related Documents

- **Architecture Decision**: `docs/80-adrs/ADR-045-point-conversion-two-knob-model.md`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` §LoyaltyService
- **Schema / Types**: `types/database.types.ts`, migration `20260307114452_adr039_loyalty_measurement_schema.sql`
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md` — `loyalty_valuation_policy` Pattern C SELECT
- **Predecessor PRD**: `docs/10-prd/PRD-052-loyalty-operator-issuance-v0.md`
- **Deferred dependency**: Catalog price provenance — ADR-045 D3 provenance requirement, follow-on catalog admin spec (not yet authored)
- **Gap documentation**: `docs/00-vision/loyalty-service-extension/POINTS_CONVERSIO_COMP_VALUATION_POSTURE.md` — GAP-A (earn-rate admin) and GAP-B (valuation policy admin)

---

## Appendix A: Hardcode Removal Inventory

| File | Line | Current | After |
|------|------|---------|-------|
| `services/loyalty/crud.ts` | 51 | `const DEFAULT_CENTS_PER_POINT = 10` | Deleted |
| `services/loyalty/crud.ts` | 74, 79 | `return DEFAULT_CENTS_PER_POINT` | Throw `VALUATION_POLICY_MISSING` |
| `components/loyalty/comp-confirm-panel.tsx` | 29 | `const CENTS_PER_POINT = 10` | Deleted; use `centsPerPoint` prop |
| `components/loyalty/comp-confirm-panel.tsx` | 80 | `defaultPointsCost * CENTS_PER_POINT` | `defaultPointsCost * centsPerPoint` |
| `components/loyalty/comp-confirm-panel.tsx` | 85 | `Math.ceil(amountCents / CENTS_PER_POINT)` | `Math.ceil(amountCents / centsPerPoint)` |
| `components/loyalty/comp-confirm-panel.tsx` | 157 | `(at $0.10/pt)` | Dynamic: `(at $${(centsPerPoint/100).toFixed(2)}/pt)` |
| `services/loyalty/dtos.ts` | 440 | JSDoc references `CENTS_PER_POINT` | Update to reference `loyalty_valuation_policy.cents_per_point` |

---

## Appendix B: Implementation Plan

### WS1: Backend — fail-closed valuation lookup (P0)

- [ ] Add `VALUATION_POLICY_MISSING` to domain error codes
- [ ] Modify `getActiveValuationCentsPerPoint()`: throw on missing/error instead of returning `10`
- [ ] Update `issueComp()` error propagation (already surfaces thrown errors — verify)
- [ ] Update `dtos.ts` JSDoc reference

### WS2: Frontend — hook + prop threading (P0)

- [ ] Create `useValuationRate(casinoId)` in `hooks/loyalty/use-loyalty-queries.ts`
- [ ] Add `centsPerPoint: number` required prop to `CompConfirmPanel`
- [ ] Remove `const CENTS_PER_POINT = 10` from `comp-confirm-panel.tsx`
- [ ] Replace all usages with prop
- [ ] Dynamic rate display in conversion line
- [ ] Add distinct UI states: `policyMissing` → configuration error copy; `error` → generic retry/error state; both disable confirm
- [ ] Thread `centsPerPoint` through `IssueRewardButton → IssueRewardDrawer → CompConfirmPanel`

### WS3: Bootstrap seed migration (P0)

- [ ] Generate migration timestamp via `date +"%Y%m%d%H%M%S"`
- [ ] INSERT INTO `loyalty_valuation_policy` for each casino missing an active row: `cents_per_point = 2`, `is_active = true`, `version_identifier = 'prd-053-bootstrap'`
- [ ] Idempotent: `WHERE NOT EXISTS (SELECT 1 FROM loyalty_valuation_policy WHERE casino_id = c.id AND is_active = true)`

### WS4: Test updates (P0)

- [ ] Update `issue-comp-variable-amount.test.ts`: mock or seed policy row, remove `CENTS_PER_POINT = 10` references
- [ ] Add test: missing active policy row → `VALUATION_POLICY_MISSING` error
- [ ] Add test: comp with `faceValueCents = 2000`, `cents_per_point = 2` → `pointsCost = 1000`

### WS5: Admin write surface — valuation policy settings tab (P1)

**5a. Migration: RPC for atomic policy update**
- [ ] `rpc_update_valuation_policy(p_cents_per_point numeric, p_effective_date date, p_version_identifier text)` — SECURITY DEFINER
- [ ] Calls `set_rls_context_from_staff()` for self-injection
- [ ] Validates `app.staff_role = 'admin'`
- [ ] Atomically: UPDATE existing active row `SET is_active = false`, INSERT new row with provided values + `created_by_staff_id` from context
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
- [ ] Invalidates valuation rate cache on success

**5e. Settings UI**
- [ ] Tab entry in `app/(dashboard)/admin/settings/layout.tsx` SETTINGS_TABS array
- [ ] `app/(dashboard)/admin/settings/valuation/page.tsx` rendering form
- [ ] `components/admin/valuation-settings-form.tsx` following established admin settings form patterns (dirty state, unsaved prompt, confirmation dialog, role-gated read-only, loading/error/last-saved states)
- [ ] Reinvestment preview reads `game_settings` earn rates for cross-context display

**5f. Test updates**
- [ ] Unit test: atomic deactivate-old/insert-new verified
- [ ] Route handler test: admin role succeeds, pit_boss role returns 403
- [ ] Integration test: round-trip — save new rate, verify comp issuance uses new rate

---

## Appendix C: Error Codes

Per SRM Error Taxonomy:

**Loyalty Domain**
- `VALUATION_POLICY_MISSING` (HTTP 422) — No active `loyalty_valuation_policy` row for the casino. Configuration error, not a user error. Message: "Valuation policy not configured for this casino. Contact system administrator."
- `VALUATION_POLICY_UPDATE_FORBIDDEN` (HTTP 403) — Non-admin role attempted to update valuation policy. Message: "Only admin role can modify valuation policy."

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-03-20 | Engineering | Initial draft from ADR-045 (patched) |
| 0.2.0 | 2026-03-20 | Engineering | Audit delta: fix G3/DoD seed semantics, forward-fix rollback, distinguish missing-policy from query errors, remove direct-DB operator posture |
| 0.3.0 | 2026-03-20 | Engineering | Amendment: move admin write surface into scope (WS5), add FR-7–FR-11, NFR-4–NFR-5, Flows 4–5, reinvestment preview (game-dependent labeling per NFR-5), earn-rate gap framing as phase one |
