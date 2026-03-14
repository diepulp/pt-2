# Feature Boundary Statement: Dual-Boundary Tenancy Phase 1 — Company Foundation

> **Ownership Sentence:** This feature belongs to **CasinoService** and may only touch **`company`, `casino`, `set_rls_context_from_staff()`, `rpc_bootstrap_casino`**; cross-context needs go through **RLSContext DTO** (consumed by all services for context derivation).

---

## Feature Boundary Statement

- **Owner service(s):**
  - **CasinoService** — foundational context owning `company`, `casino`, `staff`, `player_casino`, and bootstrap/context RPCs
  - Note: `player_casino` is CasinoService-owned per SRM (ADR-022 D5) but is **not touched in this phase**. Local activation and cross-property enrollment are Phase 2+ concerns.

- **Phase 1 writes (exhaustive):**
  - `company` (backfill rows for existing casinos; new rows during bootstrap)
  - `casino.company_id` (backfill NULL → NOT NULL)
  - `set_rls_context_from_staff()` (amend to derive + SET LOCAL `app.company_id`)
  - `rpc_bootstrap_casino` (amend to auto-create company row during bootstrap)

- **Phase 1 reads:**
  - `casino` (JOIN to `company` for `company_id` derivation)
  - `staff` (existing read path, unchanged)

- **Cross-context contracts:**
  - `RLSContext` type in `lib/supabase/rls-context.ts` — extended with `companyId` field, consumed by all services that call `set_rls_context_from_staff()`

- **Non-goals (top 5):**
  1. Multi-casino staff access (Phase 2 — `staff_casino_access` junction table)
  2. Company-scoped RLS policies (Phase 3 — dual-mode SELECT policies)
  3. Cross-property player visibility in UI (Phase 4 — service + API layer)
  4. Tenant picker / casino switcher UI (Phase 2)
  5. Card scanner / swipe interoperability (deferred per operational addendum)
  6. Bootstrap form UI changes — no company name field; auto-create from casino name
  7. Company name-matching or company-selection during bootstrap (deferred to admin tooling)

- **Explicit constraint — no policy broadening:**
  No RLS policy semantics are changed in this phase. No SELECT, INSERT, UPDATE, or DELETE policy is rewritten. This slice only makes `app.company_id` available as a session variable for future use. The dangerous broadening (company-scoped reads) starts in Phase 3, not here.

- **DoD gates:** Functional / Security / Integrity / Operability

---

## Goal

Establish the company entity as a populated, enforced parent of casinos so that `app.company_id` is available in every RLS context derivation — the foundation for future cross-property features.

## Primary Actor

**System Administrator** (bootstrap flow) and **Pit Boss** (existing login flow, unaffected but gains `companyId` in context)

## Primary Scenario

Admin bootstraps a new casino; system auto-creates a company row named after the casino (1:1). No user-supplied company input during bootstrap. All existing casinos are backfilled with one company row each (1:1). Every subsequent `set_rls_context_from_staff()` call returns `company_id` alongside existing context fields.

**Caveat — synthetic 1:1 company ownership:** Phase 1 creates synthetic 1:1 company ownership. `company_id` does **not yet** imply meaningful multi-property grouping. Future readers must not assume "company exists → cross-property reads should work." This slice is **plumbing**, not **portfolio behavior**. Company grouping (merging multiple casinos under one company) is deferred to a dedicated admin workflow.

## Success Metric

- 100% of `casino` rows have non-null `company_id` (query audit)
- `set_rls_context_from_staff()` returns `company_id` for all active staff
- Existing bootstrap, login, and RLS context injection flows pass unchanged (zero behavioral regression)
- **No RLS policy broadening:** All existing RLS integration tests pass without modification. No policy grants access that was previously denied. `app.company_id` is set but no policy consumes it.
- Single-casino staff observe zero behavioral change in all workflows

---

## Document Structure

| Document | Purpose | Location |
|----------|---------|----------|
| **ADR-043** | Dual-boundary tenancy architectural decision (frozen) | `docs/80-adrs/ADR-043-dual-boundary-tenancy.md` |
| **EXEC-SPEC-043** | Implementation details (mutable) | `docs/20-architecture/specs/dual-boundary-tenancy-p-1/EXEC-SPEC-043.md` |
| **Feature Boundary** | Scope definition (this file) | `docs/20-architecture/specs/dual-boundary-tenancy-p-1/FEATURE_BOUNDARY.md` |

---

## Source Documents

- [Cross-Property Player Sharing Investigation](../../../00-vision/DUAL-BOUNDARY-TENANCY/CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION.md)
- [Phase 1 Foundation Analysis](../../../00-vision/DUAL-BOUNDARY-TENANCY/phase-1-foundation.md)
- [Operational Addendum](../../../00-vision/DUAL-BOUNDARY-TENANCY/cross-property-player-sharing-operational-addendum.md)
