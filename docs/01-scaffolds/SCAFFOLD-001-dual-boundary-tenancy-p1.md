---
id: SCAFFOLD-001
title: "Feature Scaffold: Dual-Boundary Tenancy Phase 1 — Company Foundation"
owner: lead-architect
status: Draft
date: 2026-03-09
---

# Feature Scaffold: Dual-Boundary Tenancy Phase 1 — Company Foundation

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** dual-boundary-tenancy-p-1
**Owner / driver:** lead-architect
**Stakeholders (reviewers):** rls-expert, backend-service-builder, devils-advocate
**Status:** Decided
**Last updated:** 2026-03-09

## 1) Intent (what outcome changes?)

- **User story:** As the system, I need every casino to belong to a company so that `app.company_id` is available in every authenticated session — enabling future cross-property features without retroactive data backfills.
- **Success looks like:** Every `set_rls_context_from_staff()` call returns a `company_id`. Every `casino` row has a non-null `company_id` FK. Zero behavioral change for existing users.

## 2) Constraints (hard walls)

- **Security / tenancy:** `app.company_id` is derived server-side via `casino.company_id` JOIN — never from client input (ADR-024 INV-8). No RLS policy is rewritten or broadened. Company RLS remains deny-by-default for authenticated role.
- **Domain:** `casino.company_id` becomes NOT NULL after backfill. Existing casinos get 1:1 company rows. Bootstrap backward-compatible (auto-creates company from casino name, no user input).
- **Operational:** Migration must be idempotent (re-runnable without duplicate companies). `set_rls_context_from_staff()` return type changes — all callers must handle the new `company_id` column.
- **Regulatory/compliance:** None for Phase 1. Cross-property audit trail requirements apply starting Phase 3.

## 3) Non-goals (what we refuse to do in this iteration)

- Rewrite any RLS policy to consume `app.company_id`
- Build `staff_casino_access` junction table or multi-casino staff support
- Build tenant picker UI or casino switcher
- Enable cross-property player reads or lookups
- Card scanner / swipe interoperability
- Company admin UI (list, edit, merge companies)
- `player_casino` writes — local activation is Phase 2+

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - Existing `casino` rows (for backfill)
  - No user-supplied company input during bootstrap (auto-create from casino name)
- **Outputs:**
  - `company` rows populated (1:1 with casinos after backfill)
  - `casino.company_id` NOT NULL enforced
  - `set_rls_context_from_staff()` returns `company_id` in addition to `actor_id`, `casino_id`, `staff_role`
  - `app.company_id` session variable set via SET LOCAL
  - `RLSContext` TypeScript type extended with `companyId`
- **Canonical contract(s):** `RLSContext` (extended)

## 5) Options (2-4 max; force tradeoffs)

### Option A: Single atomic migration + code update

One migration handles all DDL: backfill company rows, set NOT NULL, amend both RPCs (`set_rls_context_from_staff`, `rpc_bootstrap_casino`). One code PR follows for TypeScript changes.

- **Pros:** Atomic — either all context plumbing works or none does. Single review surface. Impossible to deploy partial state.
- **Cons / risks:** Large migration file (~150-200 lines). Reviewer must hold all concerns in one read. Rollback is all-or-nothing.
- **Cost / complexity:** M (one migration + one code change)
- **Security posture impact:** Neutral — no policy changes, just context extension.
- **Exit ramp:** If company concept is abandoned, one migration to revert. `app.company_id` being set but unused is harmless.

### Option B: Two sequential migrations + code update

Migration 1: backfill company rows + set `casino.company_id` NOT NULL. Migration 2: amend RPCs to derive and return `company_id`. Code PR follows.

- **Pros:** Smaller, reviewable chunks. Data backfill can be validated before RPC changes. Migration 1 can land independently as a data quality fix (the orphan gap existed before this feature).
- **Cons / risks:** Intermediate state where `company_id` exists on rows but RPCs don't expose it — not dangerous but creates a "why isn't this available yet?" window. Two migrations to sequence correctly.
- **Cost / complexity:** M (two migrations + one code change)
- **Security posture impact:** Neutral — same as Option A.
- **Exit ramp:** Same as A — revert migrations in reverse order.

### Option C: Company creation strategy — auto-create only (no name matching)

Bootstrap always creates a new company per casino. No `p_company_name` parameter. Company grouping (merging multiple casinos under one company) is deferred to a future admin tool.

- **Pros:** Simplest possible bootstrap change. No name-matching ambiguity. No risk of accidental company sharing. Company identity is always 1:1 until explicitly changed.
- **Cons / risks:** Operators who bootstrap multiple casinos under one company must wait for a merge tool. Slightly more work later to associate.
- **Cost / complexity:** S (simpler RPC change)
- **Security posture impact:** Positive — no risk of accidental cross-company grouping during bootstrap.
- **Exit ramp:** Add name-matching or company-selection to bootstrap later without schema changes.

### Option D: Company creation strategy — name-matching during bootstrap

Bootstrap RPC takes optional `p_company_name`. When provided, find-or-create by exact case-sensitive name match. When NULL, auto-create from casino name.

- **Pros:** Operators can group casinos under one company at bootstrap time. Matches investigation recommendation.
- **Cons / risks:** Name is not identity — exact matching is fragile. Duplicate company names are allowed (different legal entities), so matching by name is inherently ambiguous. Requires documenting the identity contract clearly.
- **Cost / complexity:** M (slightly more RPC logic)
- **Security posture impact:** Slight risk — accidental company sharing via typo match is possible but mitigable (exact match, case-sensitive).
- **Exit ramp:** Can tighten to ID-based association later without breaking existing companies.

## 6) Decisions (resolved)

Two orthogonal decisions, both resolved per audit (`dual-boundary-tenancy-p1-decisions-audit.md`, 2026-03-09):

### Decision 1 — Migration strategy: **A (single atomic migration)**

Either A or B was valid. **A selected** because:
- One coherent invariant: company exists, `casino.company_id` populated/enforced, context plumbing returns `company_id` — all or nothing.
- Migration is still small enough (~150-200 lines) for single-pass review.
- No intermediate half-state to reason about.

### Decision 2 — Company creation: **C (auto-create only, 1:1)**

**C selected. D (name-matching) rejected for Phase 1.** Rationale:
- Name is not identity. Exact name matching is inherently ambiguous.
- Accidental cross-casino grouping via typo match is a real risk.
- Name-matching at bootstrap is admin policy by ambush — not what Phase 1 is for.
- Company grouping (merging multiple casinos under one company) deferred to a dedicated admin workflow or controlled migration path.

### Caveat — synthetic 1:1 company ownership

Phase 1 creates **synthetic 1:1 company ownership** for every casino. This means:
- Every casino has a non-null `company_id`
- `app.company_id` can be derived everywhere
- But `company_id` does **not yet** imply meaningful multi-property grouping

Future readers must not assume "company exists → cross-property reads should work." Phase 1 is **plumbing**, not **portfolio behavior**. The existence of `company_id` means the architectural boundary can be introduced later — not that shared-player visibility is already valid or enabled.

This distinction must be called out in ADR-043.

## 7) Open questions / unknowns

- How many casinos currently exist in production/staging? (affects backfill migration complexity — likely trivial: 1-3 rows)
- ~~Does the bootstrap form need a company name field in the UI for Phase 1?~~ **Resolved: No.** Auto-create only (Decision 2).
- Should `set_rls_context_from_staff()` return type be extended in-place, or should a new function be created? (In-place is preferred per SRM, but callers must be audited for destructuring compatibility.)
- "We will learn this by": auditing existing callers of `set_rls_context_from_staff()` during design brief.

## 8) Definition of Done (thin)

- [ ] Decision recorded in ADR-043
- [ ] Acceptance criteria agreed (FEATURE_BOUNDARY success metrics)
- [ ] Implementation plan delegated to EXEC-SPEC-043

## Links

- Feature Boundary: `docs/20-architecture/specs/dual-boundary-tenancy-p-1/FEATURE_BOUNDARY.md`
- Design Brief/RFC: (Phase 2 of pipeline)
- ADR(s): ADR-043 (Phase 4 of pipeline)
- PRD: PRD-050 (Phase 5 of pipeline)
- Exec Spec: EXEC-SPEC-043 (post-pipeline)
- Investigation: `docs/00-vision/DUAL-BOUNDARY-TENANCY/CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION.md`
