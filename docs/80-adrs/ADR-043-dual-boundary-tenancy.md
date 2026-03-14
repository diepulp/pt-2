---
id: ADR-043
title: Dual-Boundary Tenancy — Company as Secondary Tenancy Parent
status: Accepted
date: 2026-03-09
owner: Security/Platform
amends: ADR-024 (context derivation return type), ADR-023 (tenancy model guardrails), ADR-015 (session variable set)
related: ADR-024, ADR-023, ADR-015, ADR-030, ADR-040, SEC-001, SEC-002
triggered_by: Cross-Property Player Sharing Investigation (docs/00-vision/DUAL-BOUNDARY-TENANCY/)
---

# ADR-043: Dual-Boundary Tenancy — Company as Secondary Tenancy Parent

## Status

**Accepted** — Phase 1 (foundation only). Company entity becomes a real, populated tenancy parent. No access semantics change.

## Context

PT-2 operates under casino-scoped multi-tenancy (ADR-023 Pool model). Every operational table has a `casino_id` column. RLS policies enforce `casino_id = current_setting('app.casino_id')`. The `company` table exists in the baseline schema as the parent of casinos (`casino.company_id` FK), but:

- Zero `company` rows have ever been created
- All `casino.company_id` values are NULL
- `set_rls_context_from_staff()` does not derive or set `app.company_id`
- No RLS policy references company

This means the company entity is an orphaned schema artifact. The `company → casino(s) → player(s)` hierarchy is modeled but never populated.

Business requirement: club members registered at Casino A should be visible across all properties under the same company umbrella. The investigation (`CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION.md`) confirmed this is technically feasible across 4 phases. Phase 1 establishes the foundation.

## Decision

### D1: `company` becomes a real, populated tenancy parent

Every casino must belong to a company. `casino.company_id` is backfilled and made NOT NULL. New casinos get a company row auto-created during bootstrap.

**Rationale:** The company entity is the architectural prerequisite for all cross-property features. Without populated company rows and an enforced FK, no future phase can introduce company-scoped reads.

### D2: `app.company_id` is derived server-side via `set_rls_context_from_staff()`

The RPC is extended to JOIN `casino → company`, derive `company_id`, and SET LOCAL `app.company_id`. The return type adds a `company_id` column.

**Rationale:** Consistent with ADR-024 INV-8 — context must be authoritative, derived from staff→casino→company chain, never from client input.

**Backward compatibility evidence (callers audit, RFC-001 §4.2):**
- 27+ SQL callers all use `PERFORM set_rls_context_from_staff()` — PERFORM discards the return value, so adding a column to RETURNS TABLE has zero impact
- Single TypeScript consumer (`lib/supabase/rls-context.ts:injectRLSContext()`) accesses return columns by name (`row.actor_id`, `row.casino_id`, `row.staff_role`) — named property access is unaffected by additional columns
- All test files either ignore the return data or check only for error — zero destructuring breakage
- Full audit trail: RFC-001 §4.2 "Callers audit (resolved)" and RFC-001 §6 "Alternative C" (new function rejected on this basis)

### D3: Phase 1 is plumbing only — no access semantics change

No RLS policy is added, removed, or modified. No policy consumes `app.company_id`. The session variable is set but inert. Company-scoped reads are Phase 3 scope.

**Rationale:** The dangerous broadening (company-scoped SELECT policies) requires a dedicated threat model, 4-agent review, shadow policies, and staged rollout. Phase 1 must not smuggle in behavioral changes.

### D4: Company creation is 1:1 auto-create — no name-matching, no user input

**ERROR:** 
"Bootstrap auto-creates a company row named after the casino. No `p_company_name` parameter. No find-or-create semantics. No bootstrap form changes."

Bootstrap-created company records in Phase 1 are synthetic tenancy parents and their names/labels are non-canonical placeholders until explicitly normalized through later admin workflow. 

The bootstrap-created company name must not be interpreted as the legal or canonical business name of the operating company.

**Rationale:** Name is not identity. Name-matching during bootstrap introduces accidental grouping risk and admin policy by ambush. Company grouping (merging multiple casinos under one company) is deferred to a dedicated admin workflow.

**Caveat — synthetic 1:1 company ownership:** Phase 1 creates synthetic 1:1 company rows. `company_id` does **not yet** imply meaningful multi-property grouping. Future readers must not assume "company exists → cross-property reads should work." This slice is plumbing, not portfolio behavior.

### D5: FK hardened from CASCADE to RESTRICT

`casino.company_id` foreign key behavior changes from `ON DELETE CASCADE` to `ON DELETE RESTRICT`.

**Rationale:** If company is a real tenancy parent, the schema must not allow silent cascade deletion of dependent casinos. This is referential hardening, not behavior expansion. Privileged operations (migrations, service_role scripts, console access) could trigger CASCADE even under deny-by-default RLS.

### D6: Context derivation fails closed

If `set_rls_context_from_staff()` cannot derive `company_id` (missing company row, NULL FK, data corruption), the RPC must raise an error. No context is set — not `app.company_id`, not `app.casino_id`, not `app.actor_id`. No fallback to stale session state or JWT claims for `company_id`.

**Rationale:** Consistent with ADR-030 fail-closed principle. Partial context establishment creates subtle tenancy bugs. The RPC already fails on missing casino or inactive staff — company follows the same pattern.

## Amendments

### ADR-024: Context Derivation

- **Return type extended:** `set_rls_context_from_staff()` RETURNS TABLE gains `company_id uuid` column
- **Session variable added:** `SET LOCAL 'app.company_id'` derived from `casino.company_id` JOIN
- **INV-8 maintained:** `company_id` is derived server-side, not accepted as RPC parameter
- **TypeScript contract:** `RLSContext.companyId` added as required field

### ADR-023: Multi-Tenancy Storage Model

- **Guardrail 1 amended:** Company is recognized as a secondary tenancy boundary alongside casino
- **Pool model unchanged:** All data remains in single Supabase project. Company is a logical grouping, not a deployment boundary.
- **Silo escape hatch:** Cross-company features disabled for per-casino Silo deployments (future consideration)

### ADR-015: Connection Pooling Strategy

- **Session variable set expanded:** `app.company_id` added to hybrid pattern alongside `app.casino_id`, `app.actor_id`, `app.staff_role`
- **Pooler safety:** SET LOCAL (transaction-scoped) ensures no cross-request bleed

## Consequences

### Positive

- Company entity is no longer an orphaned schema artifact
- `app.company_id` available for future cross-property features without retroactive migration
- Referential integrity enforced (NOT NULL + RESTRICT)
- Zero behavioral change for existing single-casino users (merge criterion — must be verified by running existing test suite against the migration/code change before merge)

### Negative

- `set_rls_context_from_staff()` has one additional JOIN per call (negligible — FK index exists)
- TypeScript callers of `RLSContext` must handle `companyId` field (compiler enforces this)
- Synthetic 1:1 company rows may create false impression of portfolio grouping

### Risks

- **Phase 3 premature broadening (P1):** Developer adds company-scoped policy before proper review. Mitigation: CI security gate asserts no policy references `app.company_id`.
- **Caller/context propagation drift (P2):** Outdated code path omits `company_id` propagation. Mitigation: (1) `RLSContext.companyId` is a required field — TypeScript compiler rejects omissions in typed paths; (2) integration test on `injectRLSContext()` asserts both `app.casino_id` and `app.company_id` are set together for all active staff; (3) SQL callers are unaffected (PERFORM discards return) but `app.company_id` is set via SET LOCAL inside the RPC regardless of caller behavior. The compiler covers typed paths; the integration test covers the actual database contract.

## Phase Roadmap (informational, not decided)

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Company foundation (this ADR) | **Decided** |
| Phase 2 | Multi-casino staff access + tenant picker | Future — requires own ADR |
| Phase 3 | Company-scoped RLS policies | Future — requires own ADR + 4-agent security review |
| Phase 4 | Service layer + API + UI for cross-property reads | Future — requires own ADR |

Phases 2-4 are not decided by this ADR. Each requires its own design cycle, threat model, and approval gate.

## References

- Feature Boundary: `docs/20-architecture/specs/dual-boundary-tenancy-p-1/FEATURE_BOUNDARY.md`
- Scaffold: `docs/01-scaffolds/SCAFFOLD-001-dual-boundary-tenancy-p1.md`
- RFC: `docs/02-design/RFC-001-dual-boundary-tenancy-p1.md`
- SEC Note: `docs/20-architecture/specs/dual-boundary-tenancy-p-1/SEC_NOTE.md`
- Investigation: `docs/00-vision/DUAL-BOUNDARY-TENANCY/CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION.md`
- Operational Addendum: `docs/00-vision/DUAL-BOUNDARY-TENANCY/cross-property-player-sharing-operational-addendum.md`
