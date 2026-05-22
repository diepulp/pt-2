---
id: PRD-050
title: "Dual-Boundary Tenancy Phase 1 — Company Foundation"
owner: Lead Architect
status: Draft
affects: [CasinoService, set_rls_context_from_staff, rpc_bootstrap_casino, RLSContext]
created: 2026-03-09
last_review: 2026-03-09
phase: "Foundation — Tenancy Infrastructure"
pattern: A
http_boundary: false
scaffold_ref: SCAFFOLD-001
adr_refs: [ADR-043]
---

# PRD-050 — Dual-Boundary Tenancy Phase 1: Company Foundation

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** Populate the `company` entity as a real tenancy parent in PT-2. Today, the `company` table exists in the baseline schema but has zero rows — every `casino.company_id` is NULL, and the RLS context pipeline has no awareness of company. This PRD delivers the data model backfill, referential hardening, context derivation extension, and TypeScript contract update required to make `company` a first-class tenancy primitive. Phase 1 is plumbing only — no RLS policy changes, no cross-property reads, no UI changes.

---

## 2. Problem & Goals

### 2.1 Problem

The `company` table is an orphaned schema artifact. It was created in the baseline schema as the parent of `casino` (`casino.company_id` FK), but:

- Zero `company` rows exist
- All `casino.company_id` values are NULL
- `set_rls_context_from_staff()` does not derive or set `app.company_id`
- No RLS policy references company
- `casino.company_id` FK uses `ON DELETE CASCADE` — a privileged deletion of a company row would silently cascade-delete all dependent casinos

This means the `company → casino(s) → player(s)` hierarchy is modeled but never populated. Future cross-property features (player sharing, multi-casino staff access, company-scoped reporting) have no foundation to build on.

### 2.2 Goals

- **G1:** Every `casino` row has a non-null `company_id` FK pointing to a valid `company` row
- **G2:** `set_rls_context_from_staff()` returns `company_id` and sets `app.company_id` via SET LOCAL for every authenticated session
- **G3:** `rpc_bootstrap_casino` auto-creates a company row during casino bootstrap — no user input, no name-matching
- **G4:** FK hardened from `ON DELETE CASCADE` to `ON DELETE RESTRICT` — company deletion blocked while casinos exist
- **G5:** Zero behavioral change for existing single-casino users — all existing RLS integration tests pass without modification

### 2.3 Non-Goals

- Rewrite or broaden any RLS policy to consume `app.company_id` (Phase 3)
- Build `staff_casino_access` junction table or multi-casino staff support (Phase 2)
- Build tenant picker UI or casino switcher (Phase 2)
- Enable cross-property player reads, lookups, or UI (Phase 4)
- Company admin tooling (list, edit, merge companies)
- Bootstrap form UI changes — no `p_company_name` parameter, no name-matching, no find-or-create
- Card scanner / swipe interoperability
- `player_casino` writes (local activation is Phase 2+)

---

## 3. Users & Use Cases

- **Primary users:** System infrastructure (no human user interaction in Phase 1)

**Top Jobs:**

- As the **system**, I need every casino to belong to a company so that `app.company_id` is available in every authenticated session — enabling future cross-property features without retroactive data backfills.
- As a **pit boss** bootstrapping a new casino, I need the system to auto-create a company row without additional input so that the setup flow remains unchanged.
- As a **platform engineer**, I need `app.company_id` in the RLS session context so that future phases can introduce company-scoped policies without modifying the context derivation pipeline.

---

## 4. Scope & Feature List

**In scope:**

- Backfill `company` rows for all existing casinos (1:1 synthetic ownership, deterministic loop — no name-based reassociation)
- Enforce `casino.company_id` NOT NULL
- Harden FK: `ON DELETE CASCADE` → `ON DELETE RESTRICT`
- Amend `rpc_bootstrap_casino` to auto-create company row (from casino name, no user input)
- Amend `set_rls_context_from_staff()` to derive `company_id` via `casino → company` JOIN and SET LOCAL `app.company_id`
- Extend return type of `set_rls_context_from_staff()` with `company_id` column
- Extend `RLSContext` TypeScript interface with required `companyId` field
- Update `injectRLSContext()` to extract `company_id` from RPC return
- Enrich bootstrap audit payload to include created `company_id`
- Context derivation fails closed: RPC errors on missing company row — no partial context, no fallback

**Out of scope:**

- Any RLS policy that references `app.company_id`
- Multi-casino staff access or tenant switching
- Cross-property player reads or lookups
- Company admin UI or merge tooling

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1:** The migration plan must establish the company foundation without exposing an incomplete deploy state — company rows backfilled, FK hardened to RESTRICT, NOT NULL enforced, and both RPCs amended — while preserving existing single-casino behavior. Migration choreography (single vs. sequential) is an implementation decision, not a PRD constraint.
- **FR-2:** Backfill creates one company per casino using a deterministic loop (INSERT company → UPDATE casino per iteration). No name-based reassociation. `WHERE company_id IS NULL` guard ensures idempotency.
- **FR-3:** `set_rls_context_from_staff()` INNER JOINs `casino → company`, derives `company_id`, and executes `SET LOCAL 'app.company_id'`. RETURNS TABLE gains `company_id uuid` column.
- **FR-4:** If `company_id` cannot be derived (missing company row, NULL FK, data corruption), the RPC raises an error. No context is set — not `app.company_id`, not `app.casino_id`, not `app.actor_id`. No fallback to stale session state or JWT claims.
- **FR-5:** `rpc_bootstrap_casino` creates a company row using the casino name before inserting the casino row. No `p_company_name` parameter. No find-or-create semantics.
- **FR-6:** Bootstrap audit payload explicitly includes `company_id` alongside `casino_id`, `staff_id`, `actor`, and `timestamp`.
- **FR-7:** `RLSContext` TypeScript interface extended with required `companyId: string`. `injectRLSContext()` extracts `company_id` from the RPC return by name.

### 5.2 Non-Functional Requirements

- **NFR-1:** Migration is idempotent — re-runs skip already-backfilled casinos (NULL guard on loop query)
- **NFR-2:** `set_rls_context_from_staff()` adds one JOIN: `casino → company`. FK index `idx_casino_company_id` already exists. Cost: one additional index lookup per call — negligible.
- **NFR-3:** `app.company_id` uses SET LOCAL (transaction-scoped) — pooler-safe, no cross-request bleed
- **NFR-4:** Type regeneration via `npm run db:types-local` after migration

> Architecture details: ADR-043. Schema and RPC specifics: RFC-001. Security controls: SEC_NOTE.md. Service boundaries: SRM v4.11.0 §CasinoService.

---

## 6. UX / Flow Overview

Phase 1 has **no user-facing UI changes**. The experience is entirely infrastructure:

1. **Migration runs** → company rows backfilled, FK hardened, NOT NULL enforced, RPCs amended
2. **Staff authenticates** → `set_rls_context_from_staff()` derives `company_id` alongside existing `actor_id`, `casino_id`, `staff_role`
3. **Bootstrap new casino** → `rpc_bootstrap_casino` auto-creates company row → casino row → staff row → audit log entry (now includes `company_id`)
4. **Application code** → `injectRLSContext()` returns `RLSContext` with `companyId` — available for future phases

No forms change. No screens change. No user action differs.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- Baseline `company` table schema (exists in current migrations)
- FK index `idx_casino_company_id` (already exists)
- `set_rls_context_from_staff()` — amendable, callers audit completed prior to implementation approval (27+ SQL PERFORM callers, 1 TypeScript consumer with named access). Evidence: RFC-001 §4.2 "Callers audit (resolved)" and ADR-043 D2 backward compatibility evidence block.
- `rpc_bootstrap_casino` — amendable, already creates casino + settings + staff atomically

### 7.2 Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Phase 3 premature broadening:** Developer adds company-scoped RLS policy before Phase 3 design review | Unintended cross-company data access | CI security gate asserts no policy references `app.company_id` (SEC_NOTE M7) |
| **Caller/context propagation drift:** Outdated code path omits `company_id` propagation | Inconsistent tenancy state across call paths | `RLSContext.companyId` required field (compiler enforces); integration test asserts both `app.casino_id` and `app.company_id` set together |
| **Synthetic 1:1 misinterpretation:** Future reader assumes company exists → cross-property reads should work | Premature feature assumptions | ADR-043 D4 caveat documented; Phase 1 is plumbing, not portfolio behavior |
| **Stale context in pooled connections:** SET LOCAL not executed on derivation failure | Context bleed from prior transaction | Fail-closed: RPC errors entirely on missing company — no partial context set (ADR-043 D6) |

All previously open questions are resolved (see RFC-001 §8).

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**

- [ ] Migration(s) execute successfully: company rows backfilled, FK hardened to RESTRICT, NOT NULL enforced, both RPCs amended — no incomplete deploy state exposed
- [ ] `set_rls_context_from_staff()` returns `company_id` for all active staff
- [ ] `rpc_bootstrap_casino` creates a company row and uses it when inserting the casino row
- [ ] Bootstrap audit payload includes `company_id` field

**Data & Integrity**

- [ ] `SELECT count(*) FROM casino WHERE company_id IS NULL` returns 0 post-migration
- [ ] `casino.company_id` FK is `ON DELETE RESTRICT` (verified: `DELETE FROM company WHERE id = <any>` raises FK violation)
- [ ] `casino.company_id` is NOT NULL

**Security & Access**

- [ ] No RLS policy references `app.company_id` (CI security gate — SEC_NOTE M7)
- [ ] `app.company_id` derived server-side via `casino.company_id` JOIN only — no RPC parameter, no JWT claim, no client input (ADR-024 INV-8)
- [ ] Context derivation fails closed: RPC errors on missing company row, no partial context set
- [ ] `company` table remains deny-by-default for authenticated role (no new policies)

**Testing**

- [ ] All existing RLS integration tests pass without modification (verified by running the test suite against migration + code change)
- [ ] Integration test: `injectRLSContext()` returns non-null `companyId` for all active staff
- [ ] Integration test: RPC errors when staff's casino has no company row (fail-closed verification)

**Operational Readiness**

- [ ] Integration test verifies `current_setting('app.company_id', true)` is set correctly during authenticated request handling (deterministic assertion, not debug observability)
- [ ] Recovery plan documented: forward-fix or emergency mitigation procedures that preserve the intended referential safety invariant (`ON DELETE RESTRICT`). Reverting to CASCADE is not treated as routine rollback.

**Documentation**

- [ ] ADR-043 frozen and cross-referenced from all pipeline artifacts
- [ ] Synthetic 1:1 caveat documented in ADR-043 D4 (plumbing, not portfolio behavior)
- [ ] Types regenerated via `npm run db:types-local` after migration

---

## 9. Related Documents

- **Vision / Investigation:** `docs/00-vision/DUAL-BOUNDARY-TENANCY/CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION.md`
- **Operational Addendum:** `docs/00-vision/DUAL-BOUNDARY-TENANCY/cross-property-player-sharing-operational-addendum.md`
- **Feature Boundary:** `docs/20-architecture/specs/dual-boundary-tenancy-p-1/FEATURE_BOUNDARY.md`
- **Feature Scaffold:** `docs/01-scaffolds/SCAFFOLD-001-dual-boundary-tenancy-p1.md`
- **Design Brief / RFC:** `docs/02-design/RFC-001-dual-boundary-tenancy-p1.md`
- **SEC Note:** `docs/20-architecture/specs/dual-boundary-tenancy-p-1/SEC_NOTE.md`
- **ADR:** `docs/80-adrs/ADR-043-dual-boundary-tenancy.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.11.0 §CasinoService)
- **Security:** `docs/30-security/SEC-001-rls-policy-matrix.md`, `docs/30-security/SEC-002-casino-scoped-security-model.md`
- **Related ADRs:** ADR-024 (context derivation), ADR-023 (tenancy model), ADR-015 (connection pooling), ADR-030 (auth hardening)

**Supersession note:** ADR-043 and this PRD are the authoritative sources for Phase 1 scope and decisions. Earlier pipeline artifacts (investigation, scaffold, RFC) contain exploratory options (e.g., `p_company_name`, name-matching, deferred FK hardening) that were evaluated and rejected. Where any linked document contradicts ADR-043 or PRD-050, the ADR/PRD governs.
