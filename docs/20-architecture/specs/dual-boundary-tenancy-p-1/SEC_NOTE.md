# SEC Note: Dual-Boundary Tenancy Phase 1 — Company Foundation

**Feature:** dual-boundary-tenancy-p-1
**Date:** 2026-03-09
**Author:** Lead Architect
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| `company` rows | Operational | Parent entity for casino grouping; incorrect linkage could misassign tenancy |
| `casino.company_id` FK | Operational / Integrity | Determines which company owns which casino; wrong value = wrong tenancy boundary |
| `app.company_id` session variable | Operational | Future tenancy primitive; if spoofed or misderived, cross-company leakage in Phase 3+ |
| `set_rls_context_from_staff()` return values | Audit / Integrity | Authoritative context source (ADR-030 TOCTOU); tampering breaks all downstream RLS |
| `rpc_bootstrap_casino` audit payload | Audit | Company creation must be attributable to actor + timestamp |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: `app.company_id` derived from client input | High | Low | P1 |
| T2: Backfill creates wrong company-casino linkage | Medium | Low | P1 |
| T3: `ON DELETE CASCADE` wipes casinos via company deletion | High | Low | P1 |
| T4: Company creation during bootstrap not audited | Medium | Medium | P2 |
| T5: Future Phase 3 policy reads `app.company_id` prematurely | High | Medium | P1 |
| T6: `set_rls_context_from_staff()` JOIN failure leaves stale `app.company_id` | Medium | Low | P2 |
| T7: Caller/context propagation drift | Medium | Medium | P2 |

### Threat Details

**T1: `app.company_id` derived from client input**
- **Description:** Attacker passes a company_id to an RPC or API to impersonate a different company
- **Attack vector:** Spoofed RPC parameter or JWT claim
- **Impact:** In Phase 3+, this would enable cross-company data access. In Phase 1, no policy consumes it — impact is latent but foundational.

**T2: Backfill creates wrong company-casino linkage**
- **Description:** Migration logic incorrectly associates a casino with the wrong company row
- **Attack vector:** Name-based reassociation ambiguity (if names collide), or migration re-run creates duplicates
- **Impact:** Tenancy boundary corruption — a casino grouped under the wrong company would inherit wrong cross-property visibility in future phases

**T3: `ON DELETE CASCADE` wipes casinos via company deletion**
- **Description:** A privileged operation (migration, service_role script, console) deletes a company row, silently cascading to all dependent casinos
- **Attack vector:** Accidental or malicious direct SQL via service_role or migration
- **Impact:** Total data loss for all casinos under that company

**T5: Future Phase 3 policy reads `app.company_id` prematurely**
- **Description:** A developer adds a company-scoped RLS policy before Phase 3 design review, using the now-available `app.company_id`
- **Attack vector:** Well-intentioned but unreviewed policy addition
- **Impact:** Unintended cross-company data access without proper threat modeling or soak testing

**T6: `set_rls_context_from_staff()` JOIN failure leaves stale context**
- **Description:** If `casino.company_id` is somehow NULL or the company row is missing, the JOIN may fail or return NULL, leaving `app.company_id` unset or stale from a previous transaction in a pooled connection
- **Attack vector:** Data corruption, migration failure, or session-variable bleed in pooled environments
- **Impact:** Context derivation returns incomplete data. In pooled environments, a stale `app.company_id` from a prior transaction could persist if SET LOCAL is not executed. Downstream behavior becomes unpredictable.
- **Fail-closed requirement:** Context derivation must occur fresh per request. If derivation fails, the RPC must error and **no context is set** — not `app.company_id`, not `app.casino_id`, not `app.actor_id`. Downstream flows must fail closed. No fallback to caller input, stale session state, or JWT-derived `company_id`.

**T7: Caller/context propagation drift**
- **Description:** A service, route, or middleware continues using an outdated context-handling contract and fails to propagate `company_id` after `set_rls_context_from_staff()` is extended
- **Attack vector:** Outdated code path that reads the RPC return or `RLSContext` type without acknowledging the new `company_id` field
- **Impact:** Inconsistent tenancy state across call paths — some requests establish both `casino_id` and `company_id`, others establish only `casino_id`. Future company-aware features then behave unpredictably depending on which path is used. This is how subtle tenancy bugs hatch.

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | Server-side derivation only | `app.company_id` derived via `casino.company_id` JOIN inside SECURITY DEFINER RPC. No RPC parameter, no JWT claim, no client input. (ADR-024 INV-8) |
| T2 | Deterministic backfill | Loop-based INSERT/UPDATE per casino row. No name-based reassociation. Each casino gets its own company via direct ID pairing within single loop iteration. |
| T3 | FK hardened to RESTRICT | Phase 1 migration changes `ON DELETE CASCADE` to `ON DELETE RESTRICT`. Company cannot be deleted while casinos reference it. |
| T4 | Explicit audit payload | Bootstrap RPC enriches audit_log entry with `company_id`, `casino_id`, `actor`, `timestamp`. Not implicit — payload fields are explicit. |
| T5 | No-policy-broadening constraint | Feature boundary and ADR-043 explicitly state: no RLS policy may consume `app.company_id` until Phase 3 design review. Security gate CI test should assert no policy references `app.company_id`. |
| T6 | Fail-closed derivation | Fresh derivation per request via SET LOCAL. INNER JOIN fails if company row missing. RPC raises error — no context set, no fallback. NOT NULL + RESTRICT prevent orphaned references. |
| T7 | Typed contract + caller audit | `RLSContext` TypeScript interface extended with required `companyId`. Callers audit confirmed all paths use `injectRLSContext()`. Integration test must assert both `app.casino_id` and `app.company_id` are set together. |

### Control Details

**C1: Server-side derivation (ADR-024 compliance)**
- **Type:** Preventive
- **Location:** SECURITY DEFINER RPC (`set_rls_context_from_staff`)
- **Enforcement:** Database
- **Tested by:** Existing `adr040_identity_provenance.test.sql` validates all RPCs use `set_rls_context_from_staff()`

**C2: Deterministic backfill**
- **Type:** Preventive
- **Location:** Migration
- **Enforcement:** Database (single-execution migration with idempotency guard)
- **Tested by:** Post-migration query audit: `SELECT count(*) FROM casino WHERE company_id IS NULL` = 0

**C3: FK hardened to RESTRICT**
- **Type:** Preventive
- **Location:** Database constraint
- **Enforcement:** Database (PostgreSQL FK enforcement)
- **Tested by:** Attempting `DELETE FROM company WHERE id = <any>` must raise FK violation

**C5: No-policy-broadening guard**
- **Type:** Detective
- **Location:** CI security gate
- **Enforcement:** Automated test
- **Tested by:** Security gate script should grep all RLS policies for `app.company_id` references and fail if any exist before Phase 3 is approved

**C6: Fail-closed context derivation**
- **Type:** Preventive
- **Location:** SECURITY DEFINER RPC (`set_rls_context_from_staff`)
- **Enforcement:** Database (INNER JOIN + RAISE EXCEPTION on no rows)
- **Tested by:** Integration test: call RPC with a staff whose casino has no company row → must return error, not empty context. Verify `SET LOCAL` uses `true` (transaction-scoped) to prevent cross-request bleed in pooled connections.

**C7: Typed contract + caller audit**
- **Type:** Preventive + Detective
- **Location:** `lib/supabase/rls-context.ts` (TypeScript type) + integration tests
- **Enforcement:** TypeScript compiler (required field) + CI test
- **Tested by:** (1) `RLSContext.companyId` is a required field — TypeScript rejects any caller that omits it. (2) Integration test asserts `injectRLSContext()` returns non-null `companyId` for all active staff. (3) Callers audit (completed) confirmed all paths funnel through `injectRLSContext()`.

---

## Deferred Risks (Explicitly Accepted for Phase 1)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Company-scoped RLS policy broadening | Phase 3 scope; requires dedicated threat model, 4-agent review, shadow policies, staged rollout | Before any RLS policy consumes `app.company_id` |
| Multi-casino staff context ambiguity | Phase 2 scope; `staff_casino_access` junction table not yet built | Before tenant picker or casino switching is introduced |
| Company admin tooling (merge/delete) | No admin UI exists; deny-by-default RLS + RESTRICT prevents accidental damage | Before any company management feature ships |
| Cross-property audit trail enrichment | No cross-property reads exist yet; audit requirements documented in investigation addendum | Before Phase 3 company-scoped reads launch |
| `app.company_id` in JWT claims | Currently derived from RPC only; JWT claim may be needed for edge caching in Phase 4 | Before any frontend or edge layer reads `company_id` from JWT |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| `company.name` | Plaintext | Display name, not sensitive. Copied from casino name during auto-create. |
| `company.legal_name` | Plaintext (nullable) | Legal entity name, not PII. Nullable for Phase 1 (auto-create sets NULL). |
| `casino.company_id` | UUID FK | Referential integrity. Not sensitive — internal identifier. |
| `app.company_id` (session var) | UUID plaintext | Session-scoped, SET LOCAL (pooler-safe). Not persisted. Derived server-side. |

---

## RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `company` | Denied (deny-by-default) | Denied | Denied | Denied |
| `casino` | Unchanged (existing policies) | Unchanged | Unchanged | Denied |
| `staff` | Unchanged | Unchanged | Unchanged | Denied |

**Phase 1 does not add, remove, or modify any RLS policy.** The `company` table remains fully locked to authenticated role. Only `service_role` and SECURITY DEFINER RPCs can access it.

---

## Merge Criteria (required before approval)

These are enforceable conditions, not declarations. Each must be verified by the stated mechanism before the Phase 1 PR merges.

| # | Criterion | Verified by |
|---|-----------|-------------|
| M1 | All assets classified | This document (review) |
| M2 | All threats have controls or explicit deferral | This document (review) |
| M3 | Sensitive fields have storage justification | This document (review) |
| M4 | RLS unchanged (company = deny-by-default; casino/staff = existing policies) | Migration diff: no `CREATE POLICY` or `ALTER POLICY` statements |
| M5 | No plaintext storage of secrets | Migration diff: no secret columns added |
| M6 | `app.company_id` derived server-side only (ADR-024 INV-8) | Migration diff: `set_rls_context_from_staff()` derives via JOIN, no RPC parameter for `company_id` |
| M7 | No RLS policy references `app.company_id` | CI security gate: grep all policies, fail if `app.company_id` found |
| M8 | FK hardened to `ON DELETE RESTRICT` | Migration diff: `ALTER TABLE casino ADD CONSTRAINT ... ON DELETE RESTRICT` |
| M9 | Bootstrap audit payload includes `company_id` | Migration diff: audit_log INSERT in `rpc_bootstrap_casino` includes `company_id` field |
| M10 | Backfill leaves zero NULL `company_id` rows | Post-migration query: `SELECT count(*) FROM casino WHERE company_id IS NULL` = 0 |
| M11 | Context derivation fails closed | Integration test: RPC errors on missing company row, no stale context set |
| M12 | `RLSContext.companyId` is required (not optional) | TypeScript compilation: `companyId` is non-optional in `RLSContext` interface |
| M13 | All context propagation paths set `company_id` | Integration test: `injectRLSContext()` returns non-null `companyId` for all active staff |
